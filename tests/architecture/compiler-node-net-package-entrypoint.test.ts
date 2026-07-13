import assert from 'node:assert/strict'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

test('entrypoint package node:net владеет native API и runtime plan', async () => {
  const discovered = await discoverCompilerLibraries()
  const netPackage = discovered.find((library) => library.id === 'node:net')

  assert.ok(netPackage)
  assert.equal(netPackage.compilerEntrypoint, 'stdlib/node/net/compiler/index.ts')
  assert.ok(netPackage.compilerPackage)
  assert.equal(netPackage.compilerPackage.id, 'node:net')
  assert.deepEqual(netPackage.compilerPackage.dependencies, [])
  assert.deepEqual(netPackage.nativeSources, ['stdlib/node/net/src/net.cc'])
  assert.deepEqual(netPackage.nativeIncludeDirs, ['stdlib/node/net/include'])

  const server = netPackage.compilerPackage.nativeTypes?.find(
    (nativeType) => nativeType.typeId === 'node:net#Server'
  )
  const socket = netPackage.compilerPackage.nativeTypes?.find(
    (nativeType) => nativeType.typeId === 'node:net#Socket'
  )
  const address = netPackage.compilerPackage.nativeTypes?.find(
    (nativeType) => nativeType.typeId === 'node:net#AddressInfo'
  )

  assert.equal(server?.cppType, 'NetServer')
  assert.equal(socket?.cppType, 'NetSocket')
  assert.equal(address?.cppType, 'NetAddress')

  const runtime = netPackage.compilerPackage.runtimeRequirements.find(
    (requirement) => requirement.id === 'node:net'
  )

  assert.ok(runtime)
  assert.deepEqual(runtime.cPreludeIncludes, ['inox/net.h'])
  assert.deepEqual(runtime.capabilities, ['tcp'])
  assert.deepEqual(runtime.dependencies, [
    'async-runtime',
    'callback-values',
    'managed-values',
    'objects',
    'string-bytes'
  ])
  assert.deepEqual(runtime.backendConstraints?.[0], {
    option: 'loopBackend',
    allowedValues: ['libuv'],
    diagnosticCode: 'INOX_NOT_IMPLEMENTED',
    diagnosticMessage:
      "node:net is not implemented for C without libuv; compile with loopBackend: 'libuv' or --loop-backend libuv"
  })
})
