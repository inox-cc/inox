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

const fixtureRoot = resolve('dist/test-tmp/compiler-node-path-package-deletion')
const outputRoot = resolve(fixtureRoot, 'dist/compiler-libraries')

test('удаление node:path убирает declaration, operations и native plan', async () => {
  await createFixture()
  await generateCompilerLibraryRegistry(fixtureRoot, outputRoot)

  const before = await generatedSources()
  assert.match(before.registry, /stdlib\/node\/path\/compiler\/index\.ts/)
  assert.match(before.nativePlan, /stdlib\/node\/path\/src\/path\.cc/)
  assert.match(before.nativePlanCMake, /stdlib\/node\/path\/src\/path\.cc/)
  assert.match(before.manifest, /node:path/)
  assert.match(before.manifest, /node:os/)

  await rm(resolve(fixtureRoot, 'stdlib/node/path'), { recursive: true, force: true })
  await generateCompilerLibraryRegistry(fixtureRoot, outputRoot)

  const after = await generatedSources()
  assert.doesNotMatch(after.registry, /node:path/)
  assert.doesNotMatch(after.nativePlan, /stdlib\/node\/path/)
  assert.doesNotMatch(after.nativePlanCMake, /stdlib\/node\/path/)
  assert.doesNotMatch(after.manifest, /node:path/)
  assert.match(after.manifest, /node:os/)

  const libraries = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixtureRoot))

  assert.throws(
    () => compileSource("import { join } from 'node:path'\njoin('a', 'b')\n", { libraries }),
    (error: unknown) =>
      error instanceof CompileError &&
      error.diagnostics[0].code === 'INOX_UNSUPPORTED_IMPORT_SOURCE'
  )
})

async function createFixture(): Promise<void> {
  await rm(fixtureRoot, { recursive: true, force: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/global'), { recursive: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/node/path/compiler'), { recursive: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/node/path/src'), { recursive: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/node/path/include'), { recursive: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/node/os'), { recursive: true })
  await writeFile(resolve(fixtureRoot, 'stdlib/node/path/index.d.ts'), 'export function join(...paths: string[]): string;\n')
  await writeFile(resolve(fixtureRoot, 'stdlib/node/path/src/path.cc'), 'int path_fixture = 0;\n')
  await writeFile(
    resolve(fixtureRoot, 'stdlib/node/path/compiler/index.ts'),
    "export const compilerLibraryPackage = { id: 'node:path', dependencies: [], operations: [{ libraryId: 'node:path', bindingId: 'node:path#module:node:path:join', operationId: 'node:path#join', kind: 'call', runtimeRequirements: [] }], intrinsicBindings: [], runtimeRequirements: [] }\n"
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
