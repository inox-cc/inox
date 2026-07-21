import assert from 'node:assert/strict'
import { test } from 'node:test'

import { commonTypeRef } from '../../compiler/extensions/type-ref-compatibility.ts'
import type { NominalTypeRef, TypeRef } from '../../compiler/extensions/types.ts'

test('common TypeRef сохраняет nullable-квалификатор наблюдаемого типа вместо unknown', () => {
  const unknownElement: TypeRef = {
    kind: 'unknown',
    nullable: false,
    ownership: 'value',
    traits: []
  }
  const nullableStringElement: TypeRef = {
    kind: 'primitive',
    name: 'string',
    nullable: true,
    ownership: 'value',
    traits: []
  }
  const left = sequenceTypeRef(unknownElement)
  const right = sequenceTypeRef(nullableStringElement)
  const common = commonTypeRef(left, right)

  assert.equal(common?.kind, 'nominal')

  if (common?.kind !== 'nominal') {
    return
  }

  assert.deepEqual(common.args[0], nullableStringElement)
})

function sequenceTypeRef(elementType: TypeRef): NominalTypeRef {
  return {
    kind: 'nominal',
    typeId: 'fixture:sequence#Sequence',
    args: [elementType],
    nullable: false,
    ownership: 'value',
    traits: []
  }
}
