import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('runtime callback wrapper calls a throwing cross-module function through status ABI', () => {
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
  const files = compileFileToCModuleTextsSync('/pkg/index.ts', {
    callMain: false,
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  })
  const source = files.find((file) => file.path === 'index.cc')

  assert.ok(source)
  assert.match(
    source.code,
    /inox_status inox_callback_status = inox_mod_implementation_ts_[a-f0-9]+_implementation\(\s*args\[0\],\s*args\[1\],\s*&inox_callback_result,\s*&inox_callback_error\s*\);/
  )
  assert.match(
    source.code,
    /if \(inox_callback_status == INOX_ERR_THROW\) \{\s+inox::throw_value\(inox_callback_error\);\s+\}/
  )
  assert.doesNotMatch(source.code, /\*out = inox_mod_implementation_ts_[a-f0-9]+_implementation\(/)
})
