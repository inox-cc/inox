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

const fixtureRoot = resolve('dist/test-tmp/compiler-node-process-package-deletion')
const outputRoot = resolve(fixtureRoot, 'dist/compiler-libraries')

test('удаление node:process убирает global knowledge, operations и native plan', async () => {
  await createFixture()
  await generateCompilerLibraryRegistry(fixtureRoot, outputRoot)

  const before = await generatedSources()
  assert.match(before.registry, /stdlib\/node\/process\/compiler\/index\.ts/)
  assert.match(before.nativePlan, /stdlib\/node\/process\/src\/process\.cc/)
  assert.match(before.nativePlanCMake, /stdlib\/node\/process\/src\/process\.cc/)
  assert.match(before.manifest, /node:process/)
  assert.match(before.manifest, /node:os/)

  await rm(resolve(fixtureRoot, 'stdlib/node/process'), { recursive: true, force: true })
  await generateCompilerLibraryRegistry(fixtureRoot, outputRoot)

  const after = await generatedSources()
  assert.doesNotMatch(after.registry, /node:process/)
  assert.doesNotMatch(after.nativePlan, /stdlib\/node\/process/)
  assert.doesNotMatch(after.nativePlanCMake, /stdlib\/node\/process/)
  assert.doesNotMatch(after.manifest, /node:process/)
  assert.match(after.manifest, /node:os/)

  const libraries = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixtureRoot))

  assert.throws(
    () => compileSource('console.log(process.version)\n', { libraries }),
    (error: unknown) =>
      error instanceof CompileError && error.diagnostics[0].code === 'INOX_UNKNOWN_NAME'
  )
})

async function createFixture(): Promise<void> {
  await rm(fixtureRoot, { recursive: true, force: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/global'), { recursive: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/node/process/compiler'), { recursive: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/node/process/src'), { recursive: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/node/process/include'), { recursive: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/node/os'), { recursive: true })
  await writeFile(
    resolve(fixtureRoot, 'stdlib/node/process/index.d.ts'),
    'declare const process: { readonly version: string }; export default process;\n'
  )
  await writeFile(
    resolve(fixtureRoot, 'stdlib/node/process/src/process.cc'),
    'int process_fixture = 0;\n'
  )
  await writeFile(
    resolve(fixtureRoot, 'stdlib/node/process/compiler/index.ts'),
    "export const compilerLibraryPackage = { id: 'node:process', dependencies: [], operations: [{ libraryId: 'node:process', bindingId: 'global:process', bindingAliases: ['node:process#module:node:process:default'], operationId: 'node:process#process', kind: 'member-read', runtimeRequirements: ['node:process'], cExpression: 'process', cppType: 'inox::Value', valueType: 'object' }], intrinsicBindings: [], runtimeRequirements: [{ id: 'node:process', dependencies: [], cPreludeIncludes: ['inox/process.h'], capabilities: [], cEntrypointAdapter: { cFunction: 'inox::process_main', acceptsEntryPath: true } }] }\n"
  )
  await writeFile(resolve(fixtureRoot, 'stdlib/node/os/index.d.ts'), 'export function platform(): string;\n')
}

async function generatedSources(): Promise<{
  manifest: string
  nativePlan: string
  nativePlanCMake: string
  registry: string
}> {
  return {
    manifest: await readFile(resolve(outputRoot, 'default-registry.json'), 'utf8'),
    nativePlan: await readFile(resolve(outputRoot, 'native-plan.json'), 'utf8'),
    nativePlanCMake: await readFile(resolve(outputRoot, 'native-plan.cmake'), 'utf8'),
    registry: await readFile(resolve(outputRoot, 'default-registry.ts'), 'utf8')
  }
}
