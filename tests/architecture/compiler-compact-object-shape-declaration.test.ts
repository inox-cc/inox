import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('shape небольшого объекта объявляется одной строкой', () => {
  const result = compileSource('const value = { name: \'inox\', count: 2 }\nconsole.log(value.count)\n', {
    libraries: defaultCompilerLibrarySet,
    target: 'cc'
  })

  assert.match(result.code, /static const inox_shape inox_shape_value_\d+ = \{ 2, inox_shape_value_\d+_fields \};/)
  assert.doesNotMatch(result.code, /static const inox_shape [^\n]+ = \{\n/)
})
