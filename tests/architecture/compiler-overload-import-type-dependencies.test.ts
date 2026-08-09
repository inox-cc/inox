import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseModuleDeclarationContract } from '../../compiler/modules/declarations.ts'
import { createValueImportTypeDeclarations } from '../../compiler/modules/synthetic-imports.ts'

test('function import materializes type dependencies from every overload', () => {
  const program = parseModuleDeclarationContract(`
interface FirstOptions { first: string }
interface SecondOptions { second: number }
interface Result { ok: boolean }

export function select(kind: 'first', options: FirstOptions): Result
export function select(kind: 'second', options: SecondOptions): Result
`)
  const declarations = createValueImportTypeDeclarations(
    {
      imported: 'select',
      local: 'select',
      loc: { line: 1, column: 1 }
    },
    program
  )

  assert.deepEqual(
    declarations.map((declaration) => declaration.name),
    ['FirstOptions', 'Result', 'SecondOptions']
  )
})
