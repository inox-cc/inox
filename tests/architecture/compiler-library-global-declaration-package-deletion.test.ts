import assert from 'node:assert/strict'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { generateCompilerLibraryRegistry } from '../../scripts/lib/compiler-library-registry.ts'

const fixtureRoot = resolve('dist/test-tmp/compiler-library-global-declaration-package-deletion')
const outputRoot = resolve(fixtureRoot, 'dist/compiler-libraries')

test('удаление global package убирает ambient declaration, operation и native plan', async () => {
  await createFixture()
  await generateCompilerLibraryRegistry(fixtureRoot, outputRoot)

  const before = await generatedSources()
  assert.match(before.registry, /declare global/)
  assert.match(before.registry, /stdlib\/global\/bridge\/compiler\/index\.ts/)
  assert.match(before.registry, /compilerLibraryPackage0\.operations\[0\]/)
  assert.match(before.nativePlan, /stdlib\/global\/bridge\/src\/bridge\.cc/)

  await rm(resolve(fixtureRoot, 'stdlib/global/bridge'), { recursive: true, force: true })
  await generateCompilerLibraryRegistry(fixtureRoot, outputRoot)

  const after = await generatedSources()
  assert.doesNotMatch(after.registry, /global:bridge/)
  assert.doesNotMatch(after.registry, /declare global/)
  assert.doesNotMatch(after.nativePlan, /stdlib\/global\/bridge/)
  assert.equal((await discoverCompilerLibraries(fixtureRoot)).length, 0)
})

async function createFixture(): Promise<void> {
  await rm(fixtureRoot, { recursive: true, force: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/global/bridge/compiler'), { recursive: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/global/bridge/src'), { recursive: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/node'), { recursive: true })
  await writeFile(
    resolve(fixtureRoot, 'stdlib/global/bridge/index.d.ts'),
    'export {}; declare global { function bridge(value: number): string; }\n'
  )
  await writeFile(resolve(fixtureRoot, 'stdlib/global/bridge/src/bridge.cc'), 'int bridge_fixture = 0;\n')
  await writeFile(
    resolve(fixtureRoot, 'stdlib/global/bridge/compiler/index.ts'),
    "export const compilerLibraryPackage = { id: 'global:bridge', dependencies: [], operations: [{ libraryId: 'global:bridge', bindingId: 'global:bridge', operationId: 'global:bridge#call', kind: 'call', runtimeRequirements: [], cExpression: 'bridge' }], intrinsicBindings: [], runtimeRequirements: [] }\n"
  )
}

async function generatedSources(): Promise<{ registry: string; nativePlan: string }> {
  return {
    registry: await readFile(resolve(outputRoot, 'default-registry.ts'), 'utf8'),
    nativePlan: await readFile(resolve(outputRoot, 'native-plan.json'), 'utf8')
  }
}
