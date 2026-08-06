import assert from 'node:assert/strict'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

test('entrypoint package node:dgram владеет native API и runtime plan', async () => {
  const discovered = await discoverCompilerLibraries()
  const dgramPackage = discovered.find((library) => library.id === 'node:dgram')

  assert.ok(dgramPackage)
  assert.equal(dgramPackage.compilerEntrypoint, 'stdlib/node/dgram/compiler/index.ts')
  assert.ok(dgramPackage.compilerPackage)
  assert.equal(dgramPackage.compilerPackage.id, 'node:dgram')
  assert.deepEqual(dgramPackage.compilerPackage.dependencies, ['global:strings', 'node:buffer'])
  assert.deepEqual(dgramPackage.nativeSources, ['stdlib/node/dgram/src/dgram.cc'])
  assert.deepEqual(dgramPackage.nativeIncludeDirs, ['stdlib/node/dgram/include'])

  const socket = dgramPackage.compilerPackage.nativeTypes?.find(
    (nativeType) => nativeType.typeId === 'node:dgram#Socket'
  )
  const address = dgramPackage.compilerPackage.nativeTypes?.find(
    (nativeType) => nativeType.typeId === 'node:dgram#AddressInfo'
  )
  const remote = dgramPackage.compilerPackage.nativeTypes?.find(
    (nativeType) => nativeType.typeId === 'node:dgram#RemoteInfo'
  )

  assert.equal(socket?.libraryId, 'node:dgram')
  assert.equal(socket?.cppType, 'DgramSocket')
  assert.equal(address?.cppType, 'DgramAddress')
  assert.equal(remote?.cppType, 'DgramRemoteInfo')

  const runtime = dgramPackage.compilerPackage.runtimeRequirements.find(
    (requirement) => requirement.id === 'node:dgram'
  )

  assert.ok(runtime)
  assert.deepEqual(runtime.cPreludeIncludes, ['inox/dgram.h'])
  assert.deepEqual(runtime.capabilities, ['udp'])
  assert.deepEqual(runtime.dependencies, [
    'async-runtime',
    'callback-values',
    'global:strings#strings',
    'managed-values',
    'node:buffer',
    'objects',
    'string-bytes'
  ])
  assert.deepEqual(runtime.optionConstraints?.[0], {
    optionId: 'target:runtime#loop-backend',
    allowedValues: ['libuv'],
    diagnosticCode: 'INOX_NOT_IMPLEMENTED',
    diagnosticMessage: 'node:dgram is not implemented for C without libuv; select --loop-backend libuv'
  })
})
