import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import type { AnyNode } from '../../compiler/types.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import { compilerLibraryPackage as promiseCompilerLibraryPackage } from '../../stdlib/global/promise/compiler/index.ts'
import { compilerLibraryPackageWithGlobalDeclaration } from './helpers/compiler-library-fixtures.ts'
import { futureLibrarySet } from './helpers/compiler-future-library-fixtures.ts'

test('Promise и alternate async-result provider сохраняют одинаковую operation metadata', () => {
  const promise = compileSource(behaviorSource('Promise', 'resolve', 'reject', 'then', 'catch'), {
    libraries: createCompilerLibrarySet([
      compilerLibraryPackageWithGlobalDeclaration(promiseCompilerLibraryPackage, 'stdlib/global/promise/index.d.ts')
    ]),
    target: 'cc'
  })
  const future = compileSource(behaviorSource('Future', 'succeed', 'fail', 'map', 'recover'), {
    libraries: futureLibrarySet('FixtureFuture'),
    target: 'cc'
  })

  assert.deepEqual(operationSnapshot(future.ir.body), operationSnapshot(promise.ir.body))
  assert.match(future.code, /FixtureFuture::resolve\(\)/)
  assert.match(future.code, /FixtureFuture::reject\(\)/)
  assert.match(future.code, /\.then\(/)
  assert.match(future.code, /\.catchError\(/)
  assert.doesNotMatch(future.code, /inox::Promise|\.succeed\(|\.fail\(|\.map\(|\.recover\(/)
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
