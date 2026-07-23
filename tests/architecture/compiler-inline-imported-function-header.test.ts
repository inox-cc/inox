import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'

test('экспортируемая @inline function подключает header импортированной функции', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/base.ts',
        source: 'export function base(value: number): number { return value + 1 }\n'
      },
      {
        path: '/pkg/index.ts',
        source:
          "import { base } from './base.ts'\n/** @inline */\nexport function add(value: number): number { return base(value) + 1 }\n"
      }
    ],
    { root: '/' }
  )
  const files = compileFileToCModuleTextsSync('/pkg/index.ts', {
    callMain: false,
    host,
    sourceRoot: '/pkg'
  })
  const header = files.find((file) => file.path === 'index.h')

  assert.ok(header)
  assert.match(header.code, /#include "base.h"/)
  assert.match(header.code, /return = \(inox_mod_[^(]+_base\(value\) \+ 1\)/)
})
