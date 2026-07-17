import assert from 'node:assert/strict'
import { test } from 'node:test'

import { tokenize } from '../../compiler/lexer.ts'
import { parse } from '../../compiler/parser.ts'

test('parser сохраняет type parameters generic class method', () => {
  const program = parse(
    tokenize('class Box<T> { map<U>(callback: (value: T) => U): Box<U> {} }\n', {})
  )
  const method = program.body[0].methods[0]

  assert.equal(method.name, 'map')
  assert.equal(method.typeParameters[0].name, 'U')
  assert.equal(method.params[0].valueType, 'function')
  assert.equal(method.returnType, 'Box<U>')
})
