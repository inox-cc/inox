import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'

test('@inline constructor экспортируемого class определяется в .h', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/index.ts',
        source:
          'export class Box { value: number; /** @inline */ constructor(value: number) { this.value = value } read(): number { return this.value } }\nnew Box(7).read()\n'
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
  assert.match(header.code, /Box\(double value\) : value\(0\) \{/)
  assert.match(header.code, /#include "inox\/value.h"/)
  assert.doesNotMatch(source.code, /Box::Box\(double value\)/)
})
