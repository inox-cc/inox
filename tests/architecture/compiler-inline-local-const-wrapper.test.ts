import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'

test('локальный @inline const arrow генерирует inline runtime callback wrapper', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/index.ts',
        source:
          'function outer(): number {\n/** @inline */\nconst increment = (value: number) => value + 1\nreturn increment(1)\n}\nouter()\n'
      }
    ],
    { root: '/' }
  )
  const files = compileFileToCppModuleTextsSync('/pkg/index.ts', {
    callMain: true,
    host,
    sourceRoot: '/pkg'
  })
  const source = files.find((file) => file.path === 'index.cc')

  assert.ok(source)
  assert.match(source.code, /static inline inox_status inox_callback_arrow_[0-9]+\(/)
  assert.match(source.code, /inox_callback_new\(&inox_default_allocator, inox_callback_arrow_[0-9]+,/)
})
