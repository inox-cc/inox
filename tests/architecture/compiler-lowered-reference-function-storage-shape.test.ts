import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/compiler.ts'

test('lowering заранее сохраняет поле functionStorage у ссылки на функцию', () => {
  const compiled = compileSourceToIr(`
function render(value: string): string { return value }
const renderer = { render }
`)
  const reference = compiled.hir.body[1].init.properties[0].value

  assert.equal(reference.type, 'Reference')
  assert.ok(Object.hasOwn(reference, 'functionStorage'))
  assert.equal(reference.functionStorage, null)
})
