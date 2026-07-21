import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import {
  assertFutureValidityContract,
  futureLibrarySet
} from './helpers/compiler-future-library-fixtures.ts'

test('обычная async-result функция проверяет результат через выбранный provider', () => {
  const result = compileSource(
    `
function create(): Future<number> { return Future.succeed(1) }
function forward(): Future<number> { return create() }
const offset = 1
const constructed = new Future<number>((complete) => complete(1))
const mapped = Future.succeed(1).map((value) => value + offset)
const rejected = Future.fail(1)
const native = futureFromNative(1)
forward()
`,
    { libraries: futureLibrarySet('FixtureFuture'), target: 'cc' }
  )

  assert.match(result.code, /FixtureFuture::bridgeReady\(inox_return\)/)
  assert.match(result.code, /FixtureFuture::bridgeReady\(constructed\)/)
  assert.match(result.code, /FixtureFuture::bridgeReady\(mapped\)/)
  assert.match(result.code, /FixtureFuture::bridgeReady\(rejected\)/)
  assert.match(result.code, /FixtureFuture::bridgeReady\(native\)/)
  assert.doesNotMatch(result.code, /inox_return == 0/)
  assertFutureValidityContract(result.code)
})
