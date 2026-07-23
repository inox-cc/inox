import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'

test('@inline method экспортируемого class определяется в .h, остальные методы остаются out-of-line', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/index.ts',
        source:
          'export class Box { value: number; constructor(value: number) { this.value = value } /** @inline */ read(): number { return this.value } twice(): number { return this.value * 2 } }\nnew Box(7).read()\n'
      }
    ],
    { root: '/' }
  )
  const files = compileFileToCModuleTextsSync('/pkg/index.ts', {
    callMain: true,
    host,
    sourceRoot: '/pkg'
  })
  const source = files.find((file) => file.path === 'index.cc')
  const header = files.find((file) => file.path === 'index.h')

  assert.ok(source)
  assert.ok(header)
  assert.match(header.code, /class Box \{[\s\S]*double read\(\) \{[\s\S]*double twice\(\);/)
  assert.doesNotMatch(source.code, /class Box \{/)
  assert.doesNotMatch(source.code, /Box::read/)
  assert.match(source.code, /double Box::twice\(\)/)
})
