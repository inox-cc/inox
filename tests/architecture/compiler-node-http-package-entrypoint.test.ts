import assert from 'node:assert/strict'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

test('entrypoint package node:http владеет native API и runtime plan', async () => {
  const discovered = await discoverCompilerLibraries()
  const httpPackage = discovered.find((library) => library.id === 'node:http')

  assert.ok(httpPackage)
  assert.equal(httpPackage.compilerEntrypoint, 'stdlib/node/http/compiler/index.ts')
  assert.ok(httpPackage.compilerPackage)
  assert.equal(httpPackage.compilerPackage.id, 'node:http')
  assert.deepEqual(httpPackage.compilerPackage.dependencies, ['global:binary', 'node:net'])
  assert.deepEqual(httpPackage.nativeSources, ['stdlib/node/http/src/http.cc'])
  assert.deepEqual(httpPackage.nativeIncludeDirs, ['stdlib/node/http/include'])

  const server = httpPackage.compilerPackage.nativeTypes?.find((nativeType) => nativeType.typeId === 'node:http#Server')
  const request = httpPackage.compilerPackage.nativeTypes?.find(
    (nativeType) => nativeType.typeId === 'node:http#IncomingMessage'
  )
  const response = httpPackage.compilerPackage.nativeTypes?.find(
    (nativeType) => nativeType.typeId === 'node:http#ServerResponse'
  )

  assert.equal(server?.libraryId, 'node:http')
  assert.equal(server?.cppType, 'HttpServer')
  assert.equal(request?.cppType, 'HttpRequest')
  assert.equal(response?.cppType, 'HttpResponse')

  const runtime = httpPackage.compilerPackage.runtimeRequirements.find((requirement) => requirement.id === 'node:http')

  assert.ok(runtime)
  assert.deepEqual(runtime.cPreludeIncludes, ['inox/http.h'])
  assert.deepEqual(runtime.capabilities, ['tcp'])
  assert.deepEqual(runtime.dependencies, [
    'async-runtime',
    'callback-values',
    'global:binary',
    'managed-values',
    'node:net',
    'objects',
    'string-bytes'
  ])
  assert.deepEqual(runtime.backendConstraints?.[0], {
    option: 'loopBackend',
    allowedValues: ['libuv'],
    diagnosticCode: 'INOX_NOT_IMPLEMENTED',
    diagnosticMessage:
      "node:http is not implemented for C without libuv; compile with loopBackend: 'libuv' or --loop-backend libuv"
  })
})
