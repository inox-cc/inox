import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { futureLibrarySet } from './helpers/compiler-future-library-fixtures.ts'

test('module emission использует только native type валидированного async-result provider', () => {
  const host = createMemoryCompilerHost(
    [{ path: '/pkg/index.ts', source: 'export const task = Future.succeed(1)\n' }],
    { root: '/' }
  )
  const files = compileFileToCppModuleTextsSync('/pkg/index.ts', {
    callMain: false,
    host,
    libraries: futureLibrarySet('FixtureFuture'),
    sourceRoot: '/pkg'
  })
  const output = files.map((file) => file.code).join('\n')

  assert.match(output, /FixtureFuture inox_mod_/)
  assert.doesNotMatch(output, /\binox_promise/)
})
