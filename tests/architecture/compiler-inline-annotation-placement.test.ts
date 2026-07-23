import assert from 'node:assert/strict'
import { test } from 'node:test'

import { CompileError } from '../../compiler/diagnostics.ts'
import { tokenize } from '../../compiler/lexer.ts'
import { parse } from '../../compiler/parser.ts'

test('@inline на неподдерживаемой декларации даёт диагностику', () => {
  assert.throws(
    () => parse(tokenize('/** @inline */\nconst value = 1\n', {})),
    (error: unknown) =>
      error instanceof CompileError && error.diagnostics[0].code === 'INOX_INLINE_PLACEMENT'
  )
})
