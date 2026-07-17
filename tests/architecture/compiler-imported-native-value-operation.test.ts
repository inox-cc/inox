import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('relative import сохраняет native type для выбора package operation', () => {
  const host = createMemoryCompilerHost(
    [
      { path: '/values.ts', source: 'export const values: readonly string[] = []' },
      {
        path: '/main.ts',
        source: `
import { values } from './values.ts'
export function has(value: string): boolean {
  return values.includes(value)
}
`
      }
    ],
    { root: '/' }
  )
  const files = compileFileToCModuleTextsSync('/main.ts', {
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/'
  })
  const source = files.find((file) => file.path === 'main.cc')?.code ?? ''

  assert.match(source, /Array\([^\n]+\)\.includes\(/)
  assert.doesNotMatch(source, /inox::String\([^\n]+\)\.includes\(/)
})
