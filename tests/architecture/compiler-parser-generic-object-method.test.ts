import assert from 'node:assert/strict'
import { test } from 'node:test'

import { tokenize } from '../../compiler/lexer.ts'
import { parse } from '../../compiler/parser.ts'

test('parser сохраняет type parameters generic object method', () => {
  const program = parse(tokenize('type Mapper = { map<U>(value: U): U }\n', {}))
  const method = program.body[0].valueType.fields[0].functionType

  assert.equal(method.typeParameters[0].name, 'U')
  assert.equal(method.params[0].valueType, 'U')
  assert.equal(method.returnType, 'U')
})
