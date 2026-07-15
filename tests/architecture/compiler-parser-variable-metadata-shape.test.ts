import assert from 'node:assert/strict'
import { test } from 'node:test'

import { tokenize } from '../../compiler/lexer.ts'
import { parse } from '../../compiler/parser.ts'

test('parser заранее объявляет изменяемые checker metadata поля переменной', () => {
  const declaration = parse(tokenize("const value = Number(' 7 ')\n", {})).body[0]

  assert.deepEqual(
    {
      inferredDeclaredType: declaration.inferredDeclaredType,
      valueType: declaration.valueType,
      nullable: declaration.nullable,
      arrayElementType: declaration.arrayElementType,
      arrayElementDeclaredType: declaration.arrayElementDeclaredType,
      arrayElementFunctionType: declaration.arrayElementFunctionType,
      mapKeyType: declaration.mapKeyType,
      mapValueType: declaration.mapValueType,
      mapValueShape: declaration.mapValueShape,
      mapValueArrayElementType: declaration.mapValueArrayElementType,
      mapValueArrayElementDeclaredType: declaration.mapValueArrayElementDeclaredType,
      promiseValueType: declaration.promiseValueType,
      promiseRejectionIntrinsicRole: declaration.promiseRejectionIntrinsicRole,
      functionType: declaration.functionType,
      shape: declaration.shape,
      className: declaration.className,
      libraryIntrinsicRole: declaration.libraryIntrinsicRole,
      typeRef: declaration.typeRef
    },
    {
      inferredDeclaredType: null,
      valueType: 'unknown',
      nullable: false,
      arrayElementType: null,
      arrayElementDeclaredType: null,
      arrayElementFunctionType: null,
      mapKeyType: null,
      mapValueType: null,
      mapValueShape: null,
      mapValueArrayElementType: null,
      mapValueArrayElementDeclaredType: null,
      promiseValueType: null,
      promiseRejectionIntrinsicRole: null,
      functionType: null,
      shape: null,
      className: null,
      libraryIntrinsicRole: null,
      typeRef: null
    }
  )
})
