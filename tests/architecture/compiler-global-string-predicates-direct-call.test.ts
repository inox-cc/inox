import assert from 'node:assert/strict'
import test from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('pure string queries emit direct non-throwing C++ calls', () => {
  const result = compileSource(
    `
function report(value: string): void {
  console.log(
    value.charCodeAt(0),
    value.endsWith('x'),
    value.includes('x'),
    value.indexOf('x'),
    value.lastIndexOf('x'),
    value.startsWith('x')
  )
}
`,
    {
      libraries: defaultCompilerLibrarySet,
      target: 'cc'
    }
  )

  assert.match(result.code, /\.charCodeAt\(0\)/)
  assert.match(result.code, /\.endsWith\("x"\)/)
  assert.match(result.code, /\.includes\("x"\)/)
  assert.match(result.code, /\.indexOf\("x"\)/)
  assert.match(result.code, /\.lastIndexOf\("x"\)/)
  assert.match(result.code, /\.startsWith\("x"\)/)
  assert.doesNotMatch(result.code, /inox_library_result_/)
  assert.doesNotMatch(result.code, /if \(inox::thrown\(\)\) return;/)
})
