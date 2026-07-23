import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cTypeRefMapValue, cTypeRefValue, type CTypeRefMap } from '../../compiler/backends/cpp/types.ts'
import type { TypeRef } from '../../compiler/extensions/types.ts'

test('C++ context stores recursive TypeRef behind an opaque map boundary', () => {
  const typeRef: TypeRef = {
    kind: 'nominal',
    typeId: 'test#Box',
    args: [{ kind: 'primitive', name: 'string', nullable: false, ownership: 'value', traits: [] }],
    nullable: false,
    ownership: 'value',
    traits: []
  }
  const values: CTypeRefMap = new Map()

  values.set('read', typeRef)

  assert.equal(cTypeRefMapValue(values, 'read'), typeRef)
  assert.equal(cTypeRefMapValue(values, 'missing'), null)
  assert.equal(cTypeRefValue(typeRef), typeRef)
})
