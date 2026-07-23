import assert from 'node:assert/strict'
import { test } from 'node:test'

import { tokenize } from '../../compiler/lexer.ts'
import { parse } from '../../compiler/parser.ts'

test('@inline поддерживает однострочный и многострочный JSDoc у функций, методов и const-функций', () => {
  const program = parse(
    tokenize(
      `/** @inline */
function first(): number { return 1 }
/**
 * Документация.
 * @inline
 */
const second = function (): number { return 2 }
class Box {
  /** @inline */
  read(): number { return 3 }
}
`,
      {}
    )
  )

  assert.equal(program.body[0].inline, true)
  assert.equal(program.body[1].inline, true)
  assert.equal(program.body[1].init.functionSyntax, true)
  assert.equal(program.body[2].methods[0].inline, true)
})
