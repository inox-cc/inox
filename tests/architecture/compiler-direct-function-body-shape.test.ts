import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('обычная non-void функция не получает лишний scope и повторный return', () => {
  const result = compileSource('function value(): number { return 2 }\nconsole.log(value())\n', {
    libraries: defaultCompilerLibrarySet,
    target: 'cc'
  })

  const start = result.code.indexOf('double value()')
  const end = result.code.indexOf('\n}\n', start)
  const body = result.code.slice(start, end)

  assert.doesNotMatch(body, /inox_return/)
  assert.match(body, /return 2;/)
  assert.match(result.code, /console\.log\("%.17g", value\(\)\);/)
  assert.doesNotMatch(result.code, /static_cast<double>\(value\(\)\)/)
})
