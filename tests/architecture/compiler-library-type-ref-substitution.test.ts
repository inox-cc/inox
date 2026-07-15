import assert from 'node:assert/strict'
import { test } from 'node:test'

import { substituteTypeRef } from '../../compiler/extensions/type-ref-substitution.ts'
import type { TypeRef } from '../../compiler/extensions/types.ts'

test('generic TypeRef substitution рекурсивно заменяет parameter refs', () => {
  const parameter: TypeRef = { kind: 'parameter', name: 'T' }
  const stringType: TypeRef = primitiveTypeRef('string')
  const template: TypeRef = {
    kind: 'nominal',
    typeId: 'fixture:box#Box',
    args: [parameter],
    nullable: false,
    ownership: 'value',
    traits: [{ traitId: 'iterable', args: [parameter] }]
  }

  assert.deepEqual(substituteTypeRef(template, [{ name: 'T', typeRef: stringType }]), {
    kind: 'nominal',
    typeId: 'fixture:box#Box',
    args: [stringType],
    nullable: false,
    ownership: 'value',
    traits: [{ traitId: 'iterable', args: [stringType] }]
  })
})

function primitiveTypeRef(name: 'string'): TypeRef {
  return { kind: 'primitive', name, nullable: false, ownership: 'value', traits: [] }
}
