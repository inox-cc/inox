import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('entry source не подключает собственный header без declarations', () => {
  const host = createMemoryCompilerHost(
    [{ path: '/pkg/index.ts', source: "console.log('ready')\n" }],
    { root: '/' }
  )
  const files = compileFileToCModuleTextsSync('/pkg/index.ts', {
    callMain: true,
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  })
  const header = files.find((file) => file.path === 'index.h')
  const source = files.find((file) => file.path === 'index.cc')

  assert.ok(header)
  assert.ok(source)
  assert.doesNotMatch(header.code, /^#include |^void |^extern /m)
  assert.doesNotMatch(source.code, /#include "index\.h"/)
  assert.match(source.code, /#include "inox\/main\.h"/)
  assert.match(source.code, /#include "inox\/console\.h"/)
})
