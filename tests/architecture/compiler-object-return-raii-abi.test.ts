import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('структурный object возвращается через RAII ABI', () => {
  const host = createMemoryCompilerHost(
    [{ path: '/pkg/index.ts', source: 'export function make(): { count: number } { return { count: 2 } }\n' }],
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
  assert.match(header.code, /inox::ObjectValue inox_mod_index_ts_[a-f0-9]+_make\(\);/)
  assert.match(source.code, /inox::ObjectValue inox_mod_index_ts_[a-f0-9]+_make\(\)/)
  assert.doesNotMatch(source.code, /inox_retain\(inox_return\)/)
})
