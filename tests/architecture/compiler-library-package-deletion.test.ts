import assert from 'node:assert/strict'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

import { generateCompilerLibraryRegistry } from '../../scripts/lib/compiler-library-registry.ts'

const fixtureRoot = resolve('dist/test-tmp/compiler-library-package-deletion')
const outputRoot = resolve(fixtureRoot, 'dist/compiler-libraries')

test('deleting a package removes it from generated registry and native plan', async () => {
  await createFixture()
  await generateCompilerLibraryRegistry(fixtureRoot, outputRoot)

  const before = await readGeneratedPlans()
  assert.match(before.manifest, /node:os/)
  assert.match(before.manifest, /node:path/)
  assert.match(before.nativePlan, /stdlib\/node\/os\/src\/os\.cc/)

  await rm(resolve(fixtureRoot, 'stdlib/node/os'), { recursive: true, force: true })
  await generateCompilerLibraryRegistry(fixtureRoot, outputRoot)

  const after = await readGeneratedPlans()
  assert.doesNotMatch(after.manifest, /node:os/)
  assert.match(after.manifest, /node:path/)
  assert.doesNotMatch(after.nativePlan, /stdlib\/node\/os/)
})

async function createFixture(): Promise<void> {
  await rm(fixtureRoot, { recursive: true, force: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/global/console'), { recursive: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/node/os/src'), { recursive: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/node/os/include'), { recursive: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/node/path'), { recursive: true })
  await writeFile(resolve(fixtureRoot, 'stdlib/node/os/index.d.ts'), 'export function platform(): string;\n')
  await writeFile(resolve(fixtureRoot, 'stdlib/node/os/src/os.cc'), 'int os_fixture = 0;\n')
  await writeFile(resolve(fixtureRoot, 'stdlib/node/path/index.d.ts'), 'export function join(): string;\n')
}

async function readGeneratedPlans(): Promise<{ manifest: string; nativePlan: string }> {
  return {
    manifest: await readFile(resolve(outputRoot, 'default-registry.json'), 'utf8'),
    nativePlan: await readFile(resolve(outputRoot, 'native-plan.json'), 'utf8')
  }
}
