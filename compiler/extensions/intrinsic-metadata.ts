import { compilerLibraryOperationForIntrinsic } from './library-set.ts'
import { typeRefCompatibilityMetadata } from './type-ref-compatibility.ts'
import type { TypeRefCompatibilityMetadata } from './type-ref-compatibility.ts'
import type { CompilerLibrarySet, IntrinsicRole, LibraryOperationKind } from './types.ts'
import type { SourceLocation } from '../types.ts'

/** Resolves result metadata supplied by the package selected for a semantic compiler role. */
export function compilerLibraryIntrinsicResultMetadata(
  libraries: CompilerLibrarySet,
  role: IntrinsicRole,
  kind: LibraryOperationKind,
  loc: SourceLocation
): TypeRefCompatibilityMetadata | null {
  const operation = compilerLibraryOperationForIntrinsic(libraries, role, kind)

  if (operation === null) {
    return null
  }

  const resultTypeRef = operation.resultTypeRef

  if (resultTypeRef === null || typeof resultTypeRef === 'undefined') {
    return null
  }

  return typeRefCompatibilityMetadata(resultTypeRef, libraries, loc, operation.cResultMapping ?? null)
}
