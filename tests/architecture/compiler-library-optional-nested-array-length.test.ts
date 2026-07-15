import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('optional nested array сохраняет базовую семантику length', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/index.ts',
        source: `
type Parameter = { readonly name: string }
type Operation = { readonly typeParameters?: Parameter[] }

export function count(operation: Operation): number {
  return operation.typeParameters?.length ?? 0
}
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

  assert.ok(files.find((file) => file.path === 'index.cc'))
})
