import assert from 'node:assert/strict'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { renderCompilerLibraryRegistry } from '../../scripts/lib/compiler-library-registry.ts'

test('entrypoint package node:stream владеет diagnostic compiler contract', async () => {
  const discovered = await discoverCompilerLibraries()
  const streamPackage = discovered.find((library) => library.id === 'node:stream')

  assert.ok(streamPackage)
  assert.equal(streamPackage.compilerEntrypoint, 'stdlib/node/stream/compiler/index.ts')
  assert.ok(streamPackage.compilerPackage)
  assert.equal(streamPackage.compilerPackage.id, 'node:stream')
  assert.deepEqual(streamPackage.compilerPackage.dependencies, [])
  assert.deepEqual(streamPackage.compilerPackage.nativeTypes ?? [], [])
  assert.deepEqual(streamPackage.compilerPackage.runtimeRequirements, [])
  assert.deepEqual(streamPackage.nativeSources, [])
  assert.deepEqual(streamPackage.nativeIncludeDirs, [])

  const rendered = renderCompilerLibraryRegistry(discovered)

  assert.match(
    rendered.registrySource,
    /stdlib\/node\/stream\/compiler\/index\.ts/
  )
  assert.match(
    rendered.manifestSource,
    /"compilerEntrypoint": "stdlib\/node\/stream\/compiler\/index\.ts"/
  )
})
