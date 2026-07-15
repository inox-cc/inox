import assert from 'node:assert/strict'
import { test } from 'node:test'

import { tokenize } from '../../compiler/lexer.ts'
import { parse } from '../../compiler/parser.ts'

test('parser сохраняет explicit type arguments конструктора', () => {
  const program = parse(tokenize('const value = new Box<string, Array<number>>()\n', {}))

  assert.deepEqual(program.body[0].init.typeArguments, ['string', 'array<number>'])
})
