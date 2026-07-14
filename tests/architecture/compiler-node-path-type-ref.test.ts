import assert from 'node:assert/strict'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

const operationIds = [
  'node:path#delimiter',
  'node:path#sep',
  'node:path#basename',
  'node:path#dirname',
  'node:path#extname',
  'node:path#format',
  'node:path#isAbsolute',
  'node:path#join',
  'node:path#normalize',
  'node:path#parse',
  'node:path#relative',
  'node:path#resolve'
]
const stringTypeRef = primitiveTypeRef('string')

test('node:path operations describe results only through TypeRef', async () => {
  const discovered = await discoverCompilerLibraries()
  const pathPackage = discovered.find((library) => library.id === 'node:path')
  const operations = (pathPackage?.compilerPackage?.operations ?? []).filter((operation) => !operation.diagnosticCode)

  assert.deepEqual(
    operations.map((operation) => operation.operationId),
    operationIds
  )

  for (const operation of operations) {
    if (operation.operationId === 'node:path#isAbsolute') {
      assert.deepEqual(operation.resultTypeRef, primitiveTypeRef('boolean'))
      assert.equal(operation.cResultMapping, undefined)
    } else if (operation.operationId === 'node:path#parse') {
      assert.deepEqual(operation.resultTypeRef, {
        kind: 'object',
        fields: ['root', 'dir', 'base', 'ext', 'name'].map((name) => ({
          name,
          typeRef: stringTypeRef,
          readonly: true
        })),
        nullable: false,
        ownership: 'value',
        traits: []
      })
      assert.deepEqual(operation.cResultMapping, {
        cppType: 'inox::Value',
        fields: []
      })
    } else {
      assert.deepEqual(operation.resultTypeRef, stringTypeRef)
      assert.deepEqual(operation.cResultMapping, {
        cppType: 'inox::String',
        fields: []
      })
    }

    assert.equal(operation.resultTypeId, undefined)
    assert.equal(operation.resultShapeFields, undefined)
    assert.equal(operation.cppType, undefined)
    assert.equal(operation.valueType, undefined)
    assert.equal(operation.nullable, undefined)
    assert.equal(operation.owned, undefined)
  }
})

function primitiveTypeRef(name: 'boolean' | 'string') {
  return {
    kind: 'primitive',
    name,
    nullable: false,
    ownership: 'value',
    traits: []
  } as const
}
