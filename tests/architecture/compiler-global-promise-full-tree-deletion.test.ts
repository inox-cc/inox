import assert from 'node:assert/strict'
import { cp, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

const fixture = resolve('dist/test-tmp/compiler-global-promise-full-tree-deletion')

test('deleting global:promise reports a dependency diagnostic for real dependents', async () => {
  await rm(fixture, { recursive: true, force: true })
  await cp(resolve('stdlib'), resolve(fixture, 'stdlib'), { recursive: true })

  const baseline = await discoverCompilerLibraries(fixture)
  const expectedDependents = baseline
    .filter((library) => library.compilerPackage?.dependencies.includes('global:promise'))
    .map((library) => library.id)

  await rm(resolve(fixture, 'stdlib/global/promise'), { recursive: true })

  const discovered = await discoverCompilerLibraries(fixture)
  const libraryIds = discovered.map((library) => library.id)
  const nativeSources = discovered.flatMap((library) => library.nativeSources)
  const dependents = discovered
    .filter((library) => library.compilerPackage?.dependencies.includes('global:promise'))
    .map((library) => library.id)

  assert.ok(!libraryIds.includes('global:promise'))
  assert.ok(expectedDependents.length > 0)
  assert.deepEqual(dependents, expectedDependents)
  assert.ok(nativeSources.every((source) => !source.startsWith('stdlib/global/promise/')))

  const math = discovered.find((library) => library.id === 'global:math')
  assert.ok(math)
  assert.doesNotThrow(() => createCompilerLibrarySetFromDiscovered([math]))
  assert.throws(
    () => createCompilerLibrarySetFromDiscovered(discovered),
    /Missing compiler library dependency global:fetch -> global:promise/
  )
})
