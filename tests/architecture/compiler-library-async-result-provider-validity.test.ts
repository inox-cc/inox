import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { futureLibrarySet } from './helpers/compiler-future-library-fixtures.ts'

test('обычная async-result функция проверяет результат через выбранный provider', () => {
  const result = compileSource(
    `
function create(): Future<number> { return Future.succeed(1) }
function forward(): Future<number> { return create() }
forward()
`,
    { libraries: futureLibrarySet('FixtureFuture'), target: 'cc' }
  )

  assert.match(result.code, /FixtureFuture::taskValid\(FixtureFuture\(inox_return\)\)/)
  assert.doesNotMatch(result.code, /inox_return == 0/)
  assert.doesNotMatch(result.code, /inox::Promise/)
})
