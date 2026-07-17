import assert from 'node:assert/strict'
import { test } from 'node:test'

import { tokenize } from '../../compiler/lexer.ts'
import { parse } from '../../compiler/parser.ts'

test('многострочный generic alias не захватывает следующую декларацию до &', () => {
  const program = parse(
    tokenize(
      `
        type Lookup = Map<
          string,
          string
        >

        export type Result = {
          value: string | null
        }

        type Combined = Result & { count: number }

        export type Tail = { done: boolean }
      `,
      {}
    )
  )
  const lookup = program.body.find((item) => item.type === 'TypeAliasDeclaration' && item.name === 'Lookup')

  assert.equal(lookup?.valueType.kind, 'alias')
  assert.equal(lookup?.valueType.valueType, 'Map<string,string>')
  assert.ok(program.body.find((item) => item.type === 'TypeAliasDeclaration' && item.name === 'Tail'))
})
