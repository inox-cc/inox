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

const fixtureRoot = resolve('dist/test-tmp/compiler-library-package-deletion')
const outputRoot = resolve(fixtureRoot, 'dist/compiler-libraries')

test('удаление package убирает его из generated registry и native plan', async () => {
  await createFixture()
  await generateCompilerLibraryRegistry(fixtureRoot, outputRoot)

  const before = await readGeneratedPlans()
  assert.match(before.manifest, /node:os/)
  assert.match(before.manifest, /node:path/)
  assert.match(before.nativePlan, /stdlib\/node\/os\/src\/os\.cc/)
  assert.match(before.nativePlanCMake, /stdlib\/node\/os\/src\/os\.cc/)
  assert.match(before.registry, /stdlib\/node\/os\/compiler\/index\.ts/)
  assert.match(before.registry, /compilerLibraryPackage0\.operations\[0\]/)

  await rm(resolve(fixtureRoot, 'stdlib/node/os'), { recursive: true, force: true })
  await generateCompilerLibraryRegistry(fixtureRoot, outputRoot)

  const after = await readGeneratedPlans()
  assert.doesNotMatch(after.manifest, /node:os/)
  assert.match(after.manifest, /node:path/)
  assert.doesNotMatch(after.nativePlan, /stdlib\/node\/os/)
  assert.doesNotMatch(after.nativePlanCMake, /stdlib\/node\/os/)
  assert.doesNotMatch(after.registry, /stdlib\/node\/os/)
  assert.doesNotMatch(after.registry, /fixture:node:os#platform/)

  const libraries = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixtureRoot))

  assert.throws(
    () => compileSource("import { platform } from 'node:os'\nplatform()\n", { libraries }),
    (error: unknown) =>
      error instanceof CompileError &&
      error.diagnostics[0].code === 'INOX_NOT_IMPLEMENTED' &&
      error.diagnostics[0].message.startsWith('node:os ')
  )
})

async function createFixture(): Promise<void> {
  await rm(fixtureRoot, { recursive: true, force: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/global/console'), { recursive: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/node/os/src'), { recursive: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/node/os/include'), { recursive: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/node/os/compiler'), { recursive: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/node/path'), { recursive: true })
  await writeFile(resolve(fixtureRoot, 'stdlib/node/os/index.d.ts'), 'export function platform(): string;\n')
  await writeFile(resolve(fixtureRoot, 'stdlib/node/os/src/os.cc'), 'int os_fixture = 0;\n')
  await writeFile(
    resolve(fixtureRoot, 'stdlib/node/os/compiler/index.ts'),
    "export const compilerLibraryPackage = { id: 'node:os', dependencies: [], operations: [{ libraryId: 'node:os', bindingId: 'fixture:node:os:platform', operationId: 'fixture:node:os#platform', kind: 'call', runtimeRequirements: [] }], intrinsicBindings: [], runtimeRequirements: [] }\n"
  )
  await writeFile(resolve(fixtureRoot, 'stdlib/node/path/index.d.ts'), 'export function join(): string;\n')
}

async function readGeneratedPlans(): Promise<{
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
