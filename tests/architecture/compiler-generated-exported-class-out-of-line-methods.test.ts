import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('экспортируемый C++ class сохраняет declarations отдельно от definitions', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/index.ts',
        source:
          'export class Box { value: number; constructor(value: number) { this.value = value } read(): number { return this.value } }\nconst box = new Box(7)\nconsole.log(box.read())\n'
      }
    ],
    { root: '/' }
  )
  const files = compileFileToCModuleTextsSync('/pkg/index.ts', {
    callMain: true,
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  })
  const source = files.find((file) => file.path === 'index.cc')

  assert.ok(source)
  assert.match(source.code, /Box\(double value\);/)
  assert.match(source.code, /double read\(\);/)
  assert.match(source.code, /Box::Box\(double value\)/)
  assert.match(source.code, /double Box::read\(\)/)
})
