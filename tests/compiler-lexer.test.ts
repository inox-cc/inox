import { test } from 'node:test'
import assert from 'node:assert/strict'

import { tokenize } from '../compiler/lexer.ts'

test('tokenizes keywords and punctuators without runtime lookup tables', () => {
  const tokens = tokenize('async function f(){ return a !== b && foo?.bar ?? x++ }', {})
  const values = tokens.map((token) => `${token.type}:${token.value}`)

  assert.deepEqual(values, [
    'keyword:async',
    'keyword:function',
    'identifier:f',
    'punctuator:(',
    'punctuator:)',
    'punctuator:{',
    'keyword:return',
    'identifier:a',
    'punctuator:!==',
    'identifier:b',
    'punctuator:&&',
    'identifier:foo',
    'punctuator:?.',
    'identifier:bar',
    'punctuator:??',
    'identifier:x',
    'punctuator:++',
    'punctuator:}',
    'eof:<eof>'
  ])
})
