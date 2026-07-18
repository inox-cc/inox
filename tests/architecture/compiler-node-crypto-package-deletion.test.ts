import assert from 'node:assert/strict'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import {
  createCompilerLibrarySetFromDiscovered,
  generateCompilerLibraryRegistry
} from '../../scripts/lib/compiler-library-registry.ts'

const fixtureRoot = resolve('dist/test-tmp/compiler-node-crypto-package-deletion')
const outputRoot = resolve(fixtureRoot, 'dist/compiler-libraries')

test('удаление crypto packages убирает module/global API и native plan без central edit', async () => {
  await createFixture()
  await generateCompilerLibraryRegistry(fixtureRoot, outputRoot)

  const before = await generatedSources()
  assert.match(before.registry, /stdlib\/global\/crypto\/compiler\/index\.ts/)
  assert.match(before.registry, /stdlib\/node\/crypto\/compiler\/index\.ts/)
  assert.match(before.nativePlan, /stdlib\/global\/crypto\/src\/crypto\.cc/)
  assert.doesNotMatch(before.nativePlan, /stdlib\/node\/crypto\/src/)

  await rm(resolve(fixtureRoot, 'stdlib/node/crypto'), { recursive: true, force: true })
  await generateCompilerLibraryRegistry(fixtureRoot, outputRoot)

  const withoutNode = await generatedSources()
  assert.doesNotMatch(withoutNode.registry, /node:crypto/)
  assert.match(withoutNode.registry, /stdlib\/global\/crypto\/compiler\/index\.ts/)
  assert.match(withoutNode.nativePlan, /stdlib\/global\/crypto\/src\/crypto\.cc/)

  const globalOnly = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixtureRoot))
  assert.throws(
    () => compileSource("import { randomBytes } from 'node:crypto'\nrandomBytes(4)\n", { libraries: globalOnly }),
    (error: unknown) => error instanceof CompileError && error.diagnostics[0].code === 'INOX_UNSUPPORTED_IMPORT_SOURCE'
  )

  await rm(resolve(fixtureRoot, 'stdlib/global/crypto'), { recursive: true, force: true })
  await generateCompilerLibraryRegistry(fixtureRoot, outputRoot)

  const withoutCrypto = await generatedSources()
  assert.doesNotMatch(withoutCrypto.registry, /crypto/)
  assert.doesNotMatch(withoutCrypto.nativePlan, /crypto/)

  const empty = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixtureRoot))
  assert.throws(
    () => compileSource('crypto.getRandomValues(new Uint8Array(4))\n', { libraries: empty }),
    (error: unknown) => error instanceof CompileError && error.diagnostics[0].code === 'INOX_UNKNOWN_NAME'
  )
})

async function createFixture(): Promise<void> {
  await rm(fixtureRoot, { recursive: true, force: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/global/crypto/compiler'), { recursive: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/global/crypto/src'), { recursive: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/global/crypto/include'), { recursive: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/global/binary/compiler'), { recursive: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/node/crypto/compiler'), { recursive: true })
  await writeFile(
    resolve(fixtureRoot, 'stdlib/global/binary/index.d.ts'),
    'export {}; declare global { class Uint8Array { constructor(length: number); } }\n'
  )
  await writeFile(
    resolve(fixtureRoot, 'stdlib/global/binary/compiler/index.ts'),
    "export const compilerLibraryPackage = { id: 'global:binary', dependencies: [], operations: [], intrinsicBindings: [], runtimeRequirements: [] }\n"
  )
  await writeFile(resolve(fixtureRoot, 'stdlib/global/crypto/src/crypto.cc'), 'int crypto_fixture = 0;\n')
  await writeFile(
    resolve(fixtureRoot, 'stdlib/global/crypto/index.d.ts'),
    'export {}; declare global { interface Crypto { getRandomValues(bytes: Uint8Array): Uint8Array; } const crypto: Crypto; }\n'
  )
  await writeFile(
    resolve(fixtureRoot, 'stdlib/global/crypto/compiler/index.ts'),
    "export const compilerLibraryPackage = { id: 'global:crypto', dependencies: [], operations: [{ libraryId: 'global:crypto', bindingId: 'global:crypto.getRandomValues', operationId: 'global:crypto#getRandomValues', kind: 'call', runtimeRequirements: ['global:crypto'], cExpression: 'crypto.getRandomValues', cArgumentKinds: ['value'], cppType: 'Uint8Array', valueType: 'bytes' }], intrinsicBindings: [], runtimeRequirements: [{ id: 'global:crypto', dependencies: [], cPreludeIncludes: ['inox/crypto.h'], capabilities: ['entropy'] }] }\n"
  )
  await writeFile(
    resolve(fixtureRoot, 'stdlib/node/crypto/index.d.ts'),
    'export function randomBytes(size: number): Uint8Array;\n'
  )
  await writeFile(
    resolve(fixtureRoot, 'stdlib/node/crypto/compiler/index.ts'),
    "export const compilerLibraryPackage = { id: 'node:crypto', dependencies: ['global:crypto'], operations: [{ libraryId: 'node:crypto', bindingId: 'node:crypto#module:node:crypto:randomBytes', operationId: 'node:crypto#randomBytes', kind: 'call', runtimeRequirements: ['node:crypto'], cExpression: 'crypto.randomBytes', cArgumentKinds: ['number'], cppType: 'Buffer', valueType: 'bytes' }], intrinsicBindings: [], runtimeRequirements: [{ id: 'node:crypto', dependencies: [], cPreludeIncludes: ['inox/crypto.h'], capabilities: [] }] }\n"
  )
}

async function generatedSources(): Promise<{ nativePlan: string; registry: string }> {
  return {
    nativePlan: await readFile(resolve(outputRoot, 'native-plan.json'), 'utf8'),
    registry: await readFile(resolve(outputRoot, 'default-registry.ts'), 'utf8')
  }
}
