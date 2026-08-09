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
  assert.deepEqual(httpsPackage.compilerPackage.nativeTypes, [
    {
      libraryId: 'node:https',
      typeId: 'node:https#Agent',
      declarationNames: ['Agent'],
      valueType: 'object',
      cppType: 'HttpAgent',
      baseTypeIds: ['node:http#Agent'],
      runtimeRequirements: ['node:http'],
      cValueAdapter: 'HttpAgent(inox::Value($value))',
      cValueAdapterPreservesPendingException: true
    }
  ])
  assert.deepEqual(
    httpsPackage.compilerPackage.operations.map((operation) => operation.operationId),
    [
      'node:https#Agent.construct',
      'node:https#globalAgent',
      'node:https#createServer',
      'node:https#get',
      'node:https#request'
    ]
  )

  const operations = httpsPackage.compilerPackage.operations
  const agentConstructor = operations[0]
  const globalAgent = operations[1]

  assert.equal(agentConstructor.cExpression, 'HttpAgent')
  assert.deepEqual(agentConstructor.runtimeRequirements, ['node:http'])
  assert.deepEqual(agentConstructor.resultTypeRef, {
    kind: 'nominal',
    typeId: 'node:https#Agent',
    args: [],
    nullable: false,
    ownership: 'value',
    traits: []
  })
  assert.equal(globalAgent.cExpression, 'https.globalAgent()')
  assert.deepEqual(globalAgent.runtimeRequirements, ['node:https'])
  assert.deepEqual(globalAgent.resultTypeRef, agentConstructor.resultTypeRef)

  for (const operation of operations.slice(2)) {
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
