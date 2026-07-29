import assert from 'node:assert/strict'
import { test } from 'node:test'

import { commonTypeRef } from '../../compiler/extensions/type-ref-compatibility.ts'
import type { NominalTypeRef, ObjectTypeRef, PrimitiveTypeRef } from '../../compiler/extensions/types.ts'

test('nullish common TypeRef preserves the concrete type and its arguments', () => {
  const element: ObjectTypeRef = {
    kind: 'object',
    declaredName: 'Element',
    fields: [],
    nullable: false,
    ownership: 'value',
    traits: []
  }
  const array: NominalTypeRef = {
    kind: 'nominal',
    typeId: 'fixture:Array',
    args: [element],
    nullable: false,
    ownership: 'value',
    traits: []
  }
  const nullType: PrimitiveTypeRef = {
    kind: 'primitive',
    name: 'null',
    nullable: true,
    ownership: 'value',
    traits: []
  }
  const result = commonTypeRef(array, nullType)

  assert.equal(result?.kind, 'nominal')
  assert.equal(result?.nullable, true)
  assert.equal(result?.kind === 'nominal' ? result.args[0] : null, element)
})
