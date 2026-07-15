import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('array TypeRef unknown не затирает metadata объявленного элемента', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/index.ts',
        source: `
type Scope = Map<string, boolean>

export function contains(scopes: Scope[], name: string): boolean {
  const scope = scopes[0]
  return scope.has(name)
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
