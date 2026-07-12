import type { AnyNode } from '../types.ts'
import type { CPreparedExpression as PreparedExpression } from './types.ts'

type CompilerLibraryExpressionNode = AnyNode & {
  libraryCExpression?: string | null
  libraryConstantValue?: string | null
  libraryCppType?: string | null
  libraryOwned?: boolean | null
}

export function emitPreparedCompilerLibraryExpression(expression: AnyNode): PreparedExpression | null {
  const item = expression as CompilerLibraryExpressionNode
  const cExpression = item.libraryCExpression
  const cppType = item.libraryCppType

  if (
    cExpression === null ||
    typeof cExpression === 'undefined' ||
    cppType === null ||
    typeof cppType === 'undefined'
  ) {
    return null
  }

  return {
    lines: [],
    expression: cExpression,
    cppType,
    owned: item.libraryOwned === true
  }
}

export function compilerLibraryStringConstantValue(expression: AnyNode | null | undefined): string | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  const item = expression as CompilerLibraryExpressionNode
  const value = item.libraryConstantValue

  if (value === null || typeof value === 'undefined') {
    return null
  }

  return value
}

export function isCompilerLibraryStringExpression(expression: AnyNode | null | undefined): boolean {
  if (expression === null || typeof expression === 'undefined') {
    return false
  }

  const item = expression as CompilerLibraryExpressionNode

  return item.libraryCppType === 'inox::String'
}
