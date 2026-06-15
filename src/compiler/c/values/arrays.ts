import {
  emitPrepareOwnedValueWrite,
  emitRuntimeTypeCheck,
  emitStatusCheck,
  nextCName,
  registerOwnedValue,
  withVariableScope
} from '../context.ts'
import { arrayRuntimeMethodName } from '../../stdlib/descriptors/collections.ts'
import { emitCConditionClause } from './expressions.ts'
import { emitRuntimeFieldValueCheck } from '../runtime-values.ts'
import type { CPreparedExpression as PreparedExpression } from '../types.ts'


export type ArrayLoweringDependencies = {
  emitCArrayLiteralValueExpression: (expression: any, context: any) => PreparedExpression
  emitCStringSplitValueExpression: (expression: any, context: any) => PreparedExpression | null
  emitCValueExpression: (expression: any, context: any) => PreparedExpression
  emitPreparedNumberExpression: (expression: any, context: any) => PreparedExpression
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

export function emitPreparedKnownArrayIndexValueExpression(expression, context) {
  const element = resolveKnownArrayIndex(expression, context)

  if (element?.valueType !== 'array' && element?.valueType !== 'string') {
    return null
  }

  const temp = nextCName(context, 'ccjs_value')
  const tag = element.valueType === 'array' ? 'CCJS_TAG_ARRAY' : 'CCJS_TAG_STRING'
  registerOwnedValue(context, temp)

  return {
    lines: [
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(`ccjs_array_get(${element.arrayName}, ${element.index}, &${temp})`, context),
      ...emitRuntimeFieldValueCheck(temp, tag, expression, context)
    ],
    expression: temp
  }
}

export function emitPreparedRuntimeArrayIndexValueExpression(expression, context) {
  const runtimeElement = resolveRuntimeArrayIndex(expression, context)

  if (runtimeElement == null || !['boolean', 'number', 'string'].includes(runtimeElement.valueType)) {
    return null
  }

  const value = emitPreparedRuntimeArrayIndexValue(expression, runtimeElement, context, 'ccjs_value')

  return runtimeElement.valueType === 'string'
    ? {
        lines: [
          ...value.lines,
          ...emitRuntimeFieldValueCheck(value.expression, 'CCJS_TAG_STRING', expression, context)
        ],
        expression: value.expression
      }
    : value
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

export function emitArraySortVariableDeclaration(statement, sorted, context) {
  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'array')

  const shape = context.arrayShapes.get(sorted.expression)

  if (shape != null) {
    context.arrayShapes.set(
      statement.name,
      shape.map((element) => ({ ...element }))
    )
  } else {
    context.runtimeArrayElementTypes.set(statement.name, statement.arrayElementType ?? sorted.elementType ?? 'unknown')
  }

  return [
    ...sorted.lines,
    ...emitPrepareOwnedValueWrite(statement.name),
    `${statement.name} = ${sorted.expression};`,
    `ccjs_retain(${statement.name});`
  ]
}

export function emitArrayFilterVariableDeclaration(statement, filtered, context) {
  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'array')
  context.runtimeArrayElementTypes.set(statement.name, statement.arrayElementType ?? filtered.elementType ?? 'unknown')

  return [
    ...filtered.lines,
    ...emitPrepareOwnedValueWrite(statement.name),
    `${statement.name} = ${filtered.expression};`,
    `ccjs_retain(${statement.name});`
  ]
}

export function emitArrayMapVariableDeclaration(statement, mapped, context) {
  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'array')
  context.runtimeArrayElementTypes.set(statement.name, statement.arrayElementType ?? mapped.elementType ?? 'unknown')

  return [
    ...mapped.lines,
    ...emitPrepareOwnedValueWrite(statement.name),
    `${statement.name} = ${mapped.expression};`,
    `ccjs_retain(${statement.name});`
  ]
}

export function emitPreparedArraySortCallExpression(expression, context) {
  if (
    expression?.type !== 'CallExpression' ||
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

  return {
    lines: [...receiver.lines, emitStatusCheck(`ccjs_array_sort(${receiver.expression})`, context)],
    expression: receiver.expression,
    elementType: receiver.elementType
  }
}

export function emitPreparedArrayPushCallExpression(expression, context) {
  if (
    expression?.type !== 'CallExpression' ||
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

  const value = arrayDeps(context).emitCValueExpression(expression.args[0], context)

  updatePushedArrayMetadata(expression.callee.object, arrayDeps(context).inferExpressionType(expression.args[0], context), context)

  return {
    lines: [
      ...receiver.lines,
      ...value.lines,
      emitStatusCheck(`ccjs_array_push(${receiver.expression}, ${value.expression})`, context)
    ],
    expression: '',
    elementType: receiver.elementType
  }
}

export function emitPreparedArrayPopCallExpression(expression, context, options: { discard?: boolean } = {}) {
  if (
    expression?.type !== 'CallExpression' ||
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

  const lines = [
    ...receiver.lines,
    ...emitPrepareOwnedValueWrite(value),
    emitStatusCheck(`ccjs_array_pop(${receiver.expression}, &${value})`, context)
  ]

  if (options.discard === true) {
    lines.push(`ccjs_release(${value});`)
    lines.push(`${value} = ccjs_undefined_value();`)
  }

  return {
    lines,
    expression: value,
    elementType: receiver.elementType
  }
}

function emitPreparedArrayComparatorSortCallExpression(expression, receiver, context) {
  const callback = expression.args[0]
  const returnExpression = resolveArrowReturnExpression(callback)

  if (
    callback?.type !== 'ArrowFunctionExpression' ||
    returnExpression == null ||
    callback.params.length > 2 ||
    !['number', 'boolean', 'string'].includes(receiver.elementType)
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

  const body = withVariableScope(context, () => {
    const input = emitPreparedArraySortComparatorInput(callback, receiver, left, right, context)
    const result = arrayDeps(context).emitPreparedNumberExpression(returnExpression, context)

    return [
      ...input,
      ...result.lines,
      `double ${compare} = ${result.expression};`,
      `if (!(${compare} > 0)) break;`,
      emitStatusCheck(`ccjs_array_set(${receiver.expression}, ${scan} - 1, ${right})`, context),
      emitStatusCheck(`ccjs_array_set(${receiver.expression}, ${scan}, ${left})`, context)
    ]
  })

  return {
    lines: [
      ...receiver.lines,
      `size_t ${length} = 0;`,
      emitStatusCheck(`ccjs_array_len(${receiver.expression}, &${length})`, context),
      `for (size_t ${index} = 1; ${index} < ${length}; ${index} += 1) {`,
      `  for (size_t ${scan} = ${index}; ${scan} > 0; ${scan} -= 1) {`,
      ...emitPrepareOwnedValueWrite(left).map((line) => `    ${line}`),
      `    ${emitStatusCheck(`ccjs_array_get(${receiver.expression}, ${scan} - 1, &${left})`, context)}`,
      ...emitPrepareOwnedValueWrite(right).map((line) => `    ${line}`),
      `    ${emitStatusCheck(`ccjs_array_get(${receiver.expression}, ${scan}, &${right})`, context)}`,
      ...body.map((line) => `    ${line}`),
      '  }',
      '}',
      ...emitPrepareOwnedValueWrite(right),
      ...emitPrepareOwnedValueWrite(left)
    ],
    expression: receiver.expression,
    elementType: receiver.elementType
  }
}

export function emitPreparedArrayMapCallExpression(expression, context) {
  if (
    expression?.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.property !== 'map' ||
    expression.args.length !== 1
  ) {
    return null
  }

  const callback = expression.args[0]
  const callbackBody = resolveArrayCallbackBody(callback)

  if (callback?.type !== 'ArrowFunctionExpression' || callbackBody == null || callback.params.length > 2) {
    return null
  }

  const receiver = emitPreparedArrayReceiver(expression.callee.object, context)

  if (receiver == null || !['number', 'boolean', 'string'].includes(receiver.elementType)) {
    return null
  }

  const out = nextCName(context, 'ccjs_map_array')
  const length = nextCName(context, 'ccjs_map_length')
  const index = nextCName(context, 'ccjs_map_index')
  const value = nextCName(context, 'ccjs_map_value')
  let mappedElementType = expression.arrayElementType ?? 'unknown'

  registerOwnedValue(context, out)
  registerOwnedValue(context, value)

  const body = withVariableScope(context, () => {
    const input = emitPreparedArrayCallbackInput(callback, receiver, value, index, context)

    mappedElementType =
      mappedElementType === 'unknown' ? resolveArrayCallbackReturnType(callbackBody, context) : mappedElementType

    if (!['number', 'boolean', 'string'].includes(mappedElementType)) {
      return null
    }

    return [...input, ...emitArrayMapCallbackBodyLines(callbackBody, mappedElementType, out, context)]
  })

  if (body == null) {
    return null
  }

  return {
    lines: [
      ...receiver.lines,
      ...emitPrepareOwnedValueWrite(out),
      emitStatusCheck(`ccjs_array_new(&ccjs_default_allocator, 0, &${out})`, context),
      `size_t ${length} = 0;`,
      emitStatusCheck(`ccjs_array_len(${receiver.expression}, &${length})`, context),
      `for (size_t ${index} = 0; ${index} < ${length}; ${index} += 1) {`,
      ...emitPrepareOwnedValueWrite(value).map((line) => `  ${line}`),
      `  ${emitStatusCheck(`ccjs_array_get(${receiver.expression}, ${index}, &${value})`, context)}`,
      ...body.map((line) => `  ${line}`),
      '}',
      ...emitPrepareOwnedValueWrite(value)
    ],
    expression: out,
    elementType: mappedElementType
  }
}

export function emitPreparedArrayFilterCallExpression(expression, context) {
  if (
    expression?.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.property !== 'filter' ||
    expression.args.length !== 1
  ) {
    return null
  }

  const callback = expression.args[0]
  const callbackBody = resolveArrayCallbackBody(callback)

  if (callback?.type !== 'ArrowFunctionExpression' || callbackBody == null || callback.params.length > 2) {
    return null
  }

  const receiver = emitPreparedArrayReceiver(expression.callee.object, context)

  if (receiver == null || !['number', 'boolean', 'string'].includes(receiver.elementType)) {
    return null
  }

  const out = nextCName(context, 'ccjs_filter_array')
  const length = nextCName(context, 'ccjs_filter_length')
  const index = nextCName(context, 'ccjs_filter_index')
  const value = nextCName(context, 'ccjs_filter_value')

  registerOwnedValue(context, out)
  registerOwnedValue(context, value)

  const body = withVariableScope(context, () => {
    const input = emitPreparedArrayCallbackInput(callback, receiver, value, index, context)

    return [...input, ...emitArrayFilterCallbackBodyLines(callbackBody, out, value, context)]
  })

  return {
    lines: [
      ...receiver.lines,
      ...emitPrepareOwnedValueWrite(out),
      emitStatusCheck(`ccjs_array_new(&ccjs_default_allocator, 0, &${out})`, context),
      `size_t ${length} = 0;`,
      emitStatusCheck(`ccjs_array_len(${receiver.expression}, &${length})`, context),
      `for (size_t ${index} = 0; ${index} < ${length}; ${index} += 1) {`,
      ...emitPrepareOwnedValueWrite(value).map((line) => `  ${line}`),
      `  ${emitStatusCheck(`ccjs_array_get(${receiver.expression}, ${index}, &${value})`, context)}`,
      ...body.map((line) => `  ${line}`),
      '}',
      ...emitPrepareOwnedValueWrite(value)
    ],
    expression: out,
    elementType: receiver.elementType
  }
}

function resolveArrowReturnExpression(callback) {
  if (callback?.type !== 'ArrowFunctionExpression') {
    return null
  }

  if (callback.expressionBody) {
    return callback.body
  }

  const statements = Array.isArray(callback.body)
    ? callback.body
    : callback.body?.type === 'BlockStatement'
      ? callback.body.body
      : null

  if (statements == null || statements.length !== 1) {
    return null
  }

  const statement = statements[0]

  return statement?.type === 'ReturnStatement' ? (statement.argument ?? null) : null
}

function resolveArrayCallbackBody(callback) {
  const returnExpression = resolveArrowReturnExpression(callback)

  if (returnExpression != null) {
    return {
      kind: 'prepared-return',
      returnExpression
    }
  }

  if (callback?.type !== 'ArrowFunctionExpression' || callback.expressionBody) {
    return null
  }

  const statements = Array.isArray(callback.body)
    ? callback.body
    : callback.body?.type === 'BlockStatement'
      ? callback.body.body
      : null

  if (!canLowerArrayCallbackStatementList(statements)) {
    return null
  }

  return {
    kind: 'statement-list',
    statements
  }
}

function canLowerArrayCallbackStatementList(statements) {
  if (statements == null || statements.length === 0) {
    return false
  }

  return statements.every((statement, index) => {
    if (index === statements.length - 1) {
      return canLowerArrayCallbackTerminalStatement(statement)
    }

    return canLowerArrayCallbackEarlyReturnStatement(statement)
  })
}

function canLowerArrayCallbackTerminalStatement(statement) {
  if (statement?.type === 'ReturnStatement') {
    return statement.argument != null
  }

  if (statement?.type === 'BlockStatement') {
    return canLowerArrayCallbackStatementList(statement.body)
  }

  if (statement?.type !== 'IfStatement' || statement.alternate == null) {
    return false
  }

  return (
    canLowerArrayCallbackTerminalStatement(statement.consequent) &&
    canLowerArrayCallbackTerminalStatement(statement.alternate)
  )
}

function canLowerArrayCallbackReturnStatement(statement) {
  if (statement?.type === 'ReturnStatement') {
    return statement.argument != null
  }

  return false
}

function canLowerArrayCallbackEarlyReturnStatement(statement) {
  if (statement?.type === 'BlockStatement') {
    return canLowerArrayCallbackStatementList(statement.body)
  }

  if (statement?.type !== 'IfStatement') {
    return false
  }

  return (
    canLowerArrayCallbackBranch(statement.consequent) &&
    (statement.alternate == null || canLowerArrayCallbackBranch(statement.alternate))
  )
}

function canLowerArrayCallbackBranch(statement) {
  if (canLowerArrayCallbackReturnStatement(statement)) {
    return true
  }

  if (statement?.type === 'BlockStatement') {
    return canLowerArrayCallbackStatementList(statement.body)
  }

  return canLowerArrayCallbackEarlyReturnStatement(statement)
}

function resolveArrayCallbackReturnType(body, context) {
  const expressions = collectArrayCallbackReturnExpressions(body)
  const firstType = expressions.length === 0 ? 'unknown' : arrayDeps(context).inferExpressionType(expressions[0], context)

  if (firstType === 'unknown') {
    return 'unknown'
  }

  return expressions.every((expression) => arrayDeps(context).inferExpressionType(expression, context) === firstType)
    ? firstType
    : 'unknown'
}

function collectArrayCallbackReturnExpressions(body) {
  if (body.kind === 'prepared-return') {
    return [body.returnExpression]
  }

  const expressions: any[] = []
  const visitStatement = (statement) => {
    if (statement == null) {
      return
    }

    if (statement.type === 'ReturnStatement') {
      expressions.push(statement.argument)
      return
    }

    if (statement.type === 'BlockStatement') {
      statement.body.forEach(visitStatement)
      return
    }

    if (statement.type === 'IfStatement') {
      visitStatement(statement.consequent)
      visitStatement(statement.alternate)
    }
  }

  body.statements.forEach(visitStatement)

  return expressions.filter(Boolean)
}

function emitArrayMapCallbackBodyLines(body, elementType, out, context) {
  const emitReturn = (expression) => emitArrayMapReturnLines(expression, elementType, out, context)

  return emitArrayCallbackBodyLines(body, emitReturn, context)
}

function emitArrayFilterCallbackBodyLines(body, out, value, context) {
  const emitReturn = (expression) => emitArrayFilterReturnLines(expression, out, value, context)

  return emitArrayCallbackBodyLines(body, emitReturn, context)
}

function emitArrayCallbackBodyLines(body, emitReturn, context) {
  if (body.kind === 'prepared-return') {
    return emitReturn(body.returnExpression)
  }

  const doneLabel = nextCName(context, 'ccjs_array_callback_done')

  return [...emitArrayCallbackStatementListLines(body.statements, doneLabel, emitReturn, context), `${doneLabel}:;`]
}

function emitArrayCallbackStatementListLines(statements, doneLabel, emitReturn, context) {
  return statements.flatMap((statement) => emitArrayCallbackStatementLines(statement, doneLabel, emitReturn, context))
}

function emitArrayCallbackStatementLines(statement, doneLabel, emitReturn, context) {
  if (statement?.type === 'ReturnStatement') {
    return [...emitReturn(statement.argument), `goto ${doneLabel};`]
  }

  if (statement?.type === 'BlockStatement') {
    return [
      '{',
      ...emitArrayCallbackStatementListLines(statement.body, doneLabel, emitReturn, context).map((line) => `  ${line}`),
      '}'
    ]
  }

  if (statement?.type !== 'IfStatement') {
    return []
  }

  const condition = arrayDeps(context).emitPreparedNumberExpression(statement.condition, context)
  const consequent = emitArrayCallbackStatementLines(statement.consequent, doneLabel, emitReturn, context)
  const lines = [
    ...condition.lines,
    `if ${emitCConditionClause(condition.expression)} {`,
    ...consequent.map((line) => `  ${line}`),
    '}'
  ]

  if (statement.alternate != null) {
    lines[lines.length - 1] = '} else {'
    lines.push(
      ...emitArrayCallbackStatementLines(statement.alternate, doneLabel, emitReturn, context).map((line) => `  ${line}`)
    )
    lines.push('}')
  }

  return lines
}

function emitArrayMapReturnLines(expression, elementType, out, context) {
  const mappedValue = emitPreparedArrayMapValue(expression, elementType, context)

  return [...mappedValue.lines, emitStatusCheck(`ccjs_array_push(${out}, ${mappedValue.expression})`, context)]
}

function emitArrayFilterReturnLines(expression, out, value, context) {
  const predicate = arrayDeps(context).emitPreparedNumberExpression(expression, context)

  return [
    ...predicate.lines,
    `if ${emitCConditionClause(predicate.expression)} {`,
    `  ${emitStatusCheck(`ccjs_array_push(${out}, ${value})`, context)}`,
    '}'
  ]
}

function emitPreparedArrayCallbackInput(callback, receiver, value, index, context) {
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

function updatePushedArrayMetadata(receiver, valueType, context) {
  if (receiver?.type !== 'Reference' || receiver.path.length !== 1 || valueType === 'unknown') {
    return
  }

  const name = receiver.path[0]
  const elements = context.arrayShapes.get(name)

  if (elements == null) {
    if (context.variables.get(name) === 'array') {
      context.runtimeArrayElementTypes.set(name, context.runtimeArrayElementTypes.get(name) ?? valueType)
    }

    return
  }

  const nextElements = [...elements, { valueType }]
  const elementType = resolveForOfElementType(nextElements)

  if (elementType === 'unknown') {
    context.arrayShapes.delete(name)
    context.runtimeArrayElementTypes.set(name, 'unknown')
    return
  }

  context.arrayShapes.set(name, nextElements)
}

function updatePoppedArrayMetadata(receiver, context) {
  if (receiver?.type !== 'Reference' || receiver.path.length !== 1) {
    return
  }

  const name = receiver.path[0]
  const elements = context.arrayShapes.get(name)

  if (elements == null) {
    return
  }

  context.arrayShapes.set(name, elements.slice(0, -1))
}

function emitPreparedArrayMapValue(expression, valueType, context) {
  if (valueType === 'string') {
    return arrayDeps(context).emitCValueExpression(expression, context)
  }

  const value = arrayDeps(context).emitPreparedNumberExpression(expression, context)

  return {
    lines: value.lines,
    expression:
      valueType === 'boolean' ? `ccjs_bool_value((${value.expression}) != 0)` : `ccjs_number_value(${value.expression})`
  }
}

function emitPreparedArraySortComparatorInput(callback, receiver, left, right, context) {
  const lines: string[] = []
  const leftParam = callback.params[0]
  const rightParam = callback.params[1]

  if (leftParam != null) {
    lines.push(...emitPreparedArraySortComparatorParam(leftParam.name, receiver.elementType, left, context))
  }

  if (rightParam != null) {
    lines.push(...emitPreparedArraySortComparatorParam(rightParam.name, receiver.elementType, right, context))
  }

  return lines
}

function emitPreparedArraySortComparatorParam(name, elementType, value, context) {
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

function emitPreparedArrayReceiver(expression, context) {
  if (expression?.type === 'ArrayLiteral') {
    const value = arrayDeps(context).emitCArrayLiteralValueExpression(expression, context)

    return {
      lines: value.lines,
      expression: value.expression,
      elementType: resolveForOfElementType(
        expression.elements.map((element) => ({
          valueType: arrayDeps(context).inferExpressionType(element, context)
        }))
      )
    }
  }

  if (expression?.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]

    if (context.variables.get(name) !== 'array') {
      return null
    }

    return {
      lines: [],
      expression: name,
      elementType:
        context.runtimeArrayElementTypes.get(name) ?? resolveForOfElementType(context.arrayShapes.get(name) ?? [])
    }
  }

  if (expression?.type === 'MemberExpression' || expression?.type === 'IndexExpression') {
    const valueType = arrayDeps(context).inferExpressionType(expression, context)

    if (valueType !== 'array') {
      return null
    }

    const value = arrayDeps(context).emitCValueExpression(expression, context)

    return {
      lines: value.lines,
      expression: value.expression,
      elementType: resolveRuntimeArrayElementType(expression, context) ?? expression.arrayElementType ?? 'unknown'
    }
  }

  if (expression?.type === 'CallExpression') {
    const valueType = arrayDeps(context).inferExpressionType(expression, context)

    if (valueType !== 'array') {
      return null
    }

    const call =
      emitPreparedArrayMapCallExpression(expression, context) ??
      emitPreparedArrayFilterCallExpression(expression, context) ??
      emitPreparedArraySortCallExpression(expression, context) ??
      arrayDeps(context).emitCStringSplitValueExpression(expression, context)

    return call == null
      ? null
      : {
          lines: call.lines,
          expression: call.expression,
          elementType: call.elementType
        }
  }

  return null
}
