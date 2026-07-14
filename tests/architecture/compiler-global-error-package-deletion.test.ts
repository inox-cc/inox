import assert from 'node:assert/strict'
import { cp, mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

import { compilerLibraryNativeTypeForName } from '../../compiler/extensions/library-set.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import {
  createCompilerLibrarySetFromDiscovered,
  generateCompilerLibraryRegistry
} from '../../scripts/lib/compiler-library-registry.ts'

const fixtureRoot = resolve('dist/test-tmp/compiler-global-error-package-deletion')
const outputRoot = resolve(fixtureRoot, 'dist/compiler-libraries')

test('удаление global:error удаляет принадлежащую package Error identity', async () => {
  await createFixture()
  await generateCompilerLibraryRegistry(fixtureRoot, outputRoot)

  const before = await librarySet()
  assert.equal(compilerLibraryNativeTypeForName(before, 'Error')?.typeId, 'global:error#Error')

  await rm(resolve(fixtureRoot, 'stdlib/global/error'), { recursive: true, force: true })
  await generateCompilerLibraryRegistry(fixtureRoot, outputRoot)

  const after = await librarySet()
  assert.equal(compilerLibraryNativeTypeForName(after, 'Error'), null)
})

async function createFixture(): Promise<void> {
  await rm(fixtureRoot, { recursive: true, force: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/global'), { recursive: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/node'), { recursive: true })
  await cp(resolve('stdlib/global/error'), resolve(fixtureRoot, 'stdlib/global/error'), {
    recursive: true
  })
}

async function librarySet() {
  return createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixtureRoot))
}
