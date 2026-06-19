import assert from 'node:assert/strict'
import test from 'node:test'
import {
  fetchHeadersRuntimeMethod,
  isAsyncFetchRuntimeMethod,
  isFetchAbortControllerMethod,
  isFetchGlobalRoot,
  isFetchHeadersMethod,
  isFetchInitOption,
  isFetchRedirectMode,
  isFetchResponseBodyMethod,
  isSupportedFetchResponseBodyMethod
} from '../compiler/stdlib/descriptors/fetch.ts'

test('classifies fetch globals and init options', () => {
  assert.equal(isFetchGlobalRoot('fetch'), true)
  assert.equal(isFetchGlobalRoot('AbortController'), true)
  assert.equal(isFetchGlobalRoot('Response'), false)
  assert.equal(isFetchInitOption('method'), true)
  assert.equal(isFetchInitOption('headers'), true)
  assert.equal(isFetchInitOption('cache'), false)
})

test('classifies fetch redirect and body helpers', () => {
  assert.equal(isFetchRedirectMode('follow'), true)
  assert.equal(isFetchRedirectMode('manual'), true)
  assert.equal(isFetchRedirectMode('same-origin'), false)
  assert.equal(isFetchResponseBodyMethod('text'), true)
  assert.equal(isFetchResponseBodyMethod('json'), true)
  assert.equal(isSupportedFetchResponseBodyMethod('text'), true)
  assert.equal(isSupportedFetchResponseBodyMethod('json'), false)
})

test('maps fetch headers and async runtime methods', () => {
  assert.equal(isFetchHeadersMethod('get'), true)
  assert.equal(isFetchHeadersMethod('append'), false)
  assert.equal(fetchHeadersRuntimeMethod('get'), 'headersGet')
  assert.equal(fetchHeadersRuntimeMethod('has'), 'headersHas')
  assert.equal(isFetchAbortControllerMethod('abort'), true)
  assert.equal(isFetchAbortControllerMethod('signal'), false)
  assert.equal(isAsyncFetchRuntimeMethod('fetch'), true)
  assert.equal(isAsyncFetchRuntimeMethod('text'), true)
  assert.equal(isAsyncFetchRuntimeMethod('headersGet'), false)
})
