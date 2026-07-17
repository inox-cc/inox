import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('throwing class method uses the native result address', () => {
  const result = compileSource(
    `
class Reader {
  read(values: Array<string>): Array<string> {
    if (values) throw 'error'
    return values
  }
}

function consume(values: Array<string>): Array<string> {
  const reader = new Reader()
  return reader.read(values)
}
`,
    {
      libraries: defaultCompilerLibrarySet,
      target: 'cc'
    }
  )

  assert.match(result.code, /Array inox_method_result_/)
  assert.match(result.code, /std::addressof\(inox_method_result_/)
  assert.doesNotMatch(result.code, /&inox_method_result_/)
})
