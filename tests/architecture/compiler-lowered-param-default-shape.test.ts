import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/compiler.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('lowered function params reserve the defaultValue field', () => {
  const compiled = compileSourceToIr(`
function plain(value: string): void {}
function defaulted(values: string[] = []): void {}
`, { libraries: defaultCompilerLibrarySet })
  const plain = compiled.hir.body[0]
  const defaulted = compiled.hir.body[1]

  assert.ok(Object.hasOwn(plain.params[0], 'defaultValue'))
  assert.equal(plain.params[0].defaultValue, null)
  assert.ok(Object.hasOwn(defaulted.params[0], 'defaultValue'))
  assert.equal(defaulted.params[0].defaultValue?.type, 'ArrayLiteral')
})
