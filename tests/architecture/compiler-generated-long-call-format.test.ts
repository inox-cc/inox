import assert from 'node:assert/strict'
import { test } from 'node:test'

import { formatGeneratedC } from '../../compiler/backends/cpp/format.ts'

test('generated C++ разбивает длинный call statement по аргументам и сохраняет короткий', () => {
  const longCall =
    '  auto page = URL::from(inox::String("/documentation/reference/generated-code", 39), inox::String("https://example.com/base/path", 29), true, &inox_shape_library_result_0);'
  const code = formatGeneratedC(`${longCall}\n  page.close();\n`, 'generated.cc')

  assert.match(
    code,
    /auto page = URL::from\(\n    inox::String\("\/documentation\/reference\/generated-code", 39\),\n    inox::String\("https:\/\/example\.com\/base\/path", 29\),\n    true,\n    &inox_shape_library_result_0\n  \);/
  )
  assert.match(code, /  page\.close\(\);/)

  for (const line of code.split('\n')) {
    assert.ok(line.length <= 130)
  }
})
