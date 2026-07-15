import assert from 'node:assert/strict'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

const operationIds = ['abs', 'ceil', 'cos', 'floor', 'fround', 'max', 'min', 'random', 'round', 'sin', 'sqrt', 'trunc']

test('global:math operations describe number results only through TypeRef', async () => {
  const discovered = await discoverCompilerLibraries()
  const math = discovered.find((library) => library.id === 'global:math')
  const operations = math?.compilerPackage?.operations ?? []

  assert.deepEqual(
    operations.map((operation) => operation.operationId),
    operationIds.map((name) => `global:math#${name}`)
  )

  for (const operation of operations) {
    assert.deepEqual(operation.resultTypeRef, {
      kind: 'primitive',
      name: 'number',
      nullable: false,
      ownership: 'value',
      traits: []
    })
    assert.equal(operation.resultTypeId, undefined)
    assert.equal(operation.cppType, undefined)
    assert.equal(operation.valueType, undefined)
    assert.equal(operation.nullable, undefined)
    assert.equal(operation.owned, undefined)
  }
})
