import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'

test('неэкспортируемая @inline function генерируется как static inline в .cc', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/index.ts',
        source:
          '/** @inline */\nfunction add(left: number, right: number): number { return left + right }\nadd(1, 2)\n'
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
  const header = files.find((file) => file.path === 'index.h')

  assert.ok(source)
  assert.ok(header)
  assert.match(source.code, /static inline double add\(double left, double right\)/)
  assert.doesNotMatch(header.code, /double add\(/)
})
