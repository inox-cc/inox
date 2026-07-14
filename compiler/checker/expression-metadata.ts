import { errorObjectShape } from './builtins.ts'
import { resolveDeclaredType, resolveFieldDeclaredType as resolveFieldDeclaredTypeInContext } from './declared-types.ts'
import type { DeclaredTypeResolverContext } from './declared-types.ts'
import { dynamicShapeField } from './expression-helpers.ts'
import {
  firstPathSegment,
  nodeNameEquals,
  resolvedFunctionTypeMetadata
} from './resolved-types.ts'
import type { CheckerMapType, FunctionTypeMetadata, ResolvedTypeInfo } from './resolved-types.ts'
import type { AnyNode, ObjectShapeInfo, SourceLocation, SymbolInfo, ValueType } from '../types.ts'

export type ExpressionMetadataResolverContext = {
  declaredTypes: DeclaredTypeResolverContext
  scopeBindings: Map<string, SymbolInfo>[]
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

    return null
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

  if (symbol !== null && typeof symbol !== 'undefined' && symbol.valueType === 'object') {
    const elementShape = resolveArrayElementObjectShape(
      context,
      symbol.valueType,
      symbol.arrayElementDeclaredType,
      expression.loc
    )

    if (elementShape !== null && typeof elementShape !== 'undefined') {
      return elementShape
    }
  }

  if (expression.shape !== null && typeof expression.shape !== 'undefined') {
    return expression.shape
  }

  return null
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
  for (const field of shape.fields) {
    if (nodeNameEquals(field, name)) {
      return field
    }
  }

  if (shape.dynamic === true) {
    return dynamicShapeField(shape, name)
  }

  return null
}

function mapTypeFromMetadata(source: AnyNode | SymbolInfo): CheckerMapType {
  let key: ValueType | null = null
  let value: ValueType | null = null
  let valueShape: ObjectShapeInfo | null = null
  let valueArrayElementType: ValueType | null = null
  let valueArrayElementDeclaredType: string | null = null

  if (source.mapKeyType !== null && typeof source.mapKeyType !== 'undefined') {
    key = source.mapKeyType
  }

  if (source.mapValueType !== null && typeof source.mapValueType !== 'undefined') {
    value = source.mapValueType
  }

  if (source.mapValueShape !== null && typeof source.mapValueShape !== 'undefined') {
    valueShape = source.mapValueShape
  }

  if (source.mapValueArrayElementType !== null && typeof source.mapValueArrayElementType !== 'undefined') {
    valueArrayElementType = source.mapValueArrayElementType
  }

  if (
    source.mapValueArrayElementDeclaredType !== null &&
    typeof source.mapValueArrayElementDeclaredType !== 'undefined'
  ) {
    valueArrayElementDeclaredType = source.mapValueArrayElementDeclaredType
  }

  return {
    key,
    value,
    valueShape,
    valueArrayElementType,
    valueArrayElementDeclaredType
  }
}

export function resolveExpressionArrayElementType(
  context: ExpressionMetadataResolverContext,
  expression: AnyNode | null | undefined
): ValueType | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  if (expression.arrayElementType !== null && typeof expression.arrayElementType !== 'undefined') {
    return expression.arrayElementType
  }

  if (expression.type === 'ArrayLiteral') {
    return null
  }

  if (expression.type === 'CallExpression') {
    return null
  }

  if (expression.type === 'AwaitExpression') {
    return null
  }

  if (expression.type === 'Reference' && expression.path.length === 1) {
    const name = firstPathSegment(expression.path)
    const symbol = resolveSymbol(context.scopeBindings, name)

    if (
      symbol !== null &&
      typeof symbol !== 'undefined' &&
      symbol.arrayElementType !== null &&
      typeof symbol.arrayElementType !== 'undefined'
    ) {
      return symbol.arrayElementType
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
      field.arrayElementType !== null &&
      typeof field.arrayElementType !== 'undefined'
    ) {
      return field.arrayElementType
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
      field.arrayElementType !== null &&
      typeof field.arrayElementType !== 'undefined'
    ) {
      return field.arrayElementType
    }

    return null
  }

  return null
}

export function resolveExpressionArrayElementDeclaredType(
  context: ExpressionMetadataResolverContext,
  expression: AnyNode | null | undefined
): string | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  if (expression.arrayElementDeclaredType !== null && typeof expression.arrayElementDeclaredType !== 'undefined') {
    return expression.arrayElementDeclaredType
  }

  if (expression.type === 'ArrayLiteral' || expression.type === 'CallExpression') {
    if (expression.arrayElementType !== null && typeof expression.arrayElementType !== 'undefined') {
      return expression.arrayElementType
    }

    return null
  }

  if (expression.type === 'AwaitExpression') {
    if (expression.arrayElementType !== null && typeof expression.arrayElementType !== 'undefined') {
      return expression.arrayElementType
    }

    return null
  }

  if (expression.type === 'Reference' && expression.path.length === 1) {
    const name = firstPathSegment(expression.path)
    const symbol = resolveSymbol(context.scopeBindings, name)

    if (
      symbol !== null &&
      typeof symbol !== 'undefined' &&
      symbol.arrayElementDeclaredType !== null &&
      typeof symbol.arrayElementDeclaredType !== 'undefined'
    ) {
      return symbol.arrayElementDeclaredType
    }

    if (
      symbol !== null &&
      typeof symbol !== 'undefined' &&
      symbol.arrayElementType !== null &&
      typeof symbol.arrayElementType !== 'undefined'
    ) {
      return symbol.arrayElementType
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
      field.arrayElementDeclaredType !== null &&
      typeof field.arrayElementDeclaredType !== 'undefined'
    ) {
      return field.arrayElementDeclaredType
    }

    if (
      field !== null &&
      typeof field !== 'undefined' &&
      field.arrayElementType !== null &&
      typeof field.arrayElementType !== 'undefined'
    ) {
      return field.arrayElementType
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
      field.arrayElementDeclaredType !== null &&
      typeof field.arrayElementDeclaredType !== 'undefined'
    ) {
      return field.arrayElementDeclaredType
    }

    if (
      field !== null &&
      typeof field !== 'undefined' &&
      field.arrayElementType !== null &&
      typeof field.arrayElementType !== 'undefined'
    ) {
      return field.arrayElementType
    }

    return null
  }

  return null
}

export function resolveExpressionArrayElementFunctionType(
  context: ExpressionMetadataResolverContext,
  expression: AnyNode | null | undefined
): FunctionTypeMetadata | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  if (
    expression.type === 'ArrayLiteral' ||
    expression.type === 'CallExpression' ||
    expression.type === 'AwaitExpression'
  ) {
    if (
      expression.arrayElementFunctionType !== null &&
      typeof expression.arrayElementFunctionType !== 'undefined'
    ) {
      return expression.arrayElementFunctionType
    }

    return null
  }

  if (expression.type === 'Reference' && expression.path.length === 1) {
    const name = firstPathSegment(expression.path)
    const symbol = resolveSymbol(context.scopeBindings, name)

    if (
      symbol !== null &&
      typeof symbol !== 'undefined' &&
      symbol.arrayElementFunctionType !== null &&
      typeof symbol.arrayElementFunctionType !== 'undefined'
    ) {
      return symbol.arrayElementFunctionType
    }

    return null
  }

  if (expression.type === 'MemberExpression') {
    const shape = resolveExpressionShape(context, expression.object)
    let field: AnyNode | null = null

    if (shape !== null && typeof shape !== 'undefined') {
      field = findShapeField(shape, expression.property)
    }

    if (field !== null && typeof field !== 'undefined') {
      const fieldType = resolveFieldDeclaredTypeInContext(context.declaredTypes, field)

      return resolvedFunctionTypeMetadata(field.arrayElementFunctionType, fieldType.arrayElementFunctionType)
    }

    return null
  }

  if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
    const shape = resolveExpressionShape(context, expression.object)
    let field: AnyNode | null = null

    if (shape !== null && typeof shape !== 'undefined') {
      field = findShapeField(shape, expression.index.value)
    }

    if (field !== null && typeof field !== 'undefined') {
      const fieldType = resolveFieldDeclaredTypeInContext(context.declaredTypes, field)

      return resolvedFunctionTypeMetadata(field.arrayElementFunctionType, fieldType.arrayElementFunctionType)
    }

    return null
  }

  return null
}

export function resolveArrayIterableElementShape(
  context: ExpressionMetadataResolverContext,
  expression: AnyNode
): ObjectShapeInfo | null {
  const elementType = resolveExpressionArrayElementType(context, expression)
  const elementDeclaredType = resolveExpressionArrayElementDeclaredType(context, expression)

  if (elementType === 'object' && elementDeclaredType !== null && typeof elementDeclaredType !== 'undefined') {
    const elementShape = resolveArrayElementObjectShape(context, elementType, elementDeclaredType, expression.loc)

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

export function resolveExpressionMapType(
  context: ExpressionMetadataResolverContext,
  expression: AnyNode | null | undefined
): CheckerMapType | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  if (expression.type === 'CallExpression' || expression.type === 'NewExpression') {
    if (expression.valueType === 'map') {
      return mapTypeFromMetadata(expression)
    }

    return null
  }

  if (expression.type === 'Reference' && expression.path.length === 1) {
    const name = firstPathSegment(expression.path)
    const symbol = resolveSymbol(context.scopeBindings, name)

    if (symbol !== null && typeof symbol !== 'undefined' && symbol.valueType === 'map') {
      return mapTypeFromMetadata(symbol)
    }

    return null
  }

  if (expression.type === 'MemberExpression') {
    const shape = resolveExpressionShape(context, expression.object)
    let field: AnyNode | null = null

    if (shape !== null && typeof shape !== 'undefined') {
      field = findShapeField(shape, expression.property)
    }

    if (field !== null && typeof field !== 'undefined' && field.valueType === 'map') {
      return mapTypeFromMetadata(field)
    }

    return null
  }

  if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
    const shape = resolveExpressionShape(context, expression.object)
    let field: AnyNode | null = null

    if (shape !== null && typeof shape !== 'undefined') {
      field = findShapeField(shape, expression.index.value)
    }

    if (field !== null && typeof field !== 'undefined' && field.valueType === 'map') {
      return mapTypeFromMetadata(field)
    }

    return null
  }

  return null
}

export function resolveExpressionSetElementType(
  context: ExpressionMetadataResolverContext,
  expression: AnyNode | null | undefined
): ValueType | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  if (expression.type === 'CallExpression' || expression.type === 'NewExpression') {
    if (
      expression.valueType === 'set' &&
      expression.setElementType !== null &&
      typeof expression.setElementType !== 'undefined'
    ) {
      return expression.setElementType
    }

    return null
  }

  if (expression.type === 'Reference' && expression.path.length === 1) {
    const name = firstPathSegment(expression.path)
    const symbol = resolveSymbol(context.scopeBindings, name)

    if (
      symbol !== null &&
      typeof symbol !== 'undefined' &&
      symbol.valueType === 'set' &&
      symbol.setElementType !== null &&
      typeof symbol.setElementType !== 'undefined'
    ) {
      return symbol.setElementType
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
      field.valueType === 'set' &&
      field.setElementType !== null &&
      typeof field.setElementType !== 'undefined'
    ) {
      return field.setElementType
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
      field.valueType === 'set' &&
      field.setElementType !== null &&
      typeof field.setElementType !== 'undefined'
    ) {
      return field.setElementType
    }

    return null
  }

  return null
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
  context: ExpressionMetadataResolverContext,
  expression: AnyNode | null | undefined
): ValueType {
  if (expression === null || typeof expression === 'undefined') {
    return 'unknown'
  }

  if (isErrorObjectExpression(context, expression)) {
    return 'error'
  }

  if (expression.valueType === 'string') {
    return 'string'
  }

  return 'unknown'
}

export function isErrorObjectExpression(context: ExpressionMetadataResolverContext, expression: AnyNode): boolean {
  if (
    expression.type === 'NewExpression' &&
    expression.callee !== null &&
    typeof expression.callee !== 'undefined' &&
    expression.callee.type === 'Reference' &&
    expression.callee.path.length === 1 &&
    firstPathSegment(expression.callee.path) === 'Error'
  ) {
    return true
  }

  const shape = resolveExpressionShape(context, expression)

  return shape === errorObjectShape
}
