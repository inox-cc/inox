import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('dynamic object сохраняется внутри вложенного array TypeRef', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/index.ts',
        source: `
type Shape = { readonly fields: AnyNode[] }

export function read(consequent: Shape, alternate: Shape): boolean {
  const shapes = [consequent, alternate]
  for (const shape of shapes) {
    for (const sourceField of shape.fields) {
      if (sourceField.optional === true) return true
    }
  }
  return false
}
`
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

  assert.ok(files.find((file) => file.path === 'index.cc'))
})
