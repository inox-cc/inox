import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  compilerLibraryIntrinsicAsyncResultCValidExpression,
  compilerLibraryIntrinsicNativeCCoroutineAwaitExpression
} from '../../compiler/backends/cpp/value-types.ts'
import { futureLibrarySet } from './helpers/compiler-future-library-fixtures.ts'

test('native coroutine contract доступен через intrinsic provider и нейтрально рендерится', () => {
  const libraries = futureLibrarySet('FixtureFuture')
  const coroutineAwait = compilerLibraryIntrinsicNativeCCoroutineAwaitExpression(libraries, 'async-result')

  assert.equal(compilerLibraryIntrinsicAsyncResultCValidExpression(libraries, 'result'), 'FixtureFuture::bridgeReady(result)')
  assert.equal(coroutineAwait, 'co_await FixtureFuture::bridgeAwait($value)')
})
