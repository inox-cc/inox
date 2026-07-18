import { createCompilerLibrarySet } from '../../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor, LibraryAsyncResultOperationKind } from '../../../compiler/extensions/types.ts'
import { compilerLibraryPackage as errorCompilerLibraryPackage } from '../../../stdlib/global/error/compiler/index.ts'
import {
  compilerLibraryPackage as promiseCompilerLibraryPackage,
  promiseNativeTypeId
} from '../../../stdlib/global/promise/compiler/index.ts'
import { compilerLibraryPackageWithGlobalDeclaration } from './compiler-library-fixtures.ts'

export function futureLibrarySet(cppType = 'inox::Promise') {
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
      declarationNames: ['Future'],
      cppType,
      cValueAdapter: `${cppType}($value)`
    })),
    operations: promiseCompilerLibraryPackage.operations.map((operation) => ({
      ...operation,
      bindingId: futureBindingId(operation.asyncResultOperation, operation.bindingId),
      cExpression: operation.cExpression?.replace('inox::Promise', cppType)
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
