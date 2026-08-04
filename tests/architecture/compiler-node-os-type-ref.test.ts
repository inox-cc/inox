import assert from 'node:assert/strict'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

const stringOperationIds = [
  'node:os#EOL',
  'node:os#devNull',
  'node:os#arch',
  'node:os#endianness',
  'node:os#homedir',
  'node:os#hostname',
  'node:os#machine',
  'node:os#platform',
  'node:os#release',
  'node:os#tmpdir',
  'node:os#type',
  'node:os#version'
]

test('node:os operations describe string results only through TypeRef', async () => {
  const discovered = await discoverCompilerLibraries()
  const osPackage = discovered.find((library) => library.id === 'node:os')
  const operations = (osPackage?.compilerPackage?.operations ?? []).filter((operation) => !operation.diagnosticCode)

  const stringOperations = operations.filter(
    (operation) => operation.resultTypeRef?.kind === 'primitive' && operation.resultTypeRef.name === 'string'
  )
  assert.deepEqual(stringOperations.map((operation) => operation.operationId), stringOperationIds)

  for (const operation of stringOperations) {
    assert.deepEqual(operation.resultTypeRef, {
      kind: 'primitive',
      name: 'string',
      nullable: false,
      ownership: 'value',
      traits: []
    })
    assert.deepEqual(operation.cResultMapping, {
      cppType: 'inox::String',
      fields: []
    })
  }

  const availableParallelism = operations.find(
    (operation) => operation.operationId === 'node:os#availableParallelism'
  )
  assert.deepEqual(availableParallelism?.resultTypeRef, {
    kind: 'primitive',
    name: 'number',
    nullable: false,
    ownership: 'value',
    traits: []
  })
  assert.equal(availableParallelism?.cResultMapping, undefined)
})
