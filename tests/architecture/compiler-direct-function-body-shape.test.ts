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

  assert.doesNotMatch(body, /double inox_return = 0;\n\s+\{/)
  assert.equal(body.match(/return inox_return;/g)?.length, 1)
})
