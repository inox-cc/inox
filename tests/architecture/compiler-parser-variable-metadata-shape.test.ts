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
      promiseValueType: null,
      promiseRejectionIntrinsicRole: null,
      functionType: null,
      shape: null,
      className: null,
      libraryIntrinsicRole: null,
      typeRef: null
    }
  )
  assert.equal('arrayElementType' in declaration, false)
})
