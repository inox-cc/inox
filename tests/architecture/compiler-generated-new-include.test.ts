import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('C++20 coroutine не требует ручного placement new в generated C++', () => {
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
  assert.doesNotMatch(asyncTask.code, /#include <new>/)
  assert.doesNotMatch(asyncTask.code, /new \(frame_memory\)/)
  assert.match(asyncTask.code, /inox::Promise run\(\)/)
  assert.match(asyncTask.code, /co_await/)
  assert.doesNotMatch(asyncTask.code, /inox_async_task_/)
})
