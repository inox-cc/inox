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

const fixtureRoot = resolve('dist/test-tmp/compiler-node-url-package-deletion')
const outputRoot = resolve(fixtureRoot, 'dist/compiler-libraries')

test('удаление node:url убирает declaration, operations и native plan', async () => {
  await createFixture()
  await generateCompilerLibraryRegistry(fixtureRoot, outputRoot)

  const before = await generatedSources()
  assert.match(before.registry, /stdlib\/node\/url\/compiler\/index\.ts/)
  assert.match(before.nativePlan, /stdlib\/node\/url\/src\/url\.cc/)
  assert.match(before.nativePlanCMake, /stdlib\/node\/url\/src\/url\.cc/)
  assert.match(before.manifest, /node:url/)
  assert.match(before.manifest, /node:os/)

  await rm(resolve(fixtureRoot, 'stdlib/node/url'), { recursive: true, force: true })
  await generateCompilerLibraryRegistry(fixtureRoot, outputRoot)

  const after = await generatedSources()
  assert.doesNotMatch(after.registry, /node:url/)
  assert.doesNotMatch(after.nativePlan, /stdlib\/node\/url/)
  assert.doesNotMatch(after.nativePlanCMake, /stdlib\/node\/url/)
  assert.doesNotMatch(after.manifest, /node:url/)
  assert.match(after.manifest, /node:os/)

  const libraries = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixtureRoot))

  assert.throws(
    () => compileSource("import { pathToFileURL } from 'node:url'\npathToFileURL('/tmp/a')\n", { libraries }),
    (error: unknown) =>
      error instanceof CompileError &&
      error.diagnostics[0].code === 'INOX_UNSUPPORTED_IMPORT_SOURCE'
  )
})

async function createFixture(): Promise<void> {
  await rm(fixtureRoot, { recursive: true, force: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/global'), { recursive: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/node/url/compiler'), { recursive: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/node/url/src'), { recursive: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/node/url/include'), { recursive: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/node/os'), { recursive: true })
  await writeFile(resolve(fixtureRoot, 'stdlib/node/url/index.d.ts'), 'export function pathToFileURL(path: string): object;\n')
  await writeFile(resolve(fixtureRoot, 'stdlib/node/url/src/url.cc'), 'int url_fixture = 0;\n')
  await writeFile(
    resolve(fixtureRoot, 'stdlib/node/url/compiler/index.ts'),
    "export const compilerLibraryPackage = { id: 'node:url', dependencies: [], operations: [{ libraryId: 'node:url', bindingId: 'node:url#module:node:url:pathToFileURL', operationId: 'node:url#pathToFileURL', kind: 'call', runtimeRequirements: ['node:url'] }], intrinsicBindings: [], runtimeRequirements: [{ id: 'node:url', dependencies: [], cPreludeIncludes: [], capabilities: [] }] }\n"
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
