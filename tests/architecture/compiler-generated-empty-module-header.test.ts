import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('module header без exported declarations не содержит runtime includes', () => {
  const host = createMemoryCompilerHost(
    [{ path: '/pkg/index.ts', source: 'const values = [1]\nconsole.log(values.length)\n' }],
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
  assert.doesNotMatch(header.code, /^#include /m)
  assert.match(header.code, /void inox_mod_index_ts_[a-f0-9]+_init\(\);/)
  assert.match(source.code, /#include "index\.h"/)
  assert.match(source.code, /#include "inox\/array\.h"/)
  assert.match(source.code, /#include "inox\/console\.h"/)
})
