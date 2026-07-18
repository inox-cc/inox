import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { uncheckedIncompleteAsyncResultLibrarySet } from './helpers/compiler-async-result-fixtures.ts'

test('module emission не выбирает raw type для incomplete async-result provider', () => {
  const host = createMemoryCompilerHost([{ path: '/pkg/index.ts', source: 'export const task = makeTask()\n' }], {
    root: '/'
  })

  assert.throws(
    () =>
      compileFileToCModuleTextsSync('/pkg/index.ts', {
        callMain: false,
        host,
        libraries: uncheckedIncompleteAsyncResultLibrarySet(),
        sourceRoot: '/pkg'
      }),
    /Compiler library intrinsic provider async-result requires a resolvable native C\+\+ result type/
  )
})
