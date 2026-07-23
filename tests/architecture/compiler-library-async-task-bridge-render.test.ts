import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  compilerLibraryIntrinsicNativeCAsyncTaskBridge,
  renderCompilerLibraryCAsyncTaskBridgeExpression
} from '../../compiler/backends/cpp/value-types.ts'
import { futureLibrarySet } from './helpers/compiler-future-library-fixtures.ts'

test('native async-task bridge доступен через intrinsic provider и нейтрально рендерится', () => {
  const bridge = compilerLibraryIntrinsicNativeCAsyncTaskBridge(futureLibrarySet('FixtureFuture'), 'async-result')

  assert.notEqual(bridge, null)

  if (bridge === null) {
    return
  }

  assert.equal(
    renderCompilerLibraryCAsyncTaskBridgeExpression(bridge, {
      kind: 'valid',
      source: 'frame->promise'
    }),
    'FixtureFuture::bridgeReady(frame->promise)'
  )
  assert.equal(
    renderCompilerLibraryCAsyncTaskBridgeExpression(bridge, {
      kind: 'fulfill',
      target: 'frame->promise',
      value: 'result'
    }),
    'FixtureFuture::bridgeComplete(frame->promise, result)'
  )
})
