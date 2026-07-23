import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'

test('экспортируемый @inline const arrow понижается до inline function в .h', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/index.ts',
        source: '/** @inline */\nexport const increment = (value: number) => value + 1\nincrement(1)\n'
      }
    ],
    { root: '/' }
  )
  const files = compileFileToCppModuleTextsSync('/pkg/index.ts', {
    callMain: true,
    host,
    sourceRoot: '/pkg'
  })
  const header = files.find((file) => file.path === 'index.h')

  assert.ok(header)
  assert.match(header.code, /inline double inox_mod_[^(]+_increment\(double value\) \{/)
  assert.doesNotMatch(header.code, /extern .+ increment/)
})
