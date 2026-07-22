import assert from 'node:assert/strict'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

const operationIds = [
  'node:os#EOL',
  'node:os#arch',
  'node:os#homedir',
  'node:os#hostname',
  'node:os#platform',
  'node:os#release',
  'node:os#tmpdir',
  'node:os#type'
]

test('node:os operations describe string results only through TypeRef', async () => {
  const discovered = await discoverCompilerLibraries()
  const osPackage = discovered.find((library) => library.id === 'node:os')
  const operations = (osPackage?.compilerPackage?.operations ?? []).filter((operation) => !operation.diagnosticCode)

  assert.deepEqual(
    operations.map((operation) => operation.operationId),
    operationIds
  )

  for (const operation of operations) {
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
})
