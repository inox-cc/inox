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
  assert.deepEqual(httpPackage.compilerPackage.dependencies, [
    'global:binary',
    'global:collections',
    'global:error',
    'global:fetch',
    'global:strings',
    'node:net'
  ])
  assert.deepEqual(httpPackage.nativeSources, ['stdlib/node/http/src/http.cc'])
  assert.deepEqual(httpPackage.nativeIncludeDirs, ['stdlib/node/http/include'])

  const agent = httpPackage.compilerPackage.nativeTypes?.find((nativeType) => nativeType.typeId === 'node:http#Agent')
  const server = httpPackage.compilerPackage.nativeTypes?.find((nativeType) => nativeType.typeId === 'node:http#Server')
  const request = httpPackage.compilerPackage.nativeTypes?.find(
    (nativeType) => nativeType.typeId === 'node:http#IncomingMessage'
  )
  const response = httpPackage.compilerPackage.nativeTypes?.find(
    (nativeType) => nativeType.typeId === 'node:http#ServerResponse'
  )
  const clientRequest = httpPackage.compilerPackage.nativeTypes?.find(
    (nativeType) => nativeType.typeId === 'node:http#ClientRequest'
  )

  assert.equal(agent?.libraryId, 'node:http')
  assert.equal(agent?.cppType, 'HttpAgent')
  assert.equal(server?.libraryId, 'node:http')
  assert.equal(server?.cppType, 'HttpServer')
  assert.equal(request?.cppType, 'HttpRequest')
  assert.equal(response?.cppType, 'HttpResponse')
  assert.equal(clientRequest?.cppType, 'HttpClientRequest')
  assert.equal(response?.fields?.some((field) => field.name === 'destroyed'), false)
  assert.equal(clientRequest?.fields?.some((field) => field.name === 'destroyed'), true)

  const runtime = httpPackage.compilerPackage.runtimeRequirements.find((requirement) => requirement.id === 'node:http')

  assert.ok(runtime)
  assert.deepEqual(runtime.cPreludeIncludes, ['inox/http.h'])
  assert.deepEqual(runtime.capabilities, ['tcp'])
  assert.deepEqual(runtime.dependencies, [
    'async-runtime',
    'global:collections#array',
    'callback-values',
    'global:binary',
    'global:strings#strings',
    'managed-values',
    'node:net',
    'objects',
    'string-bytes'
  ])
  assert.deepEqual(runtime.optionConstraints?.[0], {
    optionId: 'target:runtime#loop-backend',
    allowedValues: ['libuv'],
    diagnosticCode: 'INOX_NOT_IMPLEMENTED',
    diagnosticMessage: 'node:http is not implemented for C without libuv; select --loop-backend libuv'
  })
})
