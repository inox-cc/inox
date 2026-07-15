import assert from 'node:assert/strict'
import { test } from 'node:test'

import { tokenize } from '../../compiler/lexer.ts'
import { parse } from '../../compiler/parser.ts'

test('parser не принимает сравнение в for как generic call', () => {
  const program = parse(tokenize('for (let index = 0; index < values.length; index++) {}\n', {}))

  assert.equal(program.body[0].test.operator, '<')
})
