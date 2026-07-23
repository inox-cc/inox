import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('array returnTypeRef проходит через границу модулей', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/source.ts',
        source:
          'type Item = { readonly name: string }\ntype ItemList = Item[]\nexport function values(): ItemList { return [] }\n'
      },
      {
        path: '/pkg/consumer.ts',
        source:
          "import { values } from './source.ts'\nexport function count(): number { return values().length }\n"
      }
    ],
    { root: '/' }
  )
  const files = compileFileToCppModuleTextsSync('/pkg/consumer.ts', {
    callMain: false,
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  })

  assert.ok(files.find((file) => file.path === 'consumer.cc'))
})
