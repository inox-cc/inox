import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'

test('header объявляет class до прототипа и определяет его до тела @inline function', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/index.ts',
        source:
          '/** @inline */ export function read(value: Box): number { return value.value }\nexport class Box { value: number; constructor(value: number) { this.value = value } }\nread(new Box(7))\n'
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

  const forwardIndex = header.code.indexOf('class Box;')
  const prototypeIndex = header.code.indexOf('read(const Box& value);')
  const classIndex = header.code.indexOf('class Box :')
  const definitionIndex = header.code.indexOf('read(const Box& value) {')

  assert.notEqual(forwardIndex, -1)
  assert.ok(forwardIndex < prototypeIndex)
  assert.ok(prototypeIndex < classIndex)
  assert.ok(classIndex < definitionIndex)
})
