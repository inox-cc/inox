import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('shape небольшого объекта объявляется один раз вне пользовательской функции', () => {
  const result = compileSource(
    "function create() { const value = { name: 'inox', count: 2 }; console.log(value.count) }\ncreate()\n",
    { libraries: defaultCompilerLibrarySet, target: 'cc' }
  )
  const shapeIndex = result.code.indexOf('static const inox_shape inox_object_shape_0 =')
  const functionIndex = result.code.indexOf('void create()')

  assert.ok(shapeIndex >= 0)
  assert.ok(functionIndex > shapeIndex)
  assert.match(result.code, /static const inox_shape inox_object_shape_0 = \{ 2, inox_object_shape_0_fields \};/)
  assert.doesNotMatch(result.code, /static const inox_shape [^\n]+ = \{\n/)
})
