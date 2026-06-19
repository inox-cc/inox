import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createLowerContext, resolveDeclaredType } from '../compiler/lower/type-resolution.ts'
import type { ProgramNode } from '../compiler/types.ts'

const typeProgram: ProgramNode = {
  type: 'Program',
  body: [
    {
      type: 'TypeAliasDeclaration',
      name: 'User',
      valueType: {
        kind: 'object',
        fields: [
          { name: 'id', valueType: 'number', readonly: true },
          { name: 'tags', valueType: 'array<string>', readonly: false }
        ]
      }
    },
    {
      type: 'TypeAliasDeclaration',
      name: 'Callback',
      valueType: {
        kind: 'function',
        params: [{ name: 'user', valueType: 'User' }],
        returnType: 'promise<string>'
      }
    }
  ]
}

test('resolves builtin nullable and collection type names for lowering', () => {
  const context = createLowerContext({ type: 'Program', body: [] })

  assert.deepEqual(
    {
      valueType: resolveDeclaredType('nullable<number>', context).valueType,
      nullable: resolveDeclaredType('nullable<number>', context).nullable
    },
    { valueType: 'number', nullable: true }
  )
  assert.deepEqual(
    {
      valueType: resolveDeclaredType('array<string>', context).valueType,
      arrayElementType: resolveDeclaredType('array<string>', context).arrayElementType,
      arrayElementDeclaredType: resolveDeclaredType('array<string>', context).arrayElementDeclaredType
    },
    { valueType: 'array', arrayElementType: 'string', arrayElementDeclaredType: 'string' }
  )
  assert.deepEqual(
    {
      valueType: resolveDeclaredType('map<string,number>', context).valueType,
      mapKeyType: resolveDeclaredType('map<string,number>', context).mapKeyType,
      mapValueType: resolveDeclaredType('map<string,number>', context).mapValueType
    },
    { valueType: 'map', mapKeyType: 'string', mapValueType: 'number' }
  )
  assert.deepEqual(
    {
      valueType: resolveDeclaredType('set<boolean>', context).valueType,
      setElementType: resolveDeclaredType('set<boolean>', context).setElementType
    },
    { valueType: 'set', setElementType: 'boolean' }
  )
  assert.deepEqual(
    {
      valueType: resolveDeclaredType('promise<string>', context).valueType,
      promiseValueType: resolveDeclaredType('promise<string>', context).promiseValueType
    },
    { valueType: 'promise', promiseValueType: 'string' }
  )
})

test('resolves object aliases into lowered shapes', () => {
  const context = createLowerContext(typeProgram)
  const user = resolveDeclaredType('User', context)

  assert.equal(user.valueType, 'object')
  assert.deepEqual(
    user.shape?.fields.map((field) => ({
      name: field.name,
      valueType: field.valueType,
      arrayElementType: field.arrayElementType,
      arrayElementDeclaredType: field.arrayElementDeclaredType
    })),
    [
      { name: 'id', valueType: 'number', arrayElementType: null, arrayElementDeclaredType: null },
      { name: 'tags', valueType: 'array', arrayElementType: 'string', arrayElementDeclaredType: 'string' }
    ]
  )
})

test('resolves intersection object fields by overriding base fields', () => {
  const context = createLowerContext({
    type: 'Program',
    body: [
      {
        type: 'TypeAliasDeclaration',
        name: 'Base',
        valueType: {
          kind: 'object',
          fields: [{ name: 'objectName', valueType: 'string', optional: true }]
        }
      },
      {
        type: 'TypeAliasDeclaration',
        name: 'Known',
        valueType: {
          kind: 'object',
          baseTypes: ['Base'],
          fields: [{ name: 'objectName', valueType: 'string' }]
        }
      }
    ]
  })
  const known = resolveDeclaredType('Known', context)

  assert.deepEqual(
    known.shape?.fields.map((field) => ({
      name: field.name,
      optional: field.optional,
      nullable: field.nullable,
      valueType: field.valueType
    })),
    [{ name: 'objectName', optional: false, nullable: false, valueType: 'string' }]
  )
})

test('resolves function aliases into lowered function metadata', () => {
  const context = createLowerContext(typeProgram)
  const callback = resolveDeclaredType('Callback', context)

  assert.equal(callback.valueType, 'function')
  assert.equal(callback.functionType?.params[0].valueType, 'object')
  assert.equal(callback.functionType?.params[0].shape?.fields[0].name, 'id')
  assert.equal(callback.functionType?.returnType, 'promise')
  assert.equal(callback.functionType?.returnPromiseValueType, 'string')
})

test('keeps malformed generic map names as map with unknown key and value types', () => {
  const malformed = resolveDeclaredType('map<string>', createLowerContext({ type: 'Program', body: [] }))

  assert.equal(malformed.valueType, 'map')
  assert.equal(malformed.mapKeyType, 'unknown')
  assert.equal(malformed.mapValueType, 'unknown')
})
