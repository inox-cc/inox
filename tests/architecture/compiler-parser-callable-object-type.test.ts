import assert from 'node:assert/strict'
import { test } from 'node:test'

import { tokenize } from '../../compiler/lexer.ts'
import { parse } from '../../compiler/parser.ts'

test('parser сохраняет call signature и методы callable object type', () => {
  const program = parse(
    tokenize(
      'type Callable = { (value: number): number; readonly label: string; reset(): void }',
      {}
    )
  )
  const declaration = program.body[0]

  assert.equal(declaration.valueType.kind, 'object')
  assert.equal(declaration.valueType.callSignature.params[0].name, 'value')
  assert.equal(declaration.valueType.callSignature.returnType, 'number')
  assert.deepEqual(
    declaration.valueType.fields.map((field: { name: string }) => field.name),
    ['label', 'reset']
  )
})
