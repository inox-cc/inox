import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'

test('C++ lowering narrows nullable scalars in conditional branches', () => {
  const result = compileSource(
    'function required(value: number | null): number { return value === null ? 0 : value }\n' +
      "function label(value: number | null): string { return value === null ? 'none' : `value ${value}` }\n",
    { target: 'cc' }
  )

  assert.match(result.code, /inox_conditional_/)
  assert.match(result.code, /inox::String::fromFormat\("value %\.17g", static_cast<double>\(value\.as\.number\)\)/)
})
