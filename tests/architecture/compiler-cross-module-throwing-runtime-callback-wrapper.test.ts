import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('runtime callback wrapper converts pending exception to callback status', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/index.ts',
        source: `
import { implementation } from './implementation.ts'

type Callback = (value: object, label?: string) => object | null
const callback: Callback = implementation
`
      },
      {
        path: '/pkg/implementation.ts',
        source: `
export function implementation(value: object, label?: string): object | null {
  if (label === 'fail') throw label
  return value
}
`
      }
    ],
    { root: '/' }
  )
  const files = compileFileToCppModuleTextsSync('/pkg/index.ts', {
    callMain: false,
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  })
  const source = files.find((file) => file.path === 'index.cc')

  assert.ok(source)
  assert.match(
    source.code,
    /inox_value inox_callback_result = inox_mod_implementation_ts_[a-f0-9]+_implementation\(args\[0\], args\[1\]\);/
  )
  assert.match(source.code, /if \(inox::thrown\(\)\) return INOX_ERR_THROW;/)
  assert.match(source.code, /\*out = inox_callback_result;/)
  assert.doesNotMatch(source.code, /\binox_callback_error\b/)
  assert.doesNotMatch(source.code, /\binox_callback_status\b/)
})
