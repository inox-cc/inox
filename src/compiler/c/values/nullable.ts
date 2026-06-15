import {
  emitPrepareOwnedValueWrite,
  registerOwnedValue,
  withNullableScalarNarrowing
} from '../context.ts'
import { emitRuntimeNullableValueCheck } from '../runtime-values.ts'
import { isNullishCoalescingExpression } from '../syntax.ts'
import { cRuntimeValueTag, isNullableScalarType, isRuntimeNullableType } from '../value-types.ts'
import { registerObjectShape } from './objects.ts'

type PreparedExpression = {
  lines: string[]
  expression: string
}

export type NullableLoweringDependencies = {
  emitCObjectLiteralValueExpression: (expression: any, context: any, shape?: any | null) => PreparedExpression
  emitCValueExpression: (expression: any, context: any) => PreparedExpression
  emitNullableFunctionValueExpression: (expression: any, functionType: any, context: any) => PreparedExpression
  emitNullableScalarValueExpression: (expression: any, context: any) => PreparedExpression
  inferExpressionType: (expression: any, context: any) => string
  isNumberConversionCall: (expression: any, context: any) => boolean
  resolveRuntimeCallbackCalleeType: (callee: any, context: any) => any | null
}

function nullableDeps(context: any): NullableLoweringDependencies {
  return context.nullableLoweringDependencies
}

export function isNullableScalarRuntimeExpression(expression, context) {
  return (
    isNullableScalarType(nullableDeps(context).inferExpressionType(expression, context)) && isNullableRuntimeExpression(expression, context)
  )
}

export function resolveNullableScalarConditionNarrowing(expression, context) {
  if (expression?.type !== 'BinaryExpression') {
    return emptyNullableScalarNarrowing()
  }

  if (expression.operator === '&&') {
    const left = resolveNullableScalarConditionNarrowing(expression.left, context)
    const right = withNullableScalarNarrowing(context, left.trueNames, () =>
      resolveNullableScalarConditionNarrowing(expression.right, context)
    )

    return {
      trueNames: uniqueNames([...left.trueNames, ...right.trueNames]),
      falseNames: intersectNames(left.falseNames, uniqueNames([...left.trueNames, ...right.falseNames]))
    }
  }

  if (expression.operator === '||') {
    const left = resolveNullableScalarConditionNarrowing(expression.left, context)
    const right = withNullableScalarNarrowing(context, left.falseNames, () =>
      resolveNullableScalarConditionNarrowing(expression.right, context)
    )

    return {
      trueNames: intersectNames(left.trueNames, uniqueNames([...left.falseNames, ...right.trueNames])),
      falseNames: uniqueNames([...left.falseNames, ...right.falseNames])
    }
  }

  return resolveNullableScalarNullCheckNarrowing(expression, context)
}

function resolveNullableScalarNullCheckNarrowing(expression, context) {
  if (expression?.type !== 'BinaryExpression' || !['===', '!==', '==', '!='].includes(expression.operator)) {
    return emptyNullableScalarNarrowing()
  }

  const nullable = expression.left?.type === 'NullLiteral' ? expression.right : expression.left
  const maybeNull = expression.left?.type === 'NullLiteral' ? expression.left : expression.right

  if (maybeNull?.type !== 'NullLiteral' || nullable?.type !== 'Reference' || nullable.path.length !== 1) {
    return emptyNullableScalarNarrowing()
  }

  const name = nullable.path[0]

  if (!context.nullableVariables.has(name) || !isRuntimeNullableType(context.variables.get(name))) {
    return emptyNullableScalarNarrowing()
  }

  if (['!==', '!='].includes(expression.operator)) {
    return {
      trueNames: [name],
      falseNames: []
    }
  }

  return {
    trueNames: [],
    falseNames: [name]
  }
}

function emptyNullableScalarNarrowing() {
  return {
    trueNames: [],
    falseNames: []
  }
}

function uniqueNames(names) {
  return [...new Set(names)]
}

function intersectNames(left, right) {
  const rightNames = new Set(right)

  return uniqueNames(left.filter((name) => rightNames.has(name)))
}

export function isNarrowedNullableScalarReference(expression, context) {
  return (
    expression?.type === 'Reference' &&
    expression.path.length === 1 &&
    context.narrowedNullableScalars.has(expression.path[0]) &&
    context.nullableVariables.has(expression.path[0]) &&
    isNullableScalarType(context.variables.get(expression.path[0]))
  )
}

export function clearNullableScalarNarrowing(name, context) {
  context.narrowedNullableScalars.delete(name)

  return []
}

export function canLowerCNullishCoalescingExpression(expression, context) {
  if (!isNullishCoalescingExpression(expression)) {
    return false
  }

  const resultType = nullableDeps(context).inferExpressionType(expression, context)

  return (
    isRuntimeNullableType(resultType) &&
    (nullableDeps(context).inferExpressionType(expression.left, context) === 'null' || isNullableRuntimeExpression(expression.left, context))
  )
}

export function canLowerCScalarNullishCoalescingExpression(expression, context) {
  if (!isNullishCoalescingExpression(expression)) {
    return false
  }

  const resultType = nullableDeps(context).inferExpressionType(expression, context)

  return (
    ['number', 'boolean'].includes(resultType) &&
    (nullableDeps(context).inferExpressionType(expression.left, context) === 'null' || isNullableRuntimeExpression(expression.left, context))
  )
}

export function isNullableRuntimeExpression(expression, context) {
  if (expression?.type === 'Reference' && expression.path.length === 1) {
    return context.nullableVariables.has(expression.path[0])
  }

  if (nullableDeps(context).isNumberConversionCall(expression, context)) {
    return true
  }

  if (
    expression?.type === 'CallExpression' &&
    expression.callee.type === 'Reference' &&
    expression.callee.path.length === 1
  ) {
    return context.functionReturnNullables.get(expression.callee.path[0]) === true
  }

  if (expression?.type === 'OptionalCallExpression') {
    const functionType = nullableDeps(context).resolveRuntimeCallbackCalleeType(expression.callee, context)

    return functionType != null && isRuntimeNullableType(functionType.returnType)
  }

  if (isNullishCoalescingExpression(expression)) {
    return false
  }

  return expression?.nullable === true && isRuntimeNullableType(nullableDeps(context).inferExpressionType(expression, context))
}

export function emitNullableRuntimeValueVariableDeclaration(statement, context) {
  const valueType = statement.valueType
  const expectedTag = cRuntimeValueTag(valueType)

  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, valueType)
  context.nullableVariables.add(statement.name)

  if (valueType === 'object') {
    registerObjectShape(context, statement.name, statement.shape)
  } else if (valueType === 'array') {
    context.runtimeArrayElementTypes.set(statement.name, statement.arrayElementType ?? 'unknown')
  } else if (valueType === 'map') {
    context.mapTypes.set(statement.name, {
      key: statement.mapKeyType ?? 'unknown',
      value: statement.mapValueType ?? 'unknown'
    })
  } else if (valueType === 'set') {
    context.setElementTypes.set(statement.name, statement.setElementType ?? 'unknown')
  } else if (valueType === 'function') {
    context.functionTypes.set(statement.name, normalizeNullableFunctionType(statement.functionType))
    context.runtimeCallbacks.add(statement.name)
  }

  if (statement.init == null || statement.init.type === 'NullLiteral') {
    return [...emitPrepareOwnedValueWrite(statement.name), `${statement.name} = ccjs_null_value();`]
  }

  const deps = nullableDeps(context)
  const value = isNullableScalarType(valueType)
    ? deps.emitNullableScalarValueExpression(statement.init, context)
    : valueType === 'function'
      ? deps.emitNullableFunctionValueExpression(statement.init, statement.functionType, context)
      : statement.init.type === 'ObjectLiteral'
        ? deps.emitCObjectLiteralValueExpression(statement.init, context, statement.shape)
        : deps.emitCValueExpression(statement.init, context)

  return [
    ...value.lines,
    ...emitPrepareOwnedValueWrite(statement.name),
    `${statement.name} = ${value.expression};`,
    ...emitRuntimeNullableValueCheck(statement.name, expectedTag, context),
    `ccjs_retain(${statement.name});`
  ]
}

function normalizeNullableFunctionType(functionType) {
  return functionType ?? {
    kind: 'function',
    params: functionType?.params ?? [],
    returnType: functionType?.returnType ?? 'void'
  }
}
