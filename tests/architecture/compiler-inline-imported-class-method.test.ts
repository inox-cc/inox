import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'

test('modular C++ импортирует exported class с @inline method через generated header', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/box.ts',
        source:
          'export class Box { value: number; constructor(value: number) { this.value = value } /** @inline */ read(): number { return this.value } }\n'
      },
      {
        path: '/pkg/index.ts',
        source:
          "import { Box as ImportedBox } from './box.ts'\nconst box = new ImportedBox(7)\nbox.read()\n"
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
  assert.match(source.code, /#include "box.h"/)
  assert.match(source.code, /Box box\{7\};/)
  assert.match(source.code, /box\.read\(\);/)
})
