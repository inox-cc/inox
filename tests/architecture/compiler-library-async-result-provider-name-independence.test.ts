import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor, LibraryAsyncResultOperationKind } from '../../compiler/extensions/types.ts'
import { compilerLibraryPackage as errorCompilerLibraryPackage } from '../../stdlib/global/error/compiler/index.ts'
import {
  compilerLibraryPackage as promiseCompilerLibraryPackage,
  promiseNativeTypeId,
  promiseRuntimeRequirement
} from '../../stdlib/global/promise/compiler/index.ts'
import { compilerLibraryPackageWithGlobalDeclaration } from './helpers/compiler-library-fixtures.ts'

test('async-result lowering не зависит от исходных имён методов provider-а', () => {
  const result = compileSource(
    `
async function work(): Future<number> {
  const value = await Future.succeed(1).map((item) => item + 1)
  return value
}

const mapped = await Future.succeed(2).map((item) => item + 1)
const recovered = await Future.fail(new Error('failed')).recover((reason) => reason.message)
await work()
`,
    { libraries: futureLibrarySet(), target: 'cc' }
  )

  assert.ok(result.ir.runtimeRequirements.includes(promiseRuntimeRequirement))
  assert.match(result.code, /#include "inox\/promise\.h"/)
  assert.match(result.code, /inox::Promise::resolve\(/)
  assert.match(result.code, /\.then\(/)
  assert.match(result.code, /inox::Promise::reject\(/)
  assert.match(result.code, /\.catchError\(/)
  assert.match(result.code, /auto inox_value_\d+ = inox::get\(reason, "message"\);/)
  assert.doesNotMatch(result.code, /\.succeed\(/)
  assert.doesNotMatch(result.code, /\.fail\(/)
  assert.doesNotMatch(result.code, /\.map\(/)
  assert.doesNotMatch(result.code, /\.recover\(/)
})

function futureLibrarySet() {
  const library: CompilerLibraryDescriptor = {
    ...promiseCompilerLibraryPackage,
    declarations: [
      {
        libraryId: promiseCompilerLibraryPackage.id,
        kind: 'global',
        source: 'tests/architecture/fixtures/future.d.ts',
        compilerImplemented: true,
        declarationSource: `
export {}

declare global {
  class Future<T> {
    constructor(executor: (resolve: (value: T) => void, reject: (reason: unknown) => void) => void);

    static succeed<T>(value: T): Future<T>;
    static fail<E>(reason: E): Future<unknown>;

    map<U>(onFulfilled: (value: T) => U): Future<U>;
    recover(onRejected: (reason: unknown) => T): Future<T>;
  }
}
`
      }
    ],
    nativeTypes: (promiseCompilerLibraryPackage.nativeTypes ?? []).map((item) => ({
      ...item,
      declarationNames: ['Future']
    })),
    operations: promiseCompilerLibraryPackage.operations.map((operation) => ({
      ...operation,
      bindingId: futureBindingId(operation.asyncResultOperation, operation.bindingId)
    })),
    intrinsicBindings: [{ role: 'async-result', bindingId: 'global:Future' }]
  }

  return createCompilerLibrarySet([
    compilerLibraryPackageWithGlobalDeclaration(errorCompilerLibraryPackage, 'stdlib/global/error/index.d.ts'),
    library
  ])
}

function futureBindingId(operation: LibraryAsyncResultOperationKind | null | undefined, fallback: string): string {
  if (operation === 'construct') {
    return 'global:Future'
  }

  if (operation === 'resolve') {
    return 'global:Future.succeed'
  }

  if (operation === 'reject') {
    return 'global:Future.fail'
  }

  if (operation === 'then') {
    return `${promiseNativeTypeId}.map`
  }

  if (operation === 'catch') {
    return `${promiseNativeTypeId}.recover`
  }

  return fallback
}
