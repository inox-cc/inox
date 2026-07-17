import assert from 'node:assert/strict'
import { cp, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

const fixture = resolve('dist/test-tmp/compiler-global-collections-full-tree-deletion')

test('физическое удаление global:collections из полного stdlib даёт dependency diagnostic', async () => {
  await rm(fixture, { recursive: true, force: true })
  await cp(resolve('stdlib'), resolve(fixture, 'stdlib'), { recursive: true })
  await rm(resolve(fixture, 'stdlib/global/collections'), { recursive: true })

  const discovered = await discoverCompilerLibraries(fixture)
  const libraryIds = discovered.map((library) => library.id)
  const nativeSources = discovered.flatMap((library) => library.nativeSources)

  assert.ok(!libraryIds.includes('global:collections'))
  assert.ok(libraryIds.includes('global:math'))
  assert.ok(nativeSources.every((source) => !source.startsWith('stdlib/global/collections/')))

  const math = discovered.find((library) => library.id === 'global:math')
  assert.ok(math)
  assert.doesNotThrow(() => createCompilerLibrarySetFromDiscovered([math]))
  assert.throws(
    () => createCompilerLibrarySetFromDiscovered(discovered),
    /Missing compiler library dependency global:binary -> global:collections/
  )
})
