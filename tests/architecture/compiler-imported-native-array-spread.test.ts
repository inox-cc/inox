import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('imported native array spread keeps the prepared C++ facade', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/values.ts',
        source: "export const values = ['a']\n"
      },
      {
        path: '/pkg/index.ts',
        source: "import { values } from './values.ts'\nexport const copy = [...values]\n"
      }
    ],
    { root: '/' }
  )
  const files = compileFileToCppModuleTextsSync('/pkg/index.ts', {
    callMain: false,
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  })
  const source = files.find((file) => file.path === 'index.cc')?.code ?? ''

  assert.match(source, /\.appendAll\(inox_mod_[^)]+_values\);/)
  assert.doesNotMatch(source, /\.appendAll\(Array\(/)
})
