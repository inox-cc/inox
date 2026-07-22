import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('generated C++ включает new только при фактическом placement new', () => {
  const callback = compileSource("setTimeout(() => console.log('done'), 0)\n", {
    libraries: defaultCompilerLibrarySet,
    target: 'cc'
  })
  const asyncTask = compileSource(
    'async function run(): Promise<number> { const value = await Promise.resolve(1); return value }\nrun()\n',
    { libraries: defaultCompilerLibrarySet, target: 'cc' }
  )

  assert.doesNotMatch(callback.code, /#include <new>/)
  assert.doesNotMatch(callback.code, /new \(/)
  assert.match(asyncTask.code, /#include <new>/)
  assert.match(asyncTask.code, /new \(frame_memory\)/)
})
