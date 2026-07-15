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

const fixtureRoot = resolve('dist/test-tmp/compiler-node-child-process-package-deletion')
const outputRoot = resolve(fixtureRoot, 'dist/compiler-libraries')

test('удаление node:child_process убирает declaration, operations и native plan', async () => {
  await createFixture()
  await generateCompilerLibraryRegistry(fixtureRoot, outputRoot)

  const before = await generatedSources()
  assert.match(before.registry, /stdlib\/node\/child_process\/compiler\/index\.ts/)
  assert.match(before.nativePlan, /stdlib\/node\/child_process\/src\/child_process\.cc/)
  assert.match(before.nativePlanCMake, /stdlib\/node\/child_process\/src\/child_process\.cc/)
  assert.match(before.manifest, /node:child_process/)
  assert.match(before.manifest, /node:os/)

  await rm(resolve(fixtureRoot, 'stdlib/node/child_process'), { recursive: true, force: true })
  await generateCompilerLibraryRegistry(fixtureRoot, outputRoot)

  const after = await generatedSources()
  assert.doesNotMatch(after.registry, /node:child_process/)
  assert.doesNotMatch(after.nativePlan, /stdlib\/node\/child_process/)
  assert.doesNotMatch(after.nativePlanCMake, /stdlib\/node\/child_process/)
  assert.doesNotMatch(after.manifest, /node:child_process/)
  assert.match(after.manifest, /node:os/)

  const libraries = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixtureRoot))

  assert.throws(
    () =>
      compileSource("import { execSync } from 'node:child_process'\nexecSync('printf hi', { encoding: 'utf8' })\n", {
        libraries
      }),
    (error: unknown) => error instanceof CompileError && error.diagnostics[0].code === 'INOX_NOT_IMPLEMENTED'
  )
})

async function createFixture(): Promise<void> {
  await rm(fixtureRoot, { recursive: true, force: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/global'), { recursive: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/node/child_process/compiler'), { recursive: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/node/child_process/src'), { recursive: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/node/child_process/include'), { recursive: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/node/os'), { recursive: true })
  await writeFile(
    resolve(fixtureRoot, 'stdlib/node/child_process/index.d.ts'),
    'export function execSync(command: string, options: object): string;\n'
  )
  await writeFile(
    resolve(fixtureRoot, 'stdlib/node/child_process/src/child_process.cc'),
    'int child_process_fixture = 0;\n'
  )
  await writeFile(
    resolve(fixtureRoot, 'stdlib/node/child_process/compiler/index.ts'),
    "export const compilerLibraryPackage = { id: 'node:child_process', dependencies: [], operations: [{ libraryId: 'node:child_process', bindingId: 'node:child_process#module:node:child_process:execSync', operationId: 'node:child_process#execSync', kind: 'call', runtimeRequirements: [] }], intrinsicBindings: [], runtimeRequirements: [] }\n"
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
