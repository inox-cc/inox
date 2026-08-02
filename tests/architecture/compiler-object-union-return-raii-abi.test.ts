import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'

test('union структурных объектов возвращается через RAII Value', () => {
  const result = compileSource(
    `
type Left = { left: string }
type Right = { right: string }

function choose(left: Left, right: Right): Left | Right {
  const combined: Left | Right = { ...left, ...right }
  return combined
}
`,
    { target: 'cc' }
  )

  assert.match(result.code, /inox::Value choose\(inox_value left, inox_value right\)/)
  assert.match(result.code, /ObjectValue::from\([^\n]+inox::get\(left, "left"\)[^\n]+inox::get\(right, "right"\)/)
  assert.doesNotMatch(result.code, /inox_retain\(inox_return\)/)
  assert.doesNotMatch(result.code, /combined\.init/)
  assert.doesNotMatch(result.code, /inox::Value inox_return/)
  assert.match(result.code, /return inox::Value\(combined\);/)
})
