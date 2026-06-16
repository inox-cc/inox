import {
  emitPrepareOwnedValueWrite,
  emitRuntimeTypeCheck,
  emitStatusCheck,
  nextCName,
  pushVariableScope,
  registerOwnedValue,
  restoreVariableScope
} from '../context.ts'
import { arrayRuntimeMethodName } from '../../stdlib/descriptors/collections.ts'
import { emitCConditionClause } from './expressions.ts'
import { emitRuntimeFieldValueCheck } from '../runtime-values.ts'
import { cRuntimeValueTag } from '../value-types.ts'
import type { AnyNode } from '../../types.ts'
import type { CFunctionContext } from '../context.ts'
import type {
  CArrayElementInfo,
  CKnownArrayElement,
  CObjectFieldInfo,
  CPreparedCallOptions as PreparedCallOptions,
  CPreparedExpression as PreparedExpression,
  CRuntimeArrayElement
} from '../types.ts'

export type ArrayLoweringDependencies = {
  emitCArrayLiteralValueExpression: (expression: AnyNode, context: CFunctionContext) => PreparedExpression
  emitCStringSplitValueExpression: (expression: AnyNode, context: CFunctionContext) => PreparedArrayExpression | null
  emitCValueExpression: (expression: AnyNode, context: CFunctionContext) => PreparedExpression
  emitPreparedNumberExpression: (expression: AnyNode, context: CFunctionContext) => PreparedExpression
  inferExpressionType: (expression: AnyNode, context: CFunctionContext) => string
  resolveKnownObjectIndex: (expression: AnyNode, context: CFunctionContext) => CObjectFieldInfo | null
  resolveKnownObjectMember: (expression: AnyNode, context: CFunctionContext) => CObjectFieldInfo | null
}

export type PreparedArrayExpression = PreparedExpression & {
  elementType: string
}

type PreparedArrayReceiver = {
  lines: string[]
  expression: string
  elementType: string
}

type KnownForOfArray = {
  name: string
  elements: CArrayElementInfo[]
}

type RuntimeForOfArray = {
  name: string
  elementType: string
  lines: string[]
}

type ArrayCallbackBody =
  | {
      kind: 'prepared-return'
      returnExpression: AnyNode
    }
  | {
      kind: 'statement-list'
      statements: AnyNode[]
    }

function arrayDeps(context: CFunctionContext): ArrayLoweringDependencies {
  return context.arrayLoweringDependencies
}

function isSupportedRuntimeArrayElementType(valueType: string): boolean {
  return valueType === 'number' || valueType === 'boolean' || valueType === 'string'
}

function appendLines(out: string[], lines: string[]): void {
  for (const line of lines) {
    out.push(line)
  }
}

function appendPrefixedLines(out: string[], lines: string[], prefix: string): void {
  for (const line of lines) {
    out.push(`${prefix}${line}`)
  }
}

function cloneArrayShape(shape: CArrayElementInfo[]): CArrayElementInfo[] {
  const out: CArrayElementInfo[] = []

  for (const element of shape) {
    out.push({
      valueType: element.valueType
    })
  }

  return out
}

export function isArrayMethodCall(expression: AnyNode): boolean {
  return (
    expression != null &&
    expression.type === 'CallExpression' &&
    expression.callee.type === 'MemberExpression' &&
    arrayRuntimeMethodName(expression.callee.property) != null
  )
}

export function isArrayLengthExpression(expression: AnyNode, context: CFunctionContext): boolean {
  return (
    expression != null &&
    expression.type === 'MemberExpression' &&
    expression.property === 'length' &&
    arrayDeps(context).inferExpressionType(expression.object, context) === 'array'
  )
}

export function resolveKnownArrayIndex(expression: AnyNode, context: CFunctionContext): CKnownArrayElement | null {
  if (
    expression == null ||
    expression.type !== 'IndexExpression' ||
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

export function resolveRuntimeArrayIndex(expression: AnyNode, context: CFunctionContext): CRuntimeArrayElement | null {
  if (expression == null || expression.type !== 'IndexExpression') {
    return null
  }

  const valueType = resolveRuntimeArrayElementType(expression.object, context)

  if (valueType == null) {
    return null
  }

  if (expression.index.type !== 'NumberLiteral') {
    if (arrayDeps(context).inferExpressionType(expression.index, context) !== 'number') {
      return null
    }

    return {
      index: 0,
      indexExpression: expression.index,
      valueType
    }
  }

  const index = Number.parseInt(expression.index.value, 10)

  if (!Number.isInteger(index) || index < 0) {
    return null
  }

  return {
    index,
    indexExpression: null,
    valueType
  }
}

export function resolveOptionalRuntimeArrayIndex(
  expression: AnyNode,
  context: CFunctionContext
): CRuntimeArrayElement | null {
  if (expression == null || expression.type !== 'OptionalIndexExpression') {
    return null
  }

  const valueType = resolveRuntimeArrayElementType(expression.object, context)

  if (valueType == null) {
    return null
  }

  if (expression.index.type !== 'NumberLiteral') {
    if (arrayDeps(context).inferExpressionType(expression.index, context) !== 'number') {
      return null
    }

    return {
      index: 0,
      indexExpression: expression.index,
      valueType
    }
  }

  const index = Number.parseInt(expression.index.value, 10)

  if (!Number.isInteger(index) || index < 0) {
    return null
  }

  return {
    index,
    indexExpression: null,
    valueType
  }
}

export function resolveRuntimeArrayElementType(expression: AnyNode, context: CFunctionContext): string | null {
  if (expression != null && expression.type === 'Reference' && expression.path.length === 1) {
    const runtimeElementType = context.runtimeArrayElementTypes.get(expression.path[0])

    if (runtimeElementType != null) {
      return runtimeElementType
    }

    const shape = context.arrayShapes.get(expression.path[0])

    if (shape != null) {
      return resolveForOfElementType(shape)
    }

    return null
  }

  if (expression != null && expression.type === 'CallExpression') {
    const functionReturn = resolveFunctionReturnNameFromCall(expression)

    if (expression.valueType !== 'array') {
      return null
    }

    if (expression.arrayElementType != null) {
      return expression.arrayElementType
    }

    if (functionReturn != null) {
      const functionElementType = context.functionReturnArrayElementTypes.get(functionReturn)

      if (functionElementType != null) {
        return functionElementType
      }
    }

    return 'unknown'
  }

  if (expression != null && expression.type === 'MemberExpression') {
    const member = arrayDeps(context).resolveKnownObjectMember(expression, context)

    if (member == null || member.valueType !== 'array') {
      return null
    }

    if (member.arrayElementType != null) {
      return member.arrayElementType
    }

    return 'unknown'
  }

  if (expression != null && expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
    const field = arrayDeps(context).resolveKnownObjectIndex(expression, context)

    if (field == null || field.valueType !== 'array') {
      return null
    }

    if (field.arrayElementType != null) {
      return field.arrayElementType
    }

    return 'unknown'
  }

  return null
}

function resolveFunctionReturnNameFromCall(expression: AnyNode): string | null {
  if (
    expression == null ||
    expression.type !== 'CallExpression' ||
    expression.callee.type !== 'Reference' ||
    expression.callee.path.length !== 1
  ) {
    return null
  }

  return expression.callee.path[0]
}

export function emitPreparedRuntimeArrayIndexValue(
  expression: AnyNode,
  element: CRuntimeArrayElement,
  context: CFunctionContext,
  prefix: string
): PreparedExpression {
  const array = arrayDeps(context).emitCValueExpression(expression.object, context)
  const index = emitPreparedRuntimeArrayIndexExpression(element, context)
  const value = nextCName(context, prefix)
  registerOwnedValue(context, value)
  const lines: string[] = []

  appendLines(lines, array.lines)
  appendLines(lines, index.lines)
  appendLines(lines, emitPrepareOwnedValueWrite(value))
  lines.push(emitStatusCheck(`ccjs_array_get(${array.expression}, ${index.expression}, &${value})`, context))

  return {
    lines,
    expression: value
  }
}

function emitPreparedRuntimeArrayIndexExpression(
  element: CRuntimeArrayElement,
  context: CFunctionContext
): PreparedExpression {
  if (element.indexExpression == null) {
    return {
      lines: [],
      expression: `${element.index}`
    }
  }

  const index = arrayDeps(context).emitPreparedNumberExpression(element.indexExpression, context)

  return {
    lines: index.lines,
    expression: `(size_t)(${index.expression})`
  }
}

export function emitPreparedKnownArrayIndexValueExpression(
  expression: AnyNode,
  context: CFunctionContext
): PreparedExpression | null {
  const element = resolveKnownArrayIndex(expression, context)

  if (element == null || (element.valueType !== 'array' && element.valueType !== 'string')) {
    return null
  }

  const temp = nextCName(context, 'ccjs_value')
  let tag = 'CCJS_TAG_STRING'

  if (element.valueType === 'array') {
    tag = 'CCJS_TAG_ARRAY'
  }

  registerOwnedValue(context, temp)
  const lines: string[] = []

  appendLines(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(emitStatusCheck(`ccjs_array_get(${element.arrayName}, ${element.index}, &${temp})`, context))
  appendLines(lines, emitRuntimeFieldValueCheck(temp, tag, expression, context))

  return {
    lines,
    expression: temp
  }
}

export function emitPreparedRuntimeArrayIndexValueExpression(
  expression: AnyNode,
  context: CFunctionContext
): PreparedExpression | null {
  const runtimeElement = resolveRuntimeArrayIndex(expression, context)

  if (runtimeElement == null) {
    return null
  }

  const value = emitPreparedRuntimeArrayIndexValue(expression, runtimeElement, context, 'ccjs_value')

  if (runtimeElement.valueType === 'string') {
    const lines: string[] = []

    appendLines(lines, value.lines)
    appendLines(lines, emitRuntimeFieldValueCheck(value.expression, 'CCJS_TAG_STRING', expression, context))

    return {
      lines,
      expression: value.expression
    }
  }

  const tag = cRuntimeValueTag(runtimeElement.valueType)

  if (tag == null) {
    return value
  }

  const checkedLines: string[] = []

  appendLines(checkedLines, value.lines)
  appendLines(checkedLines, emitRuntimeFieldValueCheck(value.expression, tag, expression, context))

  return {
    lines: checkedLines,
    expression: value.expression
  }
}

export function resolveKnownArrayLength(expression: AnyNode, context: CFunctionContext): string | null {
  if (expression == null || expression.type !== 'MemberExpression' || expression.property !== 'length') {
    return null
  }

  if (expression.object.type === 'ArrayLiteral') {
    return `${expression.object.elements.length}`
  }

  if (expression.object.type !== 'Reference' || expression.object.path.length !== 1) {
    return null
  }

  const elements = context.arrayShapes.get(expression.object.path[0])

  if (elements == null) {
    return null
  }

  return `${elements.length}`
}

export function emitPreparedArrayLengthExpression(
  expression: AnyNode,
  context: CFunctionContext
): PreparedExpression | null {
  if (expression == null || expression.type !== 'MemberExpression' || expression.property !== 'length') {
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
  const lines: string[] = []

  appendLines(lines, value.lines)
  lines.push(`size_t ${temp} = 0;`)
  lines.push(emitStatusCheck(`ccjs_array_len(${value.expression}, &${temp})`, context))

  return {
    lines,
    expression: temp
  }
}

export function resolveKnownForOfArray(
  expression: AnyNode,
  context: CFunctionContext
): KnownForOfArray | null {
  if (expression == null || expression.type !== 'Reference' || expression.path.length !== 1) {
    return null
  }

  const name = expression.path[0]
  const elements = context.arrayShapes.get(name)

  if (elements == null) {
    return null
  }

  return {
    name,
    elements
  }
}

export function resolveRuntimeForOfArray(
  expression: AnyNode,
  context: CFunctionContext
): RuntimeForOfArray | null {
  const elementType = resolveRuntimeArrayElementType(expression, context)

  if (elementType == null) {
    return null
  }

  if (expression != null && expression.type === 'Reference' && expression.path.length === 1) {
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

export function resolveForOfElementType(elements: CArrayElementInfo[]): string {
  if (elements.length === 0) {
    return 'unknown'
  }

  const first = elements[0]

  if (first == null || first.valueType == null || first.valueType === 'unknown') {
    return 'unknown'
  }

  for (const element of elements) {
    if (element.valueType !== first.valueType) {
      return 'unknown'
    }
  }

  return first.valueType
}

export function updateKnownArrayElementValueType(
  element: CKnownArrayElement,
  valueType: string,
  context: CFunctionContext
): void {
  if (valueType === 'unknown') {
    return
  }

  const elements = context.arrayShapes.get(element.arrayName)

  if (elements == null || elements[element.index] == null) {
    return
  }

  elements[element.index] = {
    valueType
  }
}

export function emitArraySortVariableDeclaration(
  statement: AnyNode,
  sorted: PreparedArrayExpression,
  context: CFunctionContext
): string[] {
  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'array')

  const shape = context.arrayShapes.get(sorted.expression)

  if (shape != null) {
    context.arrayShapes.set(statement.name, cloneArrayShape(shape))
  } else {
    let elementType = sorted.elementType

    if (statement.arrayElementType != null) {
      elementType = statement.arrayElementType
    }

    context.runtimeArrayElementTypes.set(statement.name, elementType)
  }

  const lines: string[] = []

  appendLines(lines, sorted.lines)
  appendLines(lines, emitPrepareOwnedValueWrite(statement.name))
  lines.push(`${statement.name} = ${sorted.expression};`)
  lines.push(`ccjs_retain(${statement.name});`)

  return lines
}

export function emitArrayFilterVariableDeclaration(
  statement: AnyNode,
  filtered: PreparedArrayExpression,
  context: CFunctionContext
): string[] {
  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'array')

  let elementType = filtered.elementType

  if (statement.arrayElementType != null) {
    elementType = statement.arrayElementType
  }

  context.runtimeArrayElementTypes.set(statement.name, elementType)

  const lines: string[] = []

  appendLines(lines, filtered.lines)
  appendLines(lines, emitPrepareOwnedValueWrite(statement.name))
  lines.push(`${statement.name} = ${filtered.expression};`)
  lines.push(`ccjs_retain(${statement.name});`)

  return lines
}

export function emitArrayMapVariableDeclaration(
  statement: AnyNode,
  mapped: PreparedArrayExpression,
  context: CFunctionContext
): string[] {
  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'array')

  let elementType = mapped.elementType

  if (statement.arrayElementType != null) {
    elementType = statement.arrayElementType
  }

  context.runtimeArrayElementTypes.set(statement.name, elementType)

  const lines: string[] = []

  appendLines(lines, mapped.lines)
  appendLines(lines, emitPrepareOwnedValueWrite(statement.name))
  lines.push(`${statement.name} = ${mapped.expression};`)
  lines.push(`ccjs_retain(${statement.name});`)

  return lines
}

export function emitPreparedArraySortCallExpression(
  expression: AnyNode,
  context: CFunctionContext
): PreparedArrayExpression | null {
  if (
    expression == null ||
    expression.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.property !== 'sort' ||
    expression.args.length > 1
  ) {
    return null
  }

  const receiver = emitPreparedArrayReceiver(expression.callee.object, context)

  if (receiver == null) {
    return null
  }

  if (expression.args.length === 1) {
    return emitPreparedArrayComparatorSortCallExpression(expression, receiver, context)
  }

  const lines: string[] = []

  appendLines(lines, receiver.lines)
  lines.push(emitStatusCheck(`ccjs_array_sort(${receiver.expression})`, context))

  return {
    lines,
    expression: receiver.expression,
    elementType: receiver.elementType
  }
}

export function emitPreparedArrayPushCallExpression(
  expression: AnyNode,
  context: CFunctionContext
): PreparedArrayExpression | null {
  if (
    expression == null ||
    expression.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.property !== 'push' ||
    expression.args.length !== 1
  ) {
    return null
  }

  const receiver = emitPreparedArrayReceiver(expression.callee.object, context)

  if (receiver == null) {
    return null
  }

  const valueType = arrayDeps(context).inferExpressionType(expression.args[0], context)
  const value = emitPreparedArrayElementValue(expression.args[0], valueType, context)

  updatePushedArrayMetadata(expression.callee.object, valueType, context)

  const lines: string[] = []

  appendLines(lines, receiver.lines)
  appendLines(lines, value.lines)
  lines.push(emitStatusCheck(`ccjs_array_push(${receiver.expression}, ${value.expression})`, context))

  return {
    lines,
    expression: '',
    elementType: receiver.elementType
  }
}

export function emitPreparedArrayPopCallExpression(
  expression: AnyNode,
  context: CFunctionContext,
  options: PreparedCallOptions | null
): PreparedArrayExpression | null {
  if (
    expression == null ||
    expression.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.property !== 'pop' ||
    expression.args.length !== 0
  ) {
    return null
  }

  const receiver = emitPreparedArrayReceiver(expression.callee.object, context)

  if (receiver == null) {
    return null
  }

  const value = nextCName(context, 'ccjs_array_pop')
  registerOwnedValue(context, value)
  updatePoppedArrayMetadata(expression.callee.object, context)

  const lines: string[] = []

  appendLines(lines, receiver.lines)
  appendLines(lines, emitPrepareOwnedValueWrite(value))
  lines.push(emitStatusCheck(`ccjs_array_pop(${receiver.expression}, &${value})`, context))

  if (options != null && options.discard === true) {
    lines.push(`ccjs_release(${value});`)
    lines.push(`${value} = ccjs_undefined_value();`)
  }

  return {
    lines,
    expression: value,
    elementType: receiver.elementType
  }
}

function emitPreparedArrayComparatorSortCallExpression(
  expression: AnyNode,
  receiver: PreparedArrayReceiver,
  context: CFunctionContext
): PreparedArrayExpression | null {
  const callback = expression.args[0]
  const returnExpression = resolveArrowReturnExpression(callback)

  if (
    callback == null ||
    callback.type !== 'ArrowFunctionExpression' ||
    returnExpression == null ||
    callback.params.length > 2 ||
    !isSupportedRuntimeArrayElementType(receiver.elementType)
  ) {
    return null
  }

  const length = nextCName(context, 'ccjs_sort_length')
  const index = nextCName(context, 'ccjs_sort_index')
  const scan = nextCName(context, 'ccjs_sort_scan')
  const left = nextCName(context, 'ccjs_sort_left')
  const right = nextCName(context, 'ccjs_sort_right')
  const compare = nextCName(context, 'ccjs_sort_compare')

  registerOwnedValue(context, left)
  registerOwnedValue(context, right)

  const bodyScope = pushVariableScope(context)
  let body: string[] = []

  try {
    const input = emitPreparedArraySortComparatorInput(callback, receiver, left, right, context)
    const result = arrayDeps(context).emitPreparedNumberExpression(returnExpression, context)

    body = []
    appendLines(body, input)
    appendLines(body, result.lines)
    body.push(`double ${compare} = ${result.expression};`)
    body.push(`if (!(${compare} > 0)) break;`)
    body.push(emitStatusCheck(`ccjs_array_set(${receiver.expression}, ${scan} - 1, ${right})`, context))
    body.push(emitStatusCheck(`ccjs_array_set(${receiver.expression}, ${scan}, ${left})`, context))
  } finally {
    restoreVariableScope(context, bodyScope)
  }

  const leftReadStatus = emitStatusCheck(`ccjs_array_get(${receiver.expression}, ${scan} - 1, &${left})`, context)
  const rightReadStatus = emitStatusCheck(`ccjs_array_get(${receiver.expression}, ${scan}, &${right})`, context)
  const lines: string[] = []

  appendLines(lines, receiver.lines)
  lines.push(`size_t ${length} = 0;`)
  lines.push(emitStatusCheck(`ccjs_array_len(${receiver.expression}, &${length})`, context))
  lines.push(`for (size_t ${index} = 1; ${index} < ${length}; ${index} += 1) {`)
  lines.push(`  for (size_t ${scan} = ${index}; ${scan} > 0; ${scan} -= 1) {`)
  appendPrefixedLines(lines, emitPrepareOwnedValueWrite(left), '    ')
  lines.push(`    ${leftReadStatus}`)
  appendPrefixedLines(lines, emitPrepareOwnedValueWrite(right), '    ')
  lines.push(`    ${rightReadStatus}`)
  appendPrefixedLines(lines, body, '    ')
  lines.push('  }')
  lines.push('}')
  appendLines(lines, emitPrepareOwnedValueWrite(right))
  appendLines(lines, emitPrepareOwnedValueWrite(left))

  return {
    lines,
    expression: receiver.expression,
    elementType: receiver.elementType
  }
}

export function emitPreparedArrayMapCallExpression(
  expression: AnyNode,
  context: CFunctionContext
): PreparedArrayExpression | null {
  if (
    expression == null ||
    expression.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.property !== 'map' ||
    expression.args.length !== 1
  ) {
    return null
  }

  const callback = expression.args[0]
  const callbackBody = resolveArrayCallbackBody(callback)

  if (
    callback == null ||
    callback.type !== 'ArrowFunctionExpression' ||
    callbackBody == null ||
    callback.params.length > 2
  ) {
    return null
  }

  const receiver = emitPreparedArrayReceiver(expression.callee.object, context)

  if (receiver == null || !isSupportedRuntimeArrayElementType(receiver.elementType)) {
    return null
  }

  const out = nextCName(context, 'ccjs_map_array')
  const length = nextCName(context, 'ccjs_map_length')
  const index = nextCName(context, 'ccjs_map_index')
  const value = nextCName(context, 'ccjs_map_value')
  let mappedElementType = 'unknown'

  if (expression.arrayElementType != null) {
    mappedElementType = expression.arrayElementType
  }

  registerOwnedValue(context, out)
  registerOwnedValue(context, value)

  const bodyScope = pushVariableScope(context)
  let body: string[] | null = null

  try {
    const input = emitPreparedArrayCallbackInput(callback, receiver, value, index, context)

    if (mappedElementType === 'unknown') {
      mappedElementType = resolveArrayCallbackReturnType(callbackBody, context)
    }

    if (!isSupportedRuntimeArrayElementType(mappedElementType)) {
      body = null
    } else {
      body = []
      appendLines(body, input)
      appendLines(body, emitArrayMapCallbackBodyLines(callbackBody, mappedElementType, out, context))
    }
  } finally {
    restoreVariableScope(context, bodyScope)
  }

  if (body == null) {
    return null
  }

  const readStatus = emitStatusCheck(`ccjs_array_get(${receiver.expression}, ${index}, &${value})`, context)
  const lines: string[] = []

  appendLines(lines, receiver.lines)
  appendLines(lines, emitPrepareOwnedValueWrite(out))
  lines.push(emitStatusCheck(`ccjs_array_new(&ccjs_default_allocator, 0, &${out})`, context))
  lines.push(`size_t ${length} = 0;`)
  lines.push(emitStatusCheck(`ccjs_array_len(${receiver.expression}, &${length})`, context))
  lines.push(`for (size_t ${index} = 0; ${index} < ${length}; ${index} += 1) {`)
  appendPrefixedLines(lines, emitPrepareOwnedValueWrite(value), '  ')
  lines.push(`  ${readStatus}`)
  appendPrefixedLines(lines, body, '  ')
  lines.push('}')
  appendLines(lines, emitPrepareOwnedValueWrite(value))

  return {
    lines,
    expression: out,
    elementType: mappedElementType
  }
}

export function emitPreparedArrayFilterCallExpression(
  expression: AnyNode,
  context: CFunctionContext
): PreparedArrayExpression | null {
  if (
    expression == null ||
    expression.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.property !== 'filter' ||
    expression.args.length !== 1
  ) {
    return null
  }

  const callback = expression.args[0]
  const booleanCallback = isArrayFilterBooleanCallback(callback)
  let callbackBody: ArrayCallbackBody | null = null

  if (!booleanCallback) {
    callbackBody = resolveArrayCallbackBody(callback)
  }

  if (
    callback == null ||
    (!booleanCallback &&
      (callback.type !== 'ArrowFunctionExpression' ||
        callbackBody == null ||
        callback.params.length > 2))
  ) {
    return null
  }

  const receiver = emitPreparedArrayReceiver(expression.callee.object, context)

  if (receiver == null || !isSupportedRuntimeArrayElementType(receiver.elementType)) {
    return null
  }

  const out = nextCName(context, 'ccjs_filter_array')
  const length = nextCName(context, 'ccjs_filter_length')
  const index = nextCName(context, 'ccjs_filter_index')
  const value = nextCName(context, 'ccjs_filter_value')

  registerOwnedValue(context, out)
  registerOwnedValue(context, value)

  const bodyScope = pushVariableScope(context)
  let body: string[] = []

  try {
    if (booleanCallback) {
      appendLines(body, emitArrayFilterBooleanCallbackBodyLines(receiver.elementType, out, value, context))
    } else {
      if (callbackBody == null) {
        return null
      }

      const input = emitPreparedArrayCallbackInput(callback, receiver, value, index, context)

      body = []
      appendLines(body, input)
      appendLines(body, emitArrayFilterCallbackBodyLines(callbackBody, out, value, context))
    }
  } finally {
    restoreVariableScope(context, bodyScope)
  }

  const readStatus = emitStatusCheck(`ccjs_array_get(${receiver.expression}, ${index}, &${value})`, context)
  const lines: string[] = []

  appendLines(lines, receiver.lines)
  appendLines(lines, emitPrepareOwnedValueWrite(out))
  lines.push(emitStatusCheck(`ccjs_array_new(&ccjs_default_allocator, 0, &${out})`, context))
  lines.push(`size_t ${length} = 0;`)
  lines.push(emitStatusCheck(`ccjs_array_len(${receiver.expression}, &${length})`, context))
  lines.push(`for (size_t ${index} = 0; ${index} < ${length}; ${index} += 1) {`)
  appendPrefixedLines(lines, emitPrepareOwnedValueWrite(value), '  ')
  lines.push(`  ${readStatus}`)
  appendPrefixedLines(lines, body, '  ')
  lines.push('}')
  appendLines(lines, emitPrepareOwnedValueWrite(value))

  return {
    lines,
    expression: out,
    elementType: receiver.elementType
  }
}

function isArrayFilterBooleanCallback(callback: AnyNode): boolean {
  return callback.type === 'Reference' && callback.path.length === 1 && callback.path[0] === 'Boolean'
}

function resolveArrowReturnExpression(callback: AnyNode): AnyNode | null {
  if (callback == null || callback.type !== 'ArrowFunctionExpression') {
    return null
  }

  if (callback.expressionBody) {
    return callback.body
  }

  let statements: AnyNode[] | null = null

  if (Array.isArray(callback.body)) {
    statements = callback.body
  } else if (callback.body != null && callback.body.type === 'BlockStatement') {
    statements = callback.body.body
  }

  if (statements == null || statements.length !== 1) {
    return null
  }

  const statement = statements[0]

  if (statement == null || statement.type !== 'ReturnStatement' || statement.argument == null) {
    return null
  }

  return statement.argument
}

function resolveArrayCallbackBody(callback: AnyNode): ArrayCallbackBody | null {
  const returnExpression = resolveArrowReturnExpression(callback)

  if (returnExpression != null) {
    return {
      kind: 'prepared-return',
      returnExpression
    }
  }

  if (callback == null || callback.type !== 'ArrowFunctionExpression' || callback.expressionBody) {
    return null
  }

  let statements: AnyNode[] | null = null

  if (Array.isArray(callback.body)) {
    statements = callback.body
  } else if (callback.body != null && callback.body.type === 'BlockStatement') {
    statements = callback.body.body
  }

  if (statements == null || !canLowerArrayCallbackStatementList(statements)) {
    return null
  }

  return {
    kind: 'statement-list',
    statements
  }
}

function canLowerArrayCallbackStatementList(statements: AnyNode[] | null | undefined): boolean {
  if (statements == null || statements.length === 0) {
    return false
  }

  for (let index = 0; index < statements.length; index = index + 1) {
    const statement = statements[index]

    if (index === statements.length - 1) {
      if (!canLowerArrayCallbackTerminalStatement(statement)) {
        return false
      }
    } else if (!canLowerArrayCallbackEarlyReturnStatement(statement)) {
      return false
    }
  }

  return true
}

function canLowerArrayCallbackTerminalStatement(statement: AnyNode | null | undefined): boolean {
  if (statement == null) {
    return false
  }

  if (statement.type === 'ReturnStatement') {
    return statement.argument != null
  }

  if (statement.type === 'BlockStatement') {
    return canLowerArrayCallbackStatementList(statement.body)
  }

  if (statement.type !== 'IfStatement' || statement.alternate == null) {
    return false
  }

  return (
    canLowerArrayCallbackTerminalStatement(statement.consequent) &&
    canLowerArrayCallbackTerminalStatement(statement.alternate)
  )
}

function canLowerArrayCallbackReturnStatement(statement: AnyNode | null | undefined): boolean {
  if (statement == null) {
    return false
  }

  if (statement.type === 'ReturnStatement') {
    return statement.argument != null
  }

  return false
}

function canLowerArrayCallbackEarlyReturnStatement(statement: AnyNode | null | undefined): boolean {
  if (statement == null) {
    return false
  }

  if (statement.type === 'BlockStatement') {
    return canLowerArrayCallbackStatementList(statement.body)
  }

  if (statement.type !== 'IfStatement') {
    return false
  }

  return (
    canLowerArrayCallbackBranch(statement.consequent) &&
    (statement.alternate == null || canLowerArrayCallbackBranch(statement.alternate))
  )
}

function canLowerArrayCallbackBranch(statement: AnyNode | null | undefined): boolean {
  if (canLowerArrayCallbackReturnStatement(statement)) {
    return true
  }

  if (statement == null) {
    return false
  }

  if (statement.type === 'BlockStatement') {
    return canLowerArrayCallbackStatementList(statement.body)
  }

  return canLowerArrayCallbackEarlyReturnStatement(statement)
}

function resolveArrayCallbackReturnType(body: ArrayCallbackBody, context: CFunctionContext): string {
  const expressions = collectArrayCallbackReturnExpressions(body)

  if (expressions.length === 0) {
    return 'unknown'
  }

  const firstType = arrayDeps(context).inferExpressionType(expressions[0], context)

  if (firstType === 'unknown') {
    return 'unknown'
  }

  for (const expression of expressions) {
    if (arrayDeps(context).inferExpressionType(expression, context) !== firstType) {
      return 'unknown'
    }
  }

  return firstType
}

function collectArrayCallbackReturnExpressions(body: ArrayCallbackBody): AnyNode[] {
  if (body.kind === 'prepared-return') {
    const preparedExpressions: AnyNode[] = []

    preparedExpressions.push(body.returnExpression)

    return preparedExpressions
  }

  const expressions: AnyNode[] = []

  for (const statement of body.statements) {
    collectArrayCallbackReturnExpressionsFromStatement(statement, expressions)
  }

  return expressions
}

function collectArrayCallbackReturnExpressionsFromStatement(
  statement: AnyNode | null | undefined,
  expressions: AnyNode[]
): void {
  if (statement == null) {
    return
  }

  if (statement.type === 'ReturnStatement') {
    if (statement.argument != null) {
      expressions.push(statement.argument)
    }

    return
  }

  if (statement.type === 'BlockStatement') {
    for (const child of statement.body) {
      collectArrayCallbackReturnExpressionsFromStatement(child, expressions)
    }

    return
  }

  if (statement.type === 'IfStatement') {
    collectArrayCallbackReturnExpressionsFromStatement(statement.consequent, expressions)
    collectArrayCallbackReturnExpressionsFromStatement(statement.alternate, expressions)
  }
}

function emitArrayMapCallbackBodyLines(
  body: ArrayCallbackBody,
  elementType: string,
  out: string,
  context: CFunctionContext
): string[] {
  return emitArrayCallbackBodyLines(body, 'map', elementType, out, '', context)
}

function emitArrayFilterCallbackBodyLines(
  body: ArrayCallbackBody,
  out: string,
  value: string,
  context: CFunctionContext
): string[] {
  return emitArrayCallbackBodyLines(body, 'filter', '', out, value, context)
}

function emitArrayFilterBooleanCallbackBodyLines(
  elementType: string,
  out: string,
  value: string,
  context: CFunctionContext
): string[] {
  const pushStatus = emitStatusCheck(`ccjs_array_push(${out}, ${value})`, context)
  const lines: string[] = []

  appendLines(lines, emitArrayFilterBooleanTypeCheckLines(elementType, value, context))
  lines.push(`if ${emitCConditionClause(arrayFilterBooleanPredicateExpression(elementType, value))} {`)
  lines.push(`  ${pushStatus}`)
  lines.push('}')

  return lines
}

function emitArrayFilterBooleanTypeCheckLines(
  elementType: string,
  value: string,
  context: CFunctionContext
): string[] {
  if (elementType === 'string') {
    return [emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_STRING || ${value}.as.ref == 0`, context)]
  }

  if (elementType === 'boolean') {
    return [emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_BOOL`, context)]
  }

  return [emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_NUMBER`, context)]
}

function arrayFilterBooleanPredicateExpression(elementType: string, value: string): string {
  if (elementType === 'string') {
    return `((ccjs_string*)${value}.as.ref)->len > 0`
  }

  if (elementType === 'boolean') {
    return `${value}.as.boolean`
  }

  return `(${value}.as.number == ${value}.as.number && ${value}.as.number != 0)`
}

function emitArrayCallbackBodyLines(
  body: ArrayCallbackBody,
  returnKind: string,
  elementType: string,
  out: string,
  value: string,
  context: CFunctionContext
): string[] {
  if (body.kind === 'prepared-return') {
    return emitArrayCallbackReturnLines(body.returnExpression, returnKind, elementType, out, value, context)
  }

  const doneLabel = nextCName(context, 'ccjs_array_callback_done')
  const lines = emitArrayCallbackStatementListLines(body.statements, doneLabel, returnKind, elementType, out, value, context)

  lines.push(`${doneLabel}:;`)

  return lines
}

function emitArrayCallbackStatementListLines(
  statements: AnyNode[],
  doneLabel: string,
  returnKind: string,
  elementType: string,
  outValue: string,
  currentValue: string,
  context: CFunctionContext
): string[] {
  const out: string[] = []

  for (const statement of statements) {
    appendLines(
      out,
      emitArrayCallbackStatementLines(statement, doneLabel, returnKind, elementType, outValue, currentValue, context)
    )
  }

  return out
}

function emitArrayCallbackStatementLines(
  statement: AnyNode,
  doneLabel: string,
  returnKind: string,
  elementType: string,
  outValue: string,
  currentValue: string,
  context: CFunctionContext
): string[] {
  if (statement == null) {
    return []
  }

  if (statement.type === 'ReturnStatement') {
    const lines = emitArrayCallbackReturnLines(statement.argument, returnKind, elementType, outValue, currentValue, context)

    lines.push(`goto ${doneLabel};`)

    return lines
  }

  if (statement.type === 'BlockStatement') {
    const lines: string[] = []

    lines.push('{')
    appendPrefixedLines(
      lines,
      emitArrayCallbackStatementListLines(statement.body, doneLabel, returnKind, elementType, outValue, currentValue, context),
      '  '
    )
    lines.push('}')

    return lines
  }

  if (statement.type !== 'IfStatement') {
    return []
  }

  const condition = arrayDeps(context).emitPreparedNumberExpression(statement.condition, context)
  const consequent = emitArrayCallbackStatementLines(
    statement.consequent,
    doneLabel,
    returnKind,
    elementType,
    outValue,
    currentValue,
    context
  )
  const lines: string[] = []

  appendLines(lines, condition.lines)
  lines.push(`if ${emitCConditionClause(condition.expression)} {`)
  appendPrefixedLines(lines, consequent, '  ')
  lines.push('}')

  if (statement.alternate != null) {
    lines[lines.length - 1] = '} else {'
    appendPrefixedLines(
      lines,
      emitArrayCallbackStatementLines(
        statement.alternate,
        doneLabel,
        returnKind,
        elementType,
        outValue,
        currentValue,
        context
      ),
      '  '
    )
    lines.push('}')
  }

  return lines
}

function emitArrayCallbackReturnLines(
  expression: AnyNode,
  returnKind: string,
  elementType: string,
  out: string,
  value: string,
  context: CFunctionContext
): string[] {
  if (returnKind === 'map') {
    return emitArrayMapReturnLines(expression, elementType, out, context)
  }

  return emitArrayFilterReturnLines(expression, out, value, context)
}

function emitArrayMapReturnLines(
  expression: AnyNode,
  elementType: string,
  out: string,
  context: CFunctionContext
): string[] {
  const mappedValue = emitPreparedArrayMapValue(expression, elementType, context)
  const lines: string[] = []

  appendLines(lines, mappedValue.lines)
  lines.push(emitStatusCheck(`ccjs_array_push(${out}, ${mappedValue.expression})`, context))

  return lines
}

function emitArrayFilterReturnLines(expression: AnyNode, out: string, value: string, context: CFunctionContext): string[] {
  const predicate = arrayDeps(context).emitPreparedNumberExpression(expression, context)

  const pushStatus = emitStatusCheck(`ccjs_array_push(${out}, ${value})`, context)
  const lines: string[] = []

  appendLines(lines, predicate.lines)
  lines.push(`if ${emitCConditionClause(predicate.expression)} {`)
  lines.push(`  ${pushStatus}`)
  lines.push('}')

  return lines
}

function emitPreparedArrayCallbackInput(
  callback: AnyNode,
  receiver: PreparedArrayReceiver,
  value: string,
  index: string,
  context: CFunctionContext
): string[] {
  const lines: string[] = []
  const valueParam = callback.params[0]
  const indexParam = callback.params[1]

  if (valueParam != null) {
    context.variables.set(valueParam.name, receiver.elementType)

    if (receiver.elementType === 'string') {
      context.runtimeStrings.add(valueParam.name)
      lines.push(emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_STRING || ${value}.as.ref == 0`, context))
      lines.push(`ccjs_string* ${valueParam.name} = (ccjs_string*)${value}.as.ref;`)
    } else if (receiver.elementType === 'boolean') {
      lines.push(emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_BOOL`, context))
      lines.push(`double ${valueParam.name} = (${value}.as.boolean ? 1 : 0);`)
    } else {
      lines.push(emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_NUMBER`, context))
      lines.push(`double ${valueParam.name} = ${value}.as.number;`)
    }
  }

  if (indexParam != null) {
    context.variables.set(indexParam.name, 'number')
    lines.push(`double ${indexParam.name} = (double)${index};`)
  }

  return lines
}

function updatePushedArrayMetadata(receiver: AnyNode, valueType: string, context: CFunctionContext): void {
  if (receiver == null || receiver.type !== 'Reference' || receiver.path.length !== 1 || valueType === 'unknown') {
    return
  }

  const name = receiver.path[0]
  const elements = context.arrayShapes.get(name)

  if (elements == null) {
    if (context.variables.get(name) === 'array') {
      const existingElementType = context.runtimeArrayElementTypes.get(name)

      if (existingElementType == null) {
        context.runtimeArrayElementTypes.set(name, valueType)
      } else {
        context.runtimeArrayElementTypes.set(name, existingElementType)
      }
    }

    return
  }

  const nextElements: CArrayElementInfo[] = []

  for (const element of elements) {
    nextElements.push(element)
  }

  nextElements.push({
    valueType
  })
  const elementType = resolveForOfElementType(nextElements)

  if (elementType === 'unknown') {
    context.arrayShapes.delete(name)
    context.runtimeArrayElementTypes.set(name, 'unknown')
    return
  }

  context.arrayShapes.set(name, nextElements)
}

function updatePoppedArrayMetadata(receiver: AnyNode, context: CFunctionContext): void {
  if (receiver == null || receiver.type !== 'Reference' || receiver.path.length !== 1) {
    return
  }

  const name = receiver.path[0]
  const elements = context.arrayShapes.get(name)

  if (elements == null) {
    return
  }

  context.arrayShapes.set(name, elements.slice(0, -1))
}

function emitPreparedArrayMapValue(expression: AnyNode, valueType: string, context: CFunctionContext): PreparedExpression {
  return emitPreparedArrayElementValue(expression, valueType, context)
}

function emitPreparedArrayElementValue(
  expression: AnyNode,
  valueType: string,
  context: CFunctionContext
): PreparedExpression {
  if (valueType !== 'number' && valueType !== 'boolean') {
    return arrayDeps(context).emitCValueExpression(expression, context)
  }

  const value = arrayDeps(context).emitPreparedNumberExpression(expression, context)
  let valueExpression = `ccjs_number_value(${value.expression})`

  if (valueType === 'boolean') {
    valueExpression = `ccjs_bool_value((${value.expression}) != 0)`
  }

  return {
    lines: value.lines,
    expression: valueExpression
  }
}

function emitPreparedArraySortComparatorInput(
  callback: AnyNode,
  receiver: PreparedArrayReceiver,
  left: string,
  right: string,
  context: CFunctionContext
): string[] {
  const lines: string[] = []
  const leftParam = callback.params[0]
  const rightParam = callback.params[1]

  if (leftParam != null) {
    appendLines(lines, emitPreparedArraySortComparatorParam(leftParam.name, receiver.elementType, left, context))
  }

  if (rightParam != null) {
    appendLines(lines, emitPreparedArraySortComparatorParam(rightParam.name, receiver.elementType, right, context))
  }

  return lines
}

function emitPreparedArraySortComparatorParam(
  name: string,
  elementType: string,
  value: string,
  context: CFunctionContext
): string[] {
  context.variables.set(name, elementType)

  if (elementType === 'string') {
    context.runtimeStrings.add(name)
    return [
      emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_STRING || ${value}.as.ref == 0`, context),
      `ccjs_string* ${name} = (ccjs_string*)${value}.as.ref;`
    ]
  }

  if (elementType === 'boolean') {
    return [
      emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_BOOL`, context),
      `double ${name} = (${value}.as.boolean ? 1 : 0);`
    ]
  }

  return [emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_NUMBER`, context), `double ${name} = ${value}.as.number;`]
}

function emitPreparedArrayReceiver(expression: AnyNode, context: CFunctionContext): PreparedArrayReceiver | null {
  if (expression != null && expression.type === 'ArrayLiteral') {
    const value = arrayDeps(context).emitCArrayLiteralValueExpression(expression, context)
    const elements: CArrayElementInfo[] = []

    for (const element of expression.elements) {
      elements.push({
        valueType: arrayDeps(context).inferExpressionType(element, context)
      })
    }

    return {
      lines: value.lines,
      expression: value.expression,
      elementType: resolveForOfElementType(elements)
    }
  }

  if (expression != null && expression.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]

    if (context.variables.get(name) !== 'array') {
      return null
    }

    let elementType = context.runtimeArrayElementTypes.get(name)

    if (elementType == null) {
      const shape = context.arrayShapes.get(name)

      if (shape == null) {
        elementType = resolveForOfElementType([])
      } else {
        elementType = resolveForOfElementType(shape)
      }
    }

    return {
      lines: [],
      expression: name,
      elementType
    }
  }

  if (
    expression != null &&
    (expression.type === 'MemberExpression' || expression.type === 'IndexExpression')
  ) {
    const valueType = arrayDeps(context).inferExpressionType(expression, context)

    if (valueType !== 'array') {
      return null
    }

    const value = arrayDeps(context).emitCValueExpression(expression, context)

    return {
      lines: value.lines,
      expression: value.expression,
      elementType: resolvePreparedArrayReceiverElementType(expression, context)
    }
  }

  if (expression != null && expression.type === 'CallExpression') {
    const valueType = arrayDeps(context).inferExpressionType(expression, context)

    if (valueType !== 'array') {
      return null
    }

    let call = emitPreparedArrayMapCallExpression(expression, context)

    if (call == null) {
      call = emitPreparedArrayFilterCallExpression(expression, context)
    }

    if (call == null) {
      call = emitPreparedArraySortCallExpression(expression, context)
    }

    if (call == null) {
      call = arrayDeps(context).emitCStringSplitValueExpression(expression, context)
    }

    if (call == null) {
      return null
    }

    return {
      lines: call.lines,
      expression: call.expression,
      elementType: call.elementType
    }
  }

  return null
}

function resolvePreparedArrayReceiverElementType(expression: AnyNode, context: CFunctionContext): string {
  const runtimeElementType = resolveRuntimeArrayElementType(expression, context)

  if (runtimeElementType != null) {
    return runtimeElementType
  }

  if (expression.arrayElementType != null) {
    return expression.arrayElementType
  }

  return 'unknown'
}
