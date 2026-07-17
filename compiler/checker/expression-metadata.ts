import {
  functionTypeMetadataFromTypeRef,
  resolveDeclaredType,
  resolveFieldDeclaredType as resolveFieldDeclaredTypeInContext
} from './declared-types.ts'
import type { DeclaredTypeResolverContext } from './declared-types.ts'
import { dynamicShapeField } from './expression-helpers.ts'
import { firstPathSegment, nodeNameEquals } from './resolved-types.ts'
import type { FunctionTypeMetadata, ResolvedTypeInfo } from './resolved-types.ts'
import {
  typeRefCompatibilityMetadata,
  typeRefDeclaredName,
  typeRefIterableElementDeclaredName,
  typeRefIterableElementValueType,
  typeRefTraitArgument
} from '../extensions/type-ref-compatibility.ts'
import type { IntrinsicRole, LibraryCResultMappingDescriptor, TypeRef } from '../extensions/types.ts'
import { arrayElementTypeNameFromTypeName } from '../type-names.ts'
import type { AnyNode, ObjectShapeInfo, SourceLocation, SymbolInfo, ValueType } from '../types.ts'

export type ExpressionMetadataResolverContext = {
  declaredTypes: DeclaredTypeResolverContext
  scopeBindings: Map<string, SymbolInfo>[]
}

export function applyTypeRefMetadataToExpression(
  context: DeclaredTypeResolverContext,
  expression: AnyNode,
  typeRef: TypeRef,
  cResultMapping: LibraryCResultMappingDescriptor | null = null
): void {
  const loc = expressionSourceLocation(expression)
  const metadata = typeRefCompatibilityMetadata(typeRef, context.libraries, loc, cResultMapping)

  expression.typeRef = typeRef
  expression.declaredType = typeRefDeclaredName(typeRef, context.libraries)
  expression.valueType = metadata.valueType
  expression.functionType = functionTypeMetadataFromTypeRef(context, typeRef, loc)
  expression.shape = metadata.shape
  expression.libraryCppType = metadata.libraryCppType
  expression.libraryCAwaitExpression = metadata.libraryCAwaitExpression
  expression.arrayElementTypeId = metadata.arrayElementTypeId
  expression.promiseValueType = metadata.promiseValueType
  expression.promiseRejectionValueType = metadata.promiseRejectionValueType
  expression.promiseRejectionIntrinsicRole = metadata.promiseRejectionIntrinsicRole
  expression.libraryIntrinsicRole = metadata.intrinsicRole ?? expression.libraryIntrinsicRole
  expression.libraryOwned = metadata.owned
  expression.libraryResultTypeId = metadata.libraryResultTypeId
  expression.nullable = metadata.nullable

  const fields = metadata.shape?.fields ?? []
  const cResultShapeFields: string[] = []

  for (let index = 0; index < fields.length; index = index + 1) {
    cResultShapeFields.push(fields[index].name)
  }

  expression.libraryCResultShapeFields = cResultShapeFields
}

function resolveSymbol(scopeBindings: Map<string, SymbolInfo>[], name: string): SymbolInfo | null {
  for (const bindings of scopeBindings) {
    const symbol = bindings.get(name)

    if (symbol !== null && typeof symbol !== 'undefined') {
      return symbol
    }
  }

  return null
}

export function resolveExpressionShape(
  context: ExpressionMetadataResolverContext,
  expression: AnyNode
): ObjectShapeInfo | null {
  if (expression.type === 'ThisExpression') {
    const thisSymbol = resolveSymbol(context.scopeBindings, 'this')

    if (
      thisSymbol !== null &&
      typeof thisSymbol !== 'undefined' &&
      thisSymbol.shape !== null &&
      typeof thisSymbol.shape !== 'undefined'
    ) {
      return thisSymbol.shape
    }

    if (expression.shape !== null && typeof expression.shape !== 'undefined') {
      return expression.shape
    }

    return null
  }

  if (expression.type !== 'Reference' || expression.path.length !== 1) {
    if (expression.shape !== null && typeof expression.shape !== 'undefined') {
      return expression.shape
    }

    return resolveDeclaredExpressionShape(context, expression)
  }

  const name = firstPathSegment(expression.path)
  const symbol = resolveSymbol(context.scopeBindings, name)

  if (
    symbol !== null &&
    typeof symbol !== 'undefined' &&
    symbol.shape !== null &&
    typeof symbol.shape !== 'undefined'
  ) {
    return symbol.shape
  }

  if (expression.shape !== null && typeof expression.shape !== 'undefined') {
    return expression.shape
  }

  return resolveDeclaredExpressionShape(context, expression)
}

function resolveDeclaredExpressionShape(
  context: ExpressionMetadataResolverContext,
  expression: AnyNode
): ObjectShapeInfo | null {
  const declaredType = expression.declaredType

  if (
    expression.valueType !== 'object' ||
    typeof declaredType !== 'string' ||
    !context.declaredTypes.types.has(declaredType)
  ) {
    return null
  }

  return resolveDeclaredType(context.declaredTypes, declaredType, expressionSourceLocation(expression)).shape
}

export function resolveArrayElementObjectShape(
  context: ExpressionMetadataResolverContext,
  valueType: ValueType,
  declaredType: string | null | undefined,
  loc: SourceLocation
): ObjectShapeInfo | null {
  if (valueType !== 'object' || declaredType === null || typeof declaredType === 'undefined') {
    return null
  }

  return resolveDeclaredType(context.declaredTypes, declaredType, loc).shape
}

export function findShapeField(shape: ObjectShapeInfo, name: string): AnyNode | null {
  const explicit = findExplicitShapeField(shape, name)

  if (explicit !== null) {
    return explicit
  }

  if (shape.dynamic === true) {
    return dynamicShapeField(shape, name)
  }

  return null
}

export function findExplicitShapeField(shape: ObjectShapeInfo, name: string): AnyNode | null {
  for (const field of shape.fields) {
    if (nodeNameEquals(field, name)) {
      return field
    }
  }

  return null
}

export function resolveExpressionShapeField(
  context: ExpressionMetadataResolverContext,
  expression: AnyNode,
  shape: ObjectShapeInfo,
  name: string
): AnyNode | null {
  const explicit = findExplicitShapeField(shape, name)

  if (explicit !== null) {
    return explicit
  }

  const declaredType = expression.declaredType

  if (typeof declaredType === 'string' && context.declaredTypes.types.has(declaredType)) {
    const declaredShape = resolveDeclaredType(
      context.declaredTypes,
      declaredType,
      expressionSourceLocation(expression)
    ).shape

    if (declaredShape !== null) {
      const declaredField = findExplicitShapeField(declaredShape, name)

      if (declaredField !== null) {
        return declaredField
      }
    }
  }

  return findShapeField(shape, name)
}

export function resolveExpressionArrayElementType(
  context: ExpressionMetadataResolverContext,
  expression: AnyNode | null | undefined
): ValueType | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  return typeRefIterableElementValueType(
    resolveExpressionTypeRef(context, expression),
    context.declaredTypes.libraries
  )
}

export function resolveExpressionIterableElementDeclaredName(
  context: ExpressionMetadataResolverContext,
  expression: AnyNode | null | undefined
): string | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  if (typeof expression.declaredType === 'string') {
    const declaredElement = arrayElementTypeNameFromTypeName(expression.declaredType)

    if (declaredElement !== null) {
      return declaredElement
    }
  }

  return typeRefIterableElementDeclaredName(
    resolveExpressionTypeRef(context, expression),
    context.declaredTypes.libraries
  )
}

export function resolveExpressionIterableElementFunctionType(
  context: ExpressionMetadataResolverContext,
  expression: AnyNode | null | undefined
): FunctionTypeMetadata | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  const typeRef = resolveExpressionTypeRef(context, expression)
  const elementTypeRef = typeRefTraitArgument(typeRef, 'iterable', 0, context.declaredTypes.libraries)

  if (elementTypeRef === null) {
    return null
  }

  return functionTypeMetadataFromTypeRef(
    context.declaredTypes,
    elementTypeRef,
    expressionSourceLocation(expression)
  )
}

function resolveExpressionTypeRef(
  context: ExpressionMetadataResolverContext,
  expression: AnyNode
): TypeRef | null {
  if (expression.typeRef !== null && typeof expression.typeRef !== 'undefined') {
    return expression.typeRef
  }

  if (expression.type === 'Reference' && expression.path.length === 1) {
    return resolveSymbol(context.scopeBindings, firstPathSegment(expression.path))?.typeRef ?? null
  }

  if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
    const shape = resolveExpressionShape(context, expression.object)
    let field: AnyNode | null = null

    if (shape !== null && typeof shape !== 'undefined') {
      field = findShapeField(shape, expression.property)
    }

    if (field !== null && typeof field !== 'undefined') {
      const fieldType = resolveFieldDeclaredTypeInContext(context.declaredTypes, field)
      return field.typeRef ?? fieldType.typeRef
    }

    return null
  }

  if (
    (expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression') &&
    expression.index.type === 'StringLiteral'
  ) {
    const shape = resolveExpressionShape(context, expression.object)
    let field: AnyNode | null = null

    if (shape !== null && typeof shape !== 'undefined') {
      field = findShapeField(shape, expression.index.value)
    }

    if (field !== null && typeof field !== 'undefined') {
      const fieldType = resolveFieldDeclaredTypeInContext(context.declaredTypes, field)
      return field.typeRef ?? fieldType.typeRef
    }
  }

  return null
}

export function resolveArrayIterableElementShape(
  context: ExpressionMetadataResolverContext,
  expression: AnyNode
): ObjectShapeInfo | null {
  const typeRef = resolveExpressionTypeRef(context, expression)
  const elementTypeRef = typeRefTraitArgument(typeRef, 'iterable', 0, context.declaredTypes.libraries)
  const elementDeclaredType = resolveExpressionIterableElementDeclaredName(context, expression)

  if (elementTypeRef !== null && elementTypeRef.kind !== 'parameter') {
    const elementMetadata = typeRefCompatibilityMetadata(
      elementTypeRef,
      context.declaredTypes.libraries,
      expressionSourceLocation(expression)
    )

    if (
      elementMetadata.shape !== null &&
      !(
        elementDeclaredType !== null &&
        elementMetadata.shape.dynamic === true &&
        elementMetadata.shape.fields.length === 0
      )
    ) {
      return elementMetadata.shape
    }
  }

  const elementType = resolveExpressionArrayElementType(context, expression)

  if (elementType === 'object' && elementDeclaredType !== null && typeof elementDeclaredType !== 'undefined') {
    const elementShape = resolveArrayElementObjectShape(
      context,
      elementType,
      elementDeclaredType,
      expressionSourceLocation(expression)
    )

    if (elementShape !== null && typeof elementShape !== 'undefined') {
      return elementShape
    }
  }

  if (expression.shape !== null && typeof expression.shape !== 'undefined') {
    return expression.shape
  }

  if (expression.type === 'MemberExpression') {
    const shape = resolveExpressionShape(context, expression.object)

    if (shape === null || typeof shape === 'undefined') {
      return null
    }

    const field = findShapeField(shape, expression.property)

    if (
      field !== null &&
      typeof field !== 'undefined' &&
      field.shape !== null &&
      typeof field.shape !== 'undefined'
    ) {
      return field.shape
    }

    return null
  }

  if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
    const shape = resolveExpressionShape(context, expression.object)

    if (shape === null || typeof shape === 'undefined') {
      return null
    }

    const field = findShapeField(shape, expression.index.value)

    if (
      field !== null &&
      typeof field !== 'undefined' &&
      field.shape !== null &&
      typeof field.shape !== 'undefined'
    ) {
      return field.shape
    }
  }

  return null
}

function expressionSourceLocation(expression: AnyNode): SourceLocation {
  let loc: SourceLocation = { line: 1, column: 1 }
  const expressionLoc = expression.loc

  if (expressionLoc !== null && typeof expressionLoc !== 'undefined') {
    loc = expressionLoc
  }

  return loc
}

export function resolveExpressionPromiseValueType(
  context: ExpressionMetadataResolverContext,
  expression: AnyNode | null | undefined
): ValueType | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  if (expression.type === 'CallExpression' || expression.type === 'NewExpression') {
    if (
      expression.valueType === 'promise' &&
      expression.promiseValueType !== null &&
      typeof expression.promiseValueType !== 'undefined'
    ) {
      return expression.promiseValueType
    }

    return null
  }

  if (expression.type === 'Reference' && expression.path.length === 1) {
    const name = firstPathSegment(expression.path)
    const symbol = resolveSymbol(context.scopeBindings, name)

    if (
      symbol !== null &&
      typeof symbol !== 'undefined' &&
      symbol.valueType === 'promise' &&
      symbol.promiseValueType !== null &&
      typeof symbol.promiseValueType !== 'undefined'
    ) {
      return symbol.promiseValueType
    }

    return null
  }

  if (expression.type === 'MemberExpression') {
    const shape = resolveExpressionShape(context, expression.object)
    let field: AnyNode | null = null

    if (shape !== null && typeof shape !== 'undefined') {
      field = findShapeField(shape, expression.property)
    }

    if (
      field !== null &&
      typeof field !== 'undefined' &&
      field.valueType === 'promise' &&
      field.promiseValueType !== null &&
      typeof field.promiseValueType !== 'undefined'
    ) {
      return field.promiseValueType
    }

    return null
  }

  if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
    const shape = resolveExpressionShape(context, expression.object)
    let field: AnyNode | null = null

    if (shape !== null && typeof shape !== 'undefined') {
      field = findShapeField(shape, expression.index.value)
    }

    if (
      field !== null &&
      typeof field !== 'undefined' &&
      field.valueType === 'promise' &&
      field.promiseValueType !== null &&
      typeof field.promiseValueType !== 'undefined'
    ) {
      return field.promiseValueType
    }

    return null
  }

  return null
}

export function resolveRejectedExpressionValueType(
  _context: ExpressionMetadataResolverContext,
  expression: AnyNode | null | undefined
): ValueType {
  if (expression === null || typeof expression === 'undefined') {
    return 'unknown'
  }

  if (expression.libraryIntrinsicRole === 'exception-value') {
    return 'error'
  }

  if (expression.valueType === 'string') {
    return 'string'
  }

  return 'unknown'
}

export function resolveRejectedExpressionIntrinsicRole(
  expression: AnyNode | null | undefined
): IntrinsicRole | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  return expression.libraryIntrinsicRole ?? null
}
