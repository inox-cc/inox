import assert from 'node:assert/strict'
import { test } from 'node:test'

import { commonTypeRef } from '../../compiler/extensions/type-ref-compatibility.ts'
import type { TypeRef } from '../../compiler/extensions/types.ts'

test('common TypeRef сохраняет одинаковую anonymous structural object форму', () => {
  const common = commonTypeRef(entryTypeRef(), entryTypeRef())

  assert.equal(common?.kind, 'object')

  if (common?.kind !== 'object') {
    return
  }

  assert.equal(common.fields[0].name, 'name')
  assert.equal(common.fields[0].typeRef.kind, 'primitive')
})

function entryTypeRef(): TypeRef {
  return {
    kind: 'object',
    fields: [
      {
        name: 'name',
        readonly: false,
        typeRef: {
          kind: 'primitive',
          name: 'string',
          nullable: false,
          ownership: 'value',
          traits: []
        }
      }
    ],
    nullable: false,
    ownership: 'value',
    traits: []
  }
}
