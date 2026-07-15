import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseGlobalDeclarationContract } from '../../compiler/modules/declarations.ts'
import type { AnyNode } from '../../compiler/types.ts'

test('global declaration reader разделяет interface methods переводом строки', () => {
  const program = parseGlobalDeclarationContract(`
    export {}
    declare global {
      interface Codec {
        parse(value: string): unknown
        stringify(value: unknown, space?: number): string
      }

      const codec: Codec
    }
  `)
  const codecType = program.body[0].valueType

  assert.deepEqual(
    codecType.fields.map((field: AnyNode) => field.name),
    ['parse', 'stringify']
  )
  assert.equal(codecType.fields[1].functionType.params[1].optional, true)
})
