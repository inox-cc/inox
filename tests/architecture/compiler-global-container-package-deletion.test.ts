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

const fixtureRoot = resolve('dist/test-tmp/compiler-global-container-package-deletion')
const outputRoot = resolve(fixtureRoot, 'dist/compiler-libraries')

test('удаление container package удаляет только принадлежащую ему native identity', async () => {
  await createFixture()
  await generateCompilerLibraryRegistry(fixtureRoot, outputRoot)

  const before = await librarySet()
  assert.equal(compilerLibraryNativeTypeForName(before, 'Array')?.typeId, 'global:collections#Array')
  assert.equal(compilerLibraryNativeTypeForName(before, 'Promise')?.typeId, 'global:promise#Promise')

  await rm(resolve(fixtureRoot, 'stdlib/global/promise'), { recursive: true, force: true })
  await generateCompilerLibraryRegistry(fixtureRoot, outputRoot)

  const withoutPromise = await librarySet()
  assert.equal(compilerLibraryNativeTypeForName(withoutPromise, 'Promise'), null)
  assert.equal(compilerLibraryNativeTypeForName(withoutPromise, 'Array')?.typeId, 'global:collections#Array')

  await rm(resolve(fixtureRoot, 'stdlib/global/collections'), { recursive: true, force: true })
  await generateCompilerLibraryRegistry(fixtureRoot, outputRoot)

  const empty = await librarySet()
  assert.equal(compilerLibraryNativeTypeForName(empty, 'Array'), null)
  assert.equal(compilerLibraryNativeTypeForName(empty, 'Promise'), null)
})

async function createFixture(): Promise<void> {
  await rm(fixtureRoot, { recursive: true, force: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/global'), { recursive: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/node'), { recursive: true })
  await cp(resolve('stdlib/global/collections'), resolve(fixtureRoot, 'stdlib/global/collections'), { recursive: true })
  await cp(resolve('stdlib/global/promise'), resolve(fixtureRoot, 'stdlib/global/promise'), { recursive: true })
}

async function librarySet() {
  return createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixtureRoot))
}
