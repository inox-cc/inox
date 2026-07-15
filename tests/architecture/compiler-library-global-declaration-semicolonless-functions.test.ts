import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseGlobalDeclarationContract } from '../../compiler/modules/declarations.ts'

test('global declaration reader разделяет ambient functions переводом строки', () => {
  const program = parseGlobalDeclarationContract(`
    export {}
    declare global {
      function stringify(value: unknown): string
      function parseNumber(value: string): number | null
    }
  `)

  assert.deepEqual(
    program.body.map((item) => item.name),
    ['stringify', 'parseNumber']
  )
})
