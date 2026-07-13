import { commonValueType } from './assignability.ts'
import { fsStatsObjectShape } from './builtins.ts'
import { checkerNodeAt, nodeValueTypeOrUnknown } from './resolved-types.ts'
import type { CheckerMapType, FunctionTypeMetadata, FunctionTypeParamMetadata } from './resolved-types.ts'
import type { FsBooleanOptions, FsRuntimeCallPlan } from '../stdlib/node/checker.ts'
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

export function applyFsRuntimeCallPlan(
  expression: AnyNode,
  plan: FsRuntimeCallPlan,
  options: FsBooleanOptions
): void {
  expression.fsRuntimeMethod = plan.runtimeMethod
  expression.valueType = plan.valueType
  expression.promiseValueType = plan.promiseValueType
  expression.shape = null
  expression.arrayElementType = plan.arrayElementType
  expression.arrayElementDeclaredType = plan.arrayElementDeclaredType

  if (plan.shape === 'stats') {
    expression.shape = fsStatsObjectShape
  } else if (plan.resultTypeId !== null && typeof plan.resultTypeId !== 'undefined') {
    expression.shape = {
      kind: 'object',
      fields: [],
      libraryTypeId: plan.resultTypeId
    }
  }

  if (plan.bytes !== null && typeof plan.bytes !== 'undefined') {
    expression.fsBytes = plan.bytes
  }

  if (plan.bytesFromWriteData) {
    expression.fsBytes = options.bytes === true
  }

  if (plan.direntsFromOptions && options.withFileTypes === true) {
    expression.fsDirents = true
    expression.arrayElementType = 'object'
    expression.arrayElementDeclaredType = 'fs.Dirent'
  }

  if (plan.recursiveFromOptions) {
    expression.fsRecursive = options.recursive === true
  }

  if (plan.forceFromOptions) {
    expression.fsForce = options.force === true
  }
}

export function resolveMapEntryArrayType(expression: AnyNode): CheckerMapType | null {
  if (expression.elements.length === 0) {
    return null
  }

  let key: ValueType | null = null
  let value: ValueType | null = null

  for (const entry of expression.elements) {
    if (entry.type !== 'ArrayLiteral' || entry.elements.length < 2) {
      return null
    }

    const entryKeyType = nodeValueTypeOrUnknown(checkerNodeAt(entry.elements, 0))
    const entryValueType = nodeValueTypeOrUnknown(checkerNodeAt(entry.elements, 1))

    if (entryKeyType === 'unknown' || entryValueType === 'unknown') {
      return null
    }

    if (key === null) {
      key = entryKeyType
    } else if (key !== entryKeyType) {
      return null
    }

    if (value === null) {
      value = entryValueType
    } else if (value !== entryValueType) {
      return null
    }
  }

  return {
    key,
    value
  }
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
      mapKeyType: field.mapKeyType,
      mapValueType: field.mapValueType,
      promiseValueType: field.promiseValueType,
      setElementType: field.setElementType,
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

export function createMapEntryShape(mapType: CheckerMapType | null, loc: SourceLocation): ObjectShapeInfo {
  let keyType: ValueType = 'unknown'
  let valueType: ValueType = 'unknown'

  if (mapType !== null && typeof mapType !== 'undefined') {
    const key = mapType.key
    const value = mapType.value

    if (key !== null && typeof key !== 'undefined') {
      keyType = key
    }

    if (value !== null && typeof value !== 'undefined') {
      valueType = value
    }
  }

  return {
    kind: 'object',
    fields: [
      {
        name: 'key',
        readonly: true,
        declaredType: keyType,
        valueType: keyType,
        loc
      },
      {
        name: 'value',
        readonly: true,
        declaredType: valueType,
        valueType,
        loc
      }
    ]
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
    declaredReturnType: expression.declaredReturnType,
    returnNullable: expression.returnNullable === true,
    returnArrayElementType: expression.returnArrayElementType ?? null,
    returnArrayElementDeclaredType: expression.returnArrayElementDeclaredType ?? null,
    returnMapKeyType: expression.returnMapKeyType ?? null,
    returnMapValueType: expression.returnMapValueType ?? null,
    returnPromiseValueType: expression.returnPromiseValueType ?? null,
    returnSetElementType: expression.returnSetElementType ?? null,
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
