import assert from 'node:assert/strict'
import { test } from 'node:test'

import { typeRefFromResolvedType } from '../../compiler/checker/declared-types.ts'
import type { ResolvedTypeInfo } from '../../compiler/checker/resolved-types.ts'
import { commonTypeRef } from '../../compiler/extensions/type-ref-compatibility.ts'
import type { TypeRef } from '../../compiler/extensions/types.ts'
import type { ObjectShapeInfo } from '../../compiler/types.ts'

test('recursive structural TypeRef terminates at an unknown cycle boundary', () => {
  const shape: ObjectShapeInfo = {
    kind: 'object',
    dynamic: false,
    fields: []
  }
  const stringTypeRef: TypeRef = {
    kind: 'primitive',
    name: 'string',
    nullable: false,
    ownership: 'value',
    traits: []
  }

  shape.fields.push({
    name: 'name',
    optional: false,
    readonly: false,
    valueType: 'string',
    nullable: false,
    typeRef: stringTypeRef
  })
  shape.fields.push({
    name: 'self',
    optional: true,
    readonly: false,
    valueType: 'object',
    declaredType: 'RecursiveShape',
    nullable: true,
    shape
  })

  const info: ResolvedTypeInfo = {
    valueType: 'object',
    nullable: false,
    typeRef: null,
    functionType: null,
    shape,
    asyncResultValueType: null
  }
  const typeRef = typeRefFromResolvedType(info, 'RecursiveShape')

  assert.equal(typeRef.kind, 'object')

  if (typeRef.kind !== 'object') {
    return
  }

  const self = typeRef.fields.find((field) => field.name === 'self')

  assert.equal(self?.typeRef.kind, 'unknown')
})

test('common TypeRef merges incomplete views of the same named object', () => {
  const shallow: TypeRef = {
    kind: 'object',
    declaredName: 'AnyNode',
    fields: [],
    dynamic: true,
    nullable: false,
    ownership: 'value',
    traits: []
  }
  const detailed: TypeRef = {
    kind: 'object',
    declaredName: 'AnyNode',
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
    dynamic: true,
    nullable: false,
    ownership: 'value',
    traits: []
  }
  const common = commonTypeRef(shallow, detailed)

  assert.equal(common?.kind, 'object')

  if (common?.kind !== 'object') {
    return
  }

  assert.equal(common.fields.some((field) => field.name === 'name'), true)
})
