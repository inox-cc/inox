import assert from 'node:assert/strict'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import {
  compilerLibraryNativeTypeForName,
  compilerLibraryOperationForGlobal
} from '../../compiler/extensions/library-set.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import {
  createCompilerLibrarySetFromDiscovered,
  generateCompilerLibraryRegistry
} from '../../scripts/lib/compiler-library-registry.ts'

const fixtureRoot = resolve('dist/test-tmp/compiler-binary-package-deletion')
const outputRoot = resolve(fixtureRoot, 'dist/compiler-libraries')

test('binary package deletion removes only the API and native plan owned by that package', async () => {
  await createFixture()
  await generateCompilerLibraryRegistry(fixtureRoot, outputRoot)

  const before = await generatedSources()
  assert.match(before.manifest, /global:binary/)
  assert.match(before.manifest, /node:buffer/)
  assert.match(before.registry, /stdlib\/global\/binary\/compiler\/index\.ts/)
  assert.match(before.registry, /stdlib\/node\/buffer\/compiler\/index\.ts/)
  assert.match(before.nativePlan, /stdlib\/global\/binary\/src\/binary\.cc/)
  assert.match(before.nativePlan, /stdlib\/node\/buffer\/src\/buffer\.cc/)

  await rm(resolve(fixtureRoot, 'stdlib/node/buffer'), { recursive: true, force: true })
  await generateCompilerLibraryRegistry(fixtureRoot, outputRoot)

  const withoutBuffer = await generatedSources()
  assert.match(withoutBuffer.manifest, /global:binary/)
  assert.doesNotMatch(withoutBuffer.manifest, /node:buffer/)
  assert.match(withoutBuffer.nativePlan, /stdlib\/global\/binary\/src\/binary\.cc/)
  assert.doesNotMatch(withoutBuffer.nativePlan, /stdlib\/node\/buffer/)

  const binaryOnly = createCompilerLibrarySetFromDiscovered(
    await discoverCompilerLibraries(fixtureRoot)
  )
  assert.equal(compilerLibraryOperationForGlobal(binaryOnly, ['Buffer', 'alloc'], 'call'), null)
  assert.equal(compilerLibraryNativeTypeForName(binaryOnly, 'Buffer'), null)
  assert.throws(
    () => compileSource('Buffer.alloc(1)\n', { libraries: binaryOnly }),
    (error: unknown) => error instanceof CompileError && error.diagnostics[0].code === 'INOX_UNKNOWN_NAME'
  )
  assert.ok(compilerLibraryOperationForGlobal(binaryOnly, ['Uint8Array'], 'construct'))
  assert.equal(
    compilerLibraryNativeTypeForName(binaryOnly, 'Uint8Array')?.typeId,
    'global:binary#Uint8Array'
  )

  await rm(resolve(fixtureRoot, 'stdlib/global/binary'), { recursive: true, force: true })
  await generateCompilerLibraryRegistry(fixtureRoot, outputRoot)

  const withoutBinary = await generatedSources()
  assert.doesNotMatch(withoutBinary.manifest, /global:binary/)
  assert.doesNotMatch(withoutBinary.nativePlan, /stdlib\/global\/binary/)

  const empty = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixtureRoot))
  assert.equal(compilerLibraryOperationForGlobal(empty, ['Uint8Array'], 'construct'), null)
  assert.equal(compilerLibraryNativeTypeForName(empty, 'Uint8Array'), null)
  assert.throws(
    () => compileSource('new Uint8Array(1)\n', { libraries: empty }),
    (error: unknown) => error instanceof CompileError && error.diagnostics[0].code === 'INOX_UNKNOWN_NAME'
  )
})

async function createFixture(): Promise<void> {
  await rm(fixtureRoot, { recursive: true, force: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/global/binary/compiler'), { recursive: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/global/binary/src'), { recursive: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/global/binary/include'), { recursive: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/node/buffer/compiler'), { recursive: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/node/buffer/src'), { recursive: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/node/buffer/include'), { recursive: true })
  await writeFile(resolve(fixtureRoot, 'stdlib/global/binary/src/binary.cc'), 'int binary_fixture = 0;\n')
  await writeFile(resolve(fixtureRoot, 'stdlib/node/buffer/src/buffer.cc'), 'int buffer_fixture = 0;\n')
  await writeFile(
    resolve(fixtureRoot, 'stdlib/global/binary/compiler/index.ts'),
    "export const compilerLibraryPackage = { id: 'global:binary', dependencies: [], nativeTypes: [{ libraryId: 'global:binary', typeId: 'global:binary#Uint8Array', declarationNames: ['Uint8Array'], valueType: 'bytes', cppType: 'Uint8Array', baseTypeIds: [], runtimeRequirements: ['global:binary'] }], operations: [{ libraryId: 'global:binary', bindingId: 'global:Uint8Array', operationId: 'global:binary#Uint8Array#construct', kind: 'construct', runtimeRequirements: ['global:binary'], cExpression: 'Uint8Array', cArgumentKinds: ['number'], resultTypeId: 'global:binary#Uint8Array', cppType: 'Uint8Array', valueType: 'bytes' }], intrinsicBindings: [], runtimeRequirements: [{ id: 'global:binary', dependencies: [], cPreludeIncludes: ['inox/binary.h'], capabilities: [] }] }\n"
  )
  await writeFile(
    resolve(fixtureRoot, 'stdlib/node/buffer/index.d.ts'),
    'export declare class Buffer extends Uint8Array { static alloc(size: number): Buffer; }\n'
  )
  await writeFile(
    resolve(fixtureRoot, 'stdlib/node/buffer/compiler/index.ts'),
    "export const compilerLibraryPackage = { id: 'node:buffer', dependencies: ['global:binary'], nativeTypes: [{ libraryId: 'node:buffer', typeId: 'node:buffer#Buffer', declarationNames: ['Buffer'], valueType: 'bytes', cppType: 'Buffer', baseTypeIds: ['global:binary#Uint8Array'], runtimeRequirements: ['global:binary', 'node:buffer'] }], operations: [{ libraryId: 'node:buffer', bindingId: 'global:Buffer.alloc', operationId: 'node:buffer#Buffer.alloc', kind: 'call', runtimeRequirements: ['node:buffer'], cExpression: 'Buffer::alloc', cArgumentKinds: ['number'], resultTypeId: 'node:buffer#Buffer', cppType: 'Buffer', valueType: 'bytes' }], intrinsicBindings: [], runtimeRequirements: [{ id: 'node:buffer', dependencies: ['global:binary'], cPreludeIncludes: ['inox/buffer.h'], capabilities: [] }] }\n"
  )
}

async function generatedSources(): Promise<{
  manifest: string
  nativePlan: string
  registry: string
}> {
  return {
    manifest: await readFile(resolve(outputRoot, 'default-registry.json'), 'utf8'),
    nativePlan: await readFile(resolve(outputRoot, 'native-plan.json'), 'utf8'),
    registry: await readFile(resolve(outputRoot, 'default-registry.ts'), 'utf8')
  }
}
