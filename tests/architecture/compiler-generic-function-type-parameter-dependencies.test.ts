import assert from 'node:assert/strict'
import { test } from 'node:test'

import { tokenize } from '../../compiler/lexer.ts'
import { createValueImportTypeDeclarations } from '../../compiler/modules/synthetic-imports.ts'
import { parse } from '../../compiler/parser.ts'

test('generic function import does not materialize scoped type parameters as unknown aliases', () => {
  const program = parse(
    tokenize(
      `
type Box<Value> = { value: Value }

export function convert<Input, Output>(value: Box<Input>): Box<Output> {
  return value as Box<Output>
}
`,
      {}
    )
  )
  const declarations = createValueImportTypeDeclarations(
    {
      imported: 'convert',
      local: 'convert',
      loc: { line: 1, column: 1 }
    },
    program
  )
  const declarationNames = declarations.map((declaration) => declaration.name)

  assert.deepEqual(declarationNames, ['Box'])
})
