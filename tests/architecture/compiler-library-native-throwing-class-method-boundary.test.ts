import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('throwing class method returns its native result through the pending exception boundary', () => {
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

  assert.match(result.code, /auto inox_method_result_\d+ = reader\.read\(values\);/)
  assert.match(result.code, /if \(inox::thrown\(\)\) return inox_return;/)
  assert.match(result.code, /inox_return = inox_method_result_\d+;/)
  assert.doesNotMatch(result.code, /std::addressof\(inox_method_result_/)
})
