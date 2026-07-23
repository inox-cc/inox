import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('локальный C++ class содержит определения конструктора и методов внутри class body', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/index.ts',
        source:
          'class Box { value: number; constructor(value: number) { this.value = value } read(): number { return this.value } }\nconst box = new Box(7)\nconsole.log(box.read())\nconsole.log(box)\n'
      }
    ],
    { root: '/' }
  )
  const files = compileFileToCppModuleTextsSync('/pkg/index.ts', {
    callMain: true,
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  })
  const source = files.find((file) => file.path === 'index.cc')

  assert.ok(source)
  assert.match(source.code, /class Box[^{]*\{[\s\S]*Box\(double value\) : value\(0\) \{[\s\S]*double read\(\) \{/)
  assert.match(source.code, /static inox_status inox_read_field\(const Box& value/)
  assert.doesNotMatch(source.code, /Box::Box|Box::read|Box::inox_read_field/)
})
