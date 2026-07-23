import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCppModulesSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import type { ModuleDeclarationImport } from '../../compiler/types.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('imported async result preserves fulfilled TypeRef through declaration contracts', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/types.ts',
        source: 'export type Result = { ok: boolean }'
      },
      {
        path: '/pkg/provider.ts',
        source: `
import type { Result } from './types.ts'

export async function load(): Promise<Result> {
  return { ok: true }
}
`
      },
      {
        path: '/pkg/consumer.ts',
        source: `
import { load } from './provider.ts'
import type { Result } from './types.ts'

export async function forward(): Promise<Result> {
  return load()
}
`
      }
    ],
    { root: '/' }
  )
  const providerResult = compileFileToCppModulesSync('/pkg/provider.ts', {
    callMain: false,
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  })
  const declarationImports: ModuleDeclarationImport[] = []

  for (const module of providerResult.graph.modules) {
    if (module.declarationProgram !== null && typeof module.declarationProgram !== 'undefined') {
      declarationImports.push({
        sourcePath: module.path,
        resolvedProgram: module.declarationProgram
      })
    }
  }

  const result = compileFileToCppModulesSync('/pkg/consumer.ts', {
    callMain: false,
    declarationImports,
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  })
  const source = result.files.find((file) => file.path === 'consumer.cc')

  assert.ok(source)
  assert.match(source.code, /load\(\)/)
  assert.doesNotMatch(source.code, /INOX_C_ASYNC/)
})
