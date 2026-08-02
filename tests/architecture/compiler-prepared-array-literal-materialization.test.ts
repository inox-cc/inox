import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('подготовленные элементы массива собираются одним Array::from', () => {
  const result = compileSource(
    'function size(): number {\n' +
      '  const items: Array<{ size: number } | null> = [null, { size: 12 }]\n' +
      '  return items.length\n' +
      '}\n' +
      'console.log(size())\n',
    { libraries: defaultCompilerLibrarySet, target: 'cc' }
  )

  assert.match(result.code, /auto items = Array::from\(\{ inox_null_value\(\), inox_object_\d+ \}\);/)
  assert.doesNotMatch(result.code, /auto items = Array::create\(0\);/)
  assert.doesNotMatch(result.code, /items\.push\(/)
})
