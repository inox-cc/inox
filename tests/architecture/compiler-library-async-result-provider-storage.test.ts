import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { emitReturnValueDeclarations } from '../../compiler/c/context.ts'
import { futureLibrarySet } from './helpers/compiler-future-library-fixtures.ts'

test('async-result physical storage использует cppType выбранного provider-а', () => {
  const libraries = futureLibrarySet('FixtureFuture')
  const result = compileSource(
    `
function forward(input: Future<number>): Future<number> { return input }
function reserve(): void { let pending: Future<number> }
class Host { constructor(input: Future<number>) {} }
new Host(Future.succeed(1))
`,
    { libraries, target: 'cc' }
  )
  const returnContext: Parameters<typeof emitReturnValueDeclarations>[0] & { libraries: object } = {
    libraries,
    returnNullable: false,
    returnType: 'async-result'
  }

  assert.match(result.code, /FixtureFuture forward\(FixtureFuture input\)/)
  assert.match(result.code, /Host\(FixtureFuture input\)/)
  assert.match(result.code, /FixtureFuture pending\{\};/)
  assert.doesNotMatch(result.code, /\binox_promise/)
  assert.deepEqual(emitReturnValueDeclarations(returnContext), ['FixtureFuture inox_return{};'])
})
