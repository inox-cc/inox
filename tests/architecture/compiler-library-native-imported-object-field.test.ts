import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('imported object type сохраняет package-native TypeRef поля', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/types.ts',
        source: 'export type Holder = { values: Map<number, string[]> }\n'
      },
      {
        path: '/pkg/index.ts',
        source: `
import type { Holder } from './types.ts'

const holder: Holder = { values: new Map<number, string[]>() }
const values = holder.values
values.set(1, ['ok'])
`
      }
    ],
    { root: '/' }
  )
  const files = compileFileToCModuleTextsSync('/pkg/index.ts', {
    callMain: false,
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  })
  const source = files.find((file) => file.path === 'index.cc')

  assert.ok(source)
  assert.match(source.code, /auto inox_module_value_\d+ = Map\(inox_value_\d+\);/)
  assert.match(source.code, /values\.set/)
})
