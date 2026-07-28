import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('generated C++ не оборачивает scalar result adapter повторным static_cast того же типа', () => {
  const result = compileSource(
    `
      const values: Map<string, string> = new Map()
      console.log(values.size)
    `,
    { libraries: defaultCompilerLibrarySet, target: 'cc' }
  )

  assert.match(result.code, /static_cast<double>\(values\.size\(\)\)/)
  assert.doesNotMatch(result.code, /auto inox_library_result_\d+ = values\.size\(\)/)
  assert.doesNotMatch(result.code, /static_cast<double>\(static_cast<double>\(/)
})
