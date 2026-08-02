import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('гарантированный string возвращается через RAII ABI', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/index.ts',
        source: `
const settings = { status: 'ready' }

export function status(): string {
  return settings.status
}

console.log(status())
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
  const header = files.find((file) => file.path === 'index.h')
  const source = files.find((file) => file.path === 'index.cc')

  assert.ok(header)
  assert.ok(source)
  assert.match(header.code, /inox::String inox_mod_index_ts_[a-f0-9]+_status\(\);/)
  assert.match(source.code, /inox::String inox_mod_index_ts_[a-f0-9]+_status\(\)/)
  assert.match(source.code, /console\.log\("%s", inox_mod_index_ts_[a-f0-9]+_status\(\)\);/)
  assert.doesNotMatch(source.code, /status\(\);\n\s+if \([^\n]*tag != INOX_TAG_STRING/)
  assert.doesNotMatch(source.code, /inox::String inox_return/)
})
