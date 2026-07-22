import assert from 'node:assert/strict'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

const numberOperationIds = [
  'global:time#Date.now',
  'global:time#Date.parse',
  'global:time#Date.UTC',
  'global:time#performance.now',
  'global:time#Date.getDate',
  'global:time#Date.getDay',
  'global:time#Date.getFullYear',
  'global:time#Date.getHours',
  'global:time#Date.getMilliseconds',
  'global:time#Date.getMinutes',
  'global:time#Date.getMonth',
  'global:time#Date.getSeconds',
  'global:time#Date.getTime',
  'global:time#Date.getTimezoneOffset',
  'global:time#Date.getUTCDate',
  'global:time#Date.getUTCDay',
  'global:time#Date.getUTCFullYear',
  'global:time#Date.getUTCHours',
  'global:time#Date.getUTCMilliseconds',
  'global:time#Date.getUTCMinutes',
  'global:time#Date.getUTCMonth',
  'global:time#Date.getUTCSeconds',
  'global:time#Date.valueOf'
]
const stringOperationIds = [
  'global:time#Date.toDateString',
  'global:time#Date.toISOString',
  'global:time#Date.toJSON',
  'global:time#Date.toString',
  'global:time#Date.toTimeString',
  'global:time#Date.toUTCString'
]

test('global:time operations describe results only through TypeRef', async () => {
  const discovered = await discoverCompilerLibraries()
  const time = discovered.find((library) => library.id === 'global:time')
  const operations = time?.compilerPackage?.operations ?? []

  assert.deepEqual(
    operations.map((operation) => operation.operationId),
    ['global:time#Date.construct', ...numberOperationIds, ...stringOperationIds]
  )
  assert.deepEqual(operations[0]?.resultTypeRef, nominalDateTypeRef())

  for (let index = 1; index < operations.length; index = index + 1) {
    const operation = operations[index]
    const stringResult = stringOperationIds.includes(operation.operationId)

    assert.deepEqual(operation.resultTypeRef, primitiveTypeRef(stringResult ? 'string' : 'number'))

    if (stringResult) {
      assert.deepEqual(operation.cResultMapping, {
        cppType: 'inox::String',
        fields: []
      })
    }
  }

  const variants = operations[0]?.variants ?? []
  assert.equal(variants.length, 5)

  for (const variant of variants) {
    assert.equal(variant.resultTypeRef, undefined)
  }
})

function nominalDateTypeRef() {
  return {
    kind: 'nominal',
    typeId: 'global:time#Date',
    args: [],
    nullable: false,
    ownership: 'value',
    traits: []
  }
}

function primitiveTypeRef(name: 'number' | 'string') {
  return {
    kind: 'primitive',
    name,
    nullable: false,
    ownership: 'value',
    traits: []
  }
}
