import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('известное поле локального объекта читается и записывается по индексу формы', () => {
  const result = compileSource(
    `
type Config = { name: string; count?: number }

function readCount(): number {
  const config: Config = { name: 'inox' }
  config.count = 2
  console.log(config.count)
  return config.count
}

console.log(readCount())
`,
    { libraries: defaultCompilerLibrarySet, target: 'cc' }
  )

  assert.match(result.code, /inox::set_object_value_at\(config, 1, "count", inox_number_value\(2\)\);/)
  assert.match(result.code, /inox::object_value_at\(config, 1, "count"\)/)
  assert.match(result.code, /inox::expect_number\(inox::object_value_at\(config, 1, "count"\)\)/)
  assert.doesNotMatch(result.code, /inox_object_set\(config, "count"/)
  assert.doesNotMatch(result.code, /inox::get\(config, "count"\)/)
  assert.doesNotMatch(result.code, /inox::Value inox_log_value_\d+;/)
})
