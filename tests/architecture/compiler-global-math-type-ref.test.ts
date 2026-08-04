import assert from 'node:assert/strict'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

const operationIds = [
  'E',
  'PI',
  'abs',
  'acos',
  'asin',
  'atan',
  'atan2',
  'cbrt',
  'ceil',
  'cos',
  'exp',
  'floor',
  'fround',
  'hypot',
  'log',
  'log10',
  'log2',
  'max',
  'min',
  'pow',
  'random',
  'round',
  'sign',
  'sin',
  'sqrt',
  'tan',
  'trunc'
]

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
  }
})
