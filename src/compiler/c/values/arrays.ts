import {
  emitPrepareOwnedValueWrite,
  emitStatusCheck,
  nextCName,
  registerOwnedValue
} from '../context.ts'
import { arrayRuntimeMethodName } from '../../stdlib/descriptors/collections.ts'

type PreparedExpression = {
  lines: string[]
  expression: string
}

export type ArrayLoweringDependencies = {
  emitCValueExpression: (expression: any, context: any) => PreparedExpression
  inferExpressionType: (expression: any, context: any) => string
  resolveKnownObjectIndex: (expression: any, context: any) => any | null
  resolveKnownObjectMember: (expression: any, context: any) => any | null
}

function arrayDeps(context: any): ArrayLoweringDependencies {
  return context.arrayLoweringDependencies
}

export function isArrayMethodCall(expression) {
  return (
    expression?.type === 'CallExpression' &&
    expression.callee.type === 'MemberExpression' &&
    arrayRuntimeMethodName(expression.callee.property) != null
  )
}

export function isArrayLengthExpression(expression, context) {
  return (
    expression?.type === 'MemberExpression' &&
    expression.property === 'length' &&
    arrayDeps(context).inferExpressionType(expression.object, context) === 'array'
  )
}

export function resolveKnownArrayIndex(expression, context) {
  if (
    expression?.type !== 'IndexExpression' ||
    expression.object.type !== 'Reference' ||
    expression.object.path.length !== 1 ||
    expression.index.type !== 'NumberLiteral'
  ) {
    return null
  }

  const arrayName = expression.object.path[0]
  const elements = context.arrayShapes.get(arrayName)

  if (elements == null) {
    return null
  }

  const index = Number.parseInt(expression.index.value, 10)

  if (!Number.isInteger(index) || index < 0 || index >= elements.length) {
    return null
  }

  return {
    arrayName,
    index,
    valueType: elements[index].valueType
  }
}

export function resolveRuntimeArrayIndex(expression, context) {
  if (expression?.type !== 'IndexExpression' || expression.index.type !== 'NumberLiteral') {
    return null
  }

  const index = Number.parseInt(expression.index.value, 10)

  if (!Number.isInteger(index) || index < 0) {
    return null
  }

  const valueType = resolveRuntimeArrayElementType(expression.object, context)

  return valueType == null
    ? null
    : {
        index,
        valueType
      }
}

export function resolveOptionalRuntimeArrayIndex(expression, context) {
  if (expression?.type !== 'OptionalIndexExpression' || expression.index.type !== 'NumberLiteral') {
    return null
  }

  const index = Number.parseInt(expression.index.value, 10)

  if (!Number.isInteger(index) || index < 0) {
    return null
  }

  const valueType = resolveRuntimeArrayElementType(expression.object, context)

  return valueType == null
    ? null
    : {
        index,
        valueType
      }
}

export function resolveRuntimeArrayElementType(expression, context) {
  if (expression?.type === 'Reference' && expression.path.length === 1) {
    return context.runtimeArrayElementTypes.get(expression.path[0]) ?? null
  }

  if (expression?.type === 'CallExpression') {
    const functionReturn = resolveFunctionReturnNameFromCall(expression)

    return expression.valueType === 'array'
      ? (expression.arrayElementType ??
          (functionReturn == null ? null : context.functionReturnArrayElementTypes.get(functionReturn)) ??
          'unknown')
      : null
  }

  if (expression?.type === 'MemberExpression') {
    const member = arrayDeps(context).resolveKnownObjectMember(expression, context)

    return member?.valueType === 'array' ? (member.arrayElementType ?? 'unknown') : null
  }

  if (expression?.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
    const field = arrayDeps(context).resolveKnownObjectIndex(expression, context)

    return field?.valueType === 'array' ? (field.arrayElementType ?? 'unknown') : null
  }

  return null
}

function resolveFunctionReturnNameFromCall(expression) {
  return expression?.type === 'CallExpression' &&
    expression.callee.type === 'Reference' &&
    expression.callee.path.length === 1
    ? expression.callee.path[0]
    : null
}

export function emitPreparedRuntimeArrayIndexValue(expression, element, context, prefix = 'ccjs_array_item') {
  const array = arrayDeps(context).emitCValueExpression(expression.object, context)
  const value = nextCName(context, prefix)
  registerOwnedValue(context, value)

  return {
    lines: [
      ...array.lines,
      ...emitPrepareOwnedValueWrite(value),
      emitStatusCheck(`ccjs_array_get(${array.expression}, ${element.index}, &${value})`, context)
    ],
    expression: value
  }
}

export function resolveKnownArrayLength(expression, context) {
  if (expression?.type !== 'MemberExpression' || expression.property !== 'length') {
    return null
  }

  if (expression.object.type === 'ArrayLiteral') {
    return `${expression.object.elements.length}`
  }

  if (expression.object.type !== 'Reference' || expression.object.path.length !== 1) {
    return null
  }

  const elements = context.arrayShapes.get(expression.object.path[0])

  return elements == null ? null : `${elements.length}`
}

export function emitPreparedArrayLengthExpression(expression, context) {
  if (expression?.type !== 'MemberExpression' || expression.property !== 'length') {
    return null
  }

  const knownLength = resolveKnownArrayLength(expression, context)

  if (knownLength != null) {
    return {
      lines: [],
      expression: knownLength
    }
  }

  if (arrayDeps(context).inferExpressionType(expression.object, context) !== 'array') {
    return null
  }

  const value = arrayDeps(context).emitCValueExpression(expression.object, context)
  const temp = nextCName(context, 'ccjs_array_len')

  return {
    lines: [
      ...value.lines,
      `size_t ${temp} = 0;`,
      emitStatusCheck(`ccjs_array_len(${value.expression}, &${temp})`, context)
    ],
    expression: temp
  }
}

export function resolveKnownForOfArray(expression, context) {
  if (expression?.type !== 'Reference' || expression.path.length !== 1) {
    return null
  }

  const name = expression.path[0]
  const elements = context.arrayShapes.get(name)

  return elements == null
    ? null
    : {
        name,
        elements
      }
}

export function resolveRuntimeForOfArray(expression, context) {
  const elementType = resolveRuntimeArrayElementType(expression, context)

  if (elementType == null) {
    return null
  }

  if (expression?.type === 'Reference' && expression.path.length === 1) {
    return {
      name: expression.path[0],
      elementType,
      lines: []
    }
  }

  const value = arrayDeps(context).emitCValueExpression(expression, context)

  return {
    name: value.expression,
    elementType,
    lines: value.lines
  }
}

export function resolveForOfElementType(elements) {
  if (elements.length === 0) {
    return 'unknown'
  }

  const [first] = elements

  if (first?.valueType == null || first.valueType === 'unknown') {
    return 'unknown'
  }

  return elements.every((element) => element.valueType === first.valueType) ? first.valueType : 'unknown'
}

export function updateKnownArrayElementValueType(element, valueType, context) {
  if (valueType === 'unknown') {
    return
  }

  const elements = context.arrayShapes.get(element.arrayName)

  if (elements == null || elements[element.index] == null) {
    return
  }

  elements[element.index] = {
    ...elements[element.index],
    valueType
  }
}
