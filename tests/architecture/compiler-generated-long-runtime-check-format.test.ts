import assert from 'node:assert/strict'
import { test } from 'node:test'

import { formatGeneratedC } from '../../compiler/backends/cpp/format.ts'

test('generated C++ переносит только длинные runtime guards и сохраняет короткие однострочными', () => {
  const longCondition =
    '(value.tag != INOX_TAG_OBJECT && value.tag != INOX_TAG_CLASS_INSTANCE) || value.as.ref == nullptr || value.as.ref->descriptor == nullptr'
  const code = formatGeneratedC(
    `if (${longCondition}) return;\nif (inox::thrown()) return;\n`,
    'generated.cc'
  )

  assert.ok(code.startsWith('if (\n'))
  assert.match(code, /\) \|\|\n/)
  assert.match(code, /\n\) return;/)
  assert.match(code, /if \(inox::thrown\(\)\) return;/)

  for (const line of code.split('\n')) {
    assert.ok(line.length <= 130)
  }
})
