import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { futureLibrarySet } from './helpers/compiler-future-library-fixtures.ts'

test('async task принимает constructor suspension source по package metadata', () => {
  const result = compileSource(
    `
async function createValue(): Future<number> {
  const value = await new Future<number>((complete) => {
    complete(7)
  })

  return value
}
`,
    {
      libraries: futureLibrarySet('FixtureFuture'),
      target: 'cc'
    }
  )

  assert.match(result.code, /FixtureFuture::launch\(\)/)
  assert.match(result.code, /FixtureFuture::bridgeWatch\(/)
  assert.doesNotMatch(result.code, /Promise/)
})
