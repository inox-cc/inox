import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('module header включает facade для native-типа во вложенной function signature', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/index.ts',
        source: 'export function run(callback: () => Set<string>): void {}\n'
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
  const header = files.find((file) => file.path === 'index.h')
  const source = files.find((file) => file.path === 'index.cc')

  assert.ok(header)
  assert.ok(source)
  assert.match(header.code, /#include "inox\/set\.h"/)
  assert.match(header.code, /Set \(\*callback\)\(void\)/)
  assert.equal(source.code.match(/#include "inox\/set\.h"/g)?.length ?? 0, 0)
})
