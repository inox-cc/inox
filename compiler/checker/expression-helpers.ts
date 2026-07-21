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
    const nestedShape = field.shape ?? dynamicUnknownObjectShape(field.loc)

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
      typeRef: field.typeRef,
      valueType: field.valueType,
      nullable: field.nullable,
      asyncResultValueType: field.asyncResultValueType,
      functionType: field.functionType,
      shape: nestedShape,
      className: field.className
    }
  }

  const nestedShape = dynamicUnknownObjectShape(null)

  return {
    name,
    optional: true,
    readonly: false,
    ownership: 'strong',
    valueType: 'unknown',
    shape: nestedShape
  }
}

function dynamicUnknownObjectShape(loc: SourceLocation | null | undefined): ObjectShapeInfo {
  const dynamicField: AnyNode = {
    name: '',
    optional: true,
    readonly: false,
    ownership: 'strong',
    valueType: 'unknown',
    nullable: true,
    loc: loc ?? { line: 1, column: 1 }
  }
  const shape: ObjectShapeInfo = {
    kind: 'object',
    dynamic: true,
    dynamicField,
    fields: []
  }

  dynamicField.shape = shape
  return shape
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
    returnAsyncResultValueType: expression.returnAsyncResultValueType ?? null,
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

export function resolveExpressionAsyncResultRejectionValueType(expression: AnyNode | null | undefined): ValueType | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  if (expression.type === 'CallExpression' || expression.type === 'NewExpression') {
    if (
      expression.valueType === 'async-result' &&
      expression.asyncResultRejectionValueType !== null &&
      typeof expression.asyncResultRejectionValueType !== 'undefined'
    ) {
      return expression.asyncResultRejectionValueType
    }

    return null
  }

  if (expression.type === 'MemberExpression') {
    const objectRejectionValueType = resolveExpressionAsyncResultRejectionValueType(expression.object)

    if (objectRejectionValueType !== null && typeof objectRejectionValueType !== 'undefined') {
      return objectRejectionValueType
    }
  }

  return null
}

export function resolveExpressionAsyncResultRejectionIntrinsicRole(
  expression: AnyNode | null | undefined
): IntrinsicRole | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  if (expression.valueType === 'async-result') {
    const role = expression.asyncResultRejectionIntrinsicRole

    if (role !== null && typeof role !== 'undefined') {
      return role
    }
  }

  if (expression.type === 'MemberExpression') {
    return resolveExpressionAsyncResultRejectionIntrinsicRole(expression.object)
  }

  return null
}
