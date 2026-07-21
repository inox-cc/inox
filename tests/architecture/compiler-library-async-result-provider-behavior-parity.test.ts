import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import type { AnyNode } from '../../compiler/types.ts'
import {
  futureIntrinsicBindingId,
  futureLibraryId,
  futureLibrarySet,
  futureNativeTypeId
} from './helpers/compiler-future-library-fixtures.ts'

test('независимый async-result provider сохраняет универсальную operation metadata', () => {
  const libraries = futureLibrarySet('FixtureFuture')
  const future = compileSource(behaviorSource('Future', 'succeed', 'fail', 'map', 'recover'), {
    libraries,
    target: 'cc'
  })
  const providerBinding = libraries.intrinsicBindings.find((binding) => binding.role === 'async-result')
  const providerType = libraries.nativeTypes.find((nativeType) => nativeType.typeId === futureNativeTypeId)
  const providerOperations = libraries.operations.filter((operation) => operation.asyncResultOperation)

  assert.equal(providerBinding?.bindingId, futureIntrinsicBindingId)
  assert.equal(providerType?.libraryId, futureLibraryId)
  assert.ok(providerOperations.every((operation) => operation.libraryId === futureLibraryId))

  assert.deepEqual(operationSnapshot(future.ir.body), [
    { operation: 'fulfill', valueType: 'async-result' },
    { operation: 'reject', valueType: 'async-result' },
    { operation: 'map-fulfilled', valueType: 'async-result' },
    { operation: 'map-rejected', valueType: 'async-result' }
  ])
  assert.match(future.code, /FixtureFuture::completed\(\)/)
  assert.match(future.code, /FixtureFuture::failed\(\)/)
  assert.match(future.code, /\.transformValue\(/)
  assert.match(future.code, /\.recoverFailure\(/)
  assert.doesNotMatch(future.code, /\.succeed\(|\.fail\(|\.map\(|\.recover\(/)
})

function behaviorSource(
  typeName: string,
  resolveName: string,
  rejectName: string,
  thenName: string,
  catchName: string
): string {
  return `
const resolved = ${typeName}.${resolveName}()
const rejected = ${typeName}.${rejectName}()
const mapped = resolved.${thenName}(() => 1)
const recovered = rejected.${catchName}(() => 1)
`
}

function operationSnapshot(body: AnyNode[]): Array<{ operation: string | null; valueType: string | null }> {
  return body.map((statement) => ({
    operation: statement.init?.libraryAsyncResultOperation ?? null,
    valueType: statement.init?.valueType ?? null
  }))
}
