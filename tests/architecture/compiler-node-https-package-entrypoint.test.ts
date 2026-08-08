import assert from 'node:assert/strict'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

test('entrypoint package node:https владеет client API и TLS runtime plan', async () => {
  const discovered = await discoverCompilerLibraries()
  const httpsPackage = discovered.find((library) => library.id === 'node:https')

  assert.ok(httpsPackage?.compilerPackage)
  assert.equal(httpsPackage.compilerEntrypoint, 'stdlib/node/https/compiler/index.ts')
  assert.deepEqual(httpsPackage.compilerPackage.dependencies, ['node:http'])
  assert.deepEqual(httpsPackage.nativeSources, ['stdlib/node/https/src/https.cc'])
  assert.deepEqual(httpsPackage.nativeIncludeDirs, ['stdlib/node/https/include'])
  assert.deepEqual(httpsPackage.compilerPackage.nativeTypes, [])
  assert.deepEqual(
    httpsPackage.compilerPackage.operations.map((operation) => operation.operationId),
    ['node:https#createServer', 'node:https#get', 'node:https#request']
  )

  for (const operation of httpsPackage.compilerPackage.operations) {
    assert.equal(operation.cExpression, `https.${operation.operationId.slice('node:https#'.length)}`)
    assert.deepEqual(operation.runtimeRequirements, ['node:https'])
    assert.deepEqual(operation.resultTypeRef, {
      kind: 'nominal',
      typeId: operation.operationId === 'node:https#createServer' ? 'node:http#Server' : 'node:http#ClientRequest',
      args: [],
      nullable: false,
      ownership: 'value',
      traits: []
    })
  }

  const runtime = httpsPackage.compilerPackage.runtimeRequirements[0]

  assert.equal(runtime.id, 'node:https')
  assert.deepEqual(runtime.dependencies, ['node:http'])
  assert.deepEqual(runtime.cPreludeIncludes, ['inox/https.h'])
  assert.deepEqual(runtime.capabilities, ['tcp'])
  assert.deepEqual(
    runtime.optionConstraints?.map((constraint) => [constraint.optionId, constraint.allowedValues]),
    [
      ['target:runtime#loop-backend', ['libuv']],
      ['target:runtime#tls-backend', ['boringssl', 'openssl']]
    ]
  )
})
