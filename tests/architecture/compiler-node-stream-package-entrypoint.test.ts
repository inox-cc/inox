import assert from 'node:assert/strict'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { renderCompilerLibraryRegistry } from '../../scripts/lib/compiler-library-registry.ts'

test('entrypoint package node:stream владеет native API и runtime plan', async () => {
  const discovered = await discoverCompilerLibraries()
  const streamPackage = discovered.find((library) => library.id === 'node:stream')

  assert.ok(streamPackage)
  assert.equal(streamPackage.compilerEntrypoint, 'stdlib/node/stream/compiler/index.ts')
  assert.ok(streamPackage.compilerPackage)
  assert.equal(streamPackage.compilerPackage.id, 'node:stream')
  assert.deepEqual(streamPackage.compilerPackage.dependencies, ['node:buffer', 'node:events'])
  assert.deepEqual(streamPackage.nativeSources, ['stdlib/node/stream/src/stream.cc'])
  assert.deepEqual(streamPackage.nativeIncludeDirs, ['stdlib/node/stream/include'])

  const nativeTypes = streamPackage.compilerPackage.nativeTypes ?? []
  assert.deepEqual(
    nativeTypes.map((nativeType) => nativeType.typeId),
    [
      'node:stream#Stream',
      'node:stream#Readable',
      'node:stream#Writable',
      'node:stream#Duplex',
      'node:stream#Transform',
      'node:stream#PassThrough'
    ]
  )
  assert.deepEqual(nativeTypes[0]?.baseTypeIds, ['node:events#EventEmitter'])
  assert.deepEqual(nativeTypes[3]?.baseTypeIds, ['node:stream#Readable', 'node:stream#Writable'])
  assert.deepEqual(nativeTypes[5]?.baseTypeIds, ['node:stream#Transform'])

  const runtime = streamPackage.compilerPackage.runtimeRequirements[0]
  assert.equal(runtime?.id, 'node:stream')
  assert.deepEqual(runtime?.cPreludeIncludes, ['inox/stream.h'])
  assert.deepEqual(runtime?.dependencies, [
    'callback-values',
    'managed-values',
    'node:buffer',
    'node:events',
    'objects',
    'string-bytes'
  ])

  const rendered = renderCompilerLibraryRegistry(discovered)

  assert.match(rendered.registrySource, /stdlib\/node\/stream\/compiler\/index\.ts/)
  assert.match(rendered.manifestSource, /"compilerEntrypoint": "stdlib\/node\/stream\/compiler\/index\.ts"/)
})
