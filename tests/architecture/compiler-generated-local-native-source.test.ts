import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('module source включает facade для native-типа локальной сигнатуры', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/index.ts',
        source:
          'function cast(value: unknown): Set<string> { return value as Set<string> }\nexport function run(value: unknown): void { cast(value) }\n'
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
  assert.doesNotMatch(header.code, /#include "inox\/set\.h"/)
  assert.match(source.code, /#include "inox\/set\.h"/)
  assert.match(source.code, /inox_return = Set\(value\)/)
})
