import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'

test('single-unit C++ emission сохраняет @inline у function declaration', () => {
  const compiled = compileSource(
    '/** @inline */\nexport function add(left: number, right: number): number { return left + right }\nadd(1, 2)\n'
  )

  assert.match(compiled.code, /inline double add\(double left, double right\) \{/)
})
