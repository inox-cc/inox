import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'

test('class для тела @inline method определяется в header раньше использующего class', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/index.ts',
        source:
          'export class Reader { /** @inline */ read(value: Box): number { return value.value } }\nexport class Box { value: number; constructor(value: number) { this.value = value } }\nnew Reader().read(new Box(7))\n'
      }
    ],
    { root: '/' }
  )
  const files = compileFileToCModuleTextsSync('/pkg/index.ts', {
    callMain: true,
    host,
    sourceRoot: '/pkg'
  })
  const header = files.find((file) => file.path === 'index.h')

  assert.ok(header)

  const boxIndex = header.code.indexOf('class Box ')
  const readerIndex = header.code.indexOf('class Reader ')

  assert.notEqual(boxIndex, -1)
  assert.notEqual(readerIndex, -1)
  assert.ok(boxIndex < readerIndex)
  assert.match(header.code, /double read\(const Box& value\) \{/)
})
