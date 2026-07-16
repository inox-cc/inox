import { commonValueType } from './assignability.ts'
import type { FunctionTypeMetadata, FunctionTypeParamMetadata } from './resolved-types.ts'
import type { IntrinsicRole } from '../extensions/types.ts'
import type { AnyNode, ObjectShapeInfo, SourceLocation, ValueType } from '../types.ts'

export function callExpressionArgumentLabel(expression: AnyNode): string {
  const callee = expression.callee

  if (
    callee !== null &&
    typeof callee !== 'undefined' &&
    callee.type === 'Reference' &&
    callee.path !== null &&
    typeof callee.path !== 'undefined' &&
    callee.path.length > 0
  ) {
    return `function ${callee.path[0]}`
  }

  if (
    callee !== null &&
    typeof callee !== 'undefined' &&
    callee.type === 'MemberExpression' &&
    callee.property !== null &&
    typeof callee.property !== 'undefined'
  ) {
    return `function ${callee.property}`
  }

  return 'function'
}

export function dynamicShapeField(shape: ObjectShapeInfo, name: string): AnyNode {
  if (shape.dynamicField !== null && typeof shape.dynamicField !== 'undefined') {
    const field = shape.dynamicField

    return {
      name,
      optional: field.optional,
      readonly: field.readonly,
      ownership: field.ownership,
      weakLoc: field.weakLoc,
      static: field.static,
      staticLoc: field.staticLoc,
      weakTypeValidated: field.weakTypeValidated,
      loc: field.loc,
      declaredType: field.declaredType,
      valueType: field.valueType,
      nullable: field.nullable,
      arrayElementType: field.arrayElementType,
      arrayElementDeclaredType: field.arrayElementDeclaredType,
      promiseValueType: field.promiseValueType,
      functionType: field.functionType,
      shape: field.shape,
      className: field.className
    }
  }

  return {
    name,
    optional: true,
    readonly: false,
    ownership: 'strong',
    valueType: 'unknown'
  }
}

export function createArrowFunctionTypeMetadata(
  expression: AnyNode,
  params: FunctionTypeParamMetadata[]
): FunctionTypeMetadata {
  let returnShape: ObjectShapeInfo | null = null

  if (
    expression.body !== null &&
    typeof expression.body !== 'undefined' &&
    expression.body.shape !== null &&
    typeof expression.body.shape !== 'undefined'
  ) {
    returnShape = expression.body.shape
  }

  return {
    kind: 'function',
    resolved: true,
    params,
    returnType: expression.returnType,
    returnTypeRef: expression.returnTypeRef ?? null,
    declaredReturnType: expression.declaredReturnType,
    returnNullable: expression.returnNullable === true,
    returnArrayElementType: expression.returnArrayElementType ?? null,
    returnArrayElementDeclaredType: expression.returnArrayElementDeclaredType ?? null,
    returnPromiseValueType: expression.returnPromiseValueType ?? null,
    returnShape
  }
}

export function knownCheckedExpressionType(expression: AnyNode): ValueType | null {
  if (
    expression.valueType !== null &&
    typeof expression.valueType !== 'undefined' &&
    expression.valueType !== 'unknown'
  ) {
    return expression.valueType
  }

  if (expression.type === 'StringLiteral' || expression.type === 'TemplateLiteral') {
    return 'string'
  }

  if (expression.type === 'NumberLiteral') {
    return 'number'
  }

  if (expression.type === 'BooleanLiteral') {
    return 'boolean'
  }

  if (expression.type === 'NullLiteral') {
    return 'null'
  }

  return null
}

export function objectValuesElementTypeFromShape(shape: ObjectShapeInfo | null | undefined): ValueType {
  if (shape === null || typeof shape === 'undefined' || shape.fields.length === 0) {
    return 'unknown'
  }

  const types: ValueType[] = []

  for (const field of shape.fields) {
    let valueType: ValueType = 'unknown'

    if (field.valueType !== null && typeof field.valueType !== 'undefined') {
      valueType = field.valueType
    }

    types.push(valueType)
  }

  return commonValueType(types)
}

export function resolveExpressionPromiseRejectionValueType(expression: AnyNode | null | undefined): ValueType | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  if (expression.type === 'CallExpression' || expression.type === 'NewExpression') {
    if (
      expression.valueType === 'promise' &&
      expression.promiseRejectionValueType !== null &&
      typeof expression.promiseRejectionValueType !== 'undefined'
    ) {
      return expression.promiseRejectionValueType
    }

    return null
  }

  if (expression.type === 'MemberExpression') {
    const objectRejectionValueType = resolveExpressionPromiseRejectionValueType(expression.object)

    if (objectRejectionValueType !== null && typeof objectRejectionValueType !== 'undefined') {
      return objectRejectionValueType
    }
  }

  return null
}

export function resolveExpressionPromiseRejectionIntrinsicRole(
  expression: AnyNode | null | undefined
): IntrinsicRole | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  if (expression.valueType === 'promise') {
    const role = expression.promiseRejectionIntrinsicRole

    if (role !== null && typeof role !== 'undefined') {
      return role
    }
  }

  if (expression.type === 'MemberExpression') {
    return resolveExpressionPromiseRejectionIntrinsicRole(expression.object)
  }

  return null
}
