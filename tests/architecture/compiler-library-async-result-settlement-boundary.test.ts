import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCppModulesSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import type { ModuleDeclarationImport } from '../../compiler/types.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('imported throwing async calls settle through provider C++ operations', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/provider.ts',
        source: `
export async function load(fail: boolean): Promise<string> {
  if (fail) {
    throw new Error('failed')
  }

  return 'ready'
}
`
      },
      {
        path: '/pkg/consumer.ts',
        source: `
import { load } from './provider.ts'

export function forward(fail: boolean): Promise<string> {
  return load(fail)
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
        functionEffects: module.ir?.functionEffects ?? [],
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
  assert.match(source.code, /inox_async_result_\d+ = inox_mod_provider_ts_[a-f0-9]+_load\(fail\);/)
  assert.match(source.code, /if \(inox::thrown\(\)\) \{\s+inox_error = inox::take_exception\(\);/)
  assert.match(source.code, /inox::Promise::reject\(inox_error\)/)
  assert.match(source.code, /inox::Promise::resolve\(inox_async_result_\d+\)/)
  assert.doesNotMatch(source.code, /\binox_async_status\b/)
  assert.doesNotMatch(source.code, /\binox_error_out\b/)
  assert.doesNotMatch(source.code, /\binox_promise_(?:resolved|rejected)\b/)
})
