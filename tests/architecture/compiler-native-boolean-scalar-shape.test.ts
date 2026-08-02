import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('статически известный boolean остаётся bool вне runtime-границ', () => {
  const result = compileSource(
    'function selectValue(flag: boolean): number { return flag ? 7 : 9 }\nconsole.log(selectValue(true), selectValue(false))\n',
    {
      libraries: defaultCompilerLibrarySet,
      target: 'cc'
    }
  )

  assert.match(result.code, /double selectValue\(bool flag\)/)
  assert.match(result.code, /selectValue\(true\)/)
  assert.match(result.code, /selectValue\(false\)/)
  assert.doesNotMatch(result.code, /selectValue\([01]\)/)
})
