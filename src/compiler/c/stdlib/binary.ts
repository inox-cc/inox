import {
  binaryConstructorNameFromPath,
  binaryInstanceRuntimeMethodName,
  binaryRuntimeReturnType,
  binaryStaticRuntimeMethodNameFromPath
} from '../../stdlib/descriptors/binary.ts'
import { diagnostic } from '../../diagnostics.ts'
import { emitPrepareOwnedValueWrite, emitStatusCheck, nextCName, registerOwnedValue } from '../context.ts'
import { emitRuntimeValueCheck } from '../runtime-values.ts'
import { emitSliceIndexNormalizationLines } from '../values/slices.ts'

type PreparedExpression = {
  lines: string[]
  expression: string
}

type PreparedStatement = {
  lines: string[]
}

type PreparedStringBytesOperand = {
  lines: string[]
  bytes: string
  length: string
}

export type BinaryLoweringDependencies = {
  emitCValueExpression: (expression: any, context: any) => PreparedExpression
  emitPreparedNumberExpression: (expression: any, context: any) => PreparedExpression
  emitPreparedStringBytesOperand: (
    expression: any,
    context: any,
    tempPrefix?: string
  ) => PreparedStringBytesOperand
  inferExpressionType: (expression: any, context: any) => string
}

export function binaryRuntimeMethodName(callee: any): string | null {
  if (callee?.type !== 'MemberExpression') {
    return null
  }

  if (callee.object?.type === 'Reference' && callee.object.path.length === 1 && callee.object.path[0] === 'Buffer') {
    return binaryStaticRuntimeMethodNameFromPath([callee.object.path[0], callee.property])
  }

  return binaryInstanceRuntimeMethodName(callee.property)
}

export function isBinaryRuntimeCall(expression: any): boolean {
  return expression?.type === 'CallExpression' && typeof expression.binaryRuntimeMethod === 'string'
}

export function isBufferFromCall(expression: any): boolean {
  return isBinaryRuntimeCall(expression) && expression.binaryRuntimeMethod === 'from'
}

export function isBufferAllocCall(expression: any): boolean {
  return isBinaryRuntimeCall(expression) && expression.binaryRuntimeMethod === 'alloc'
}

export function isBinaryConstructorExpression(expression: any): boolean {
  return (
    expression?.type === 'NewExpression' &&
    expression.callee.type === 'Reference' &&
    binaryConstructorNameFromPath(expression.callee.path) != null &&
    expression.valueType === 'bytes'
  )
}

export function binaryRuntimeExpressionReturnType(expression: any): 'bytes' | 'string' | null {
  return typeof expression?.binaryRuntimeMethod === 'string'
    ? binaryRuntimeReturnType(expression.binaryRuntimeMethod)
    : null
}

export function emitPreparedBinaryValueExpression(
  expression: any,
  context: any,
  dependencies: BinaryLoweringDependencies
): PreparedExpression | null {
  if (isBufferFromCall(expression)) {
    return emitCBufferFromValueExpression(expression, context, dependencies)
  }

  if (isBufferAllocCall(expression) || isBinaryConstructorExpression(expression)) {
    return emitCBytesAllocValueExpression(expression, context, dependencies)
  }

  if (isBytesSliceCall(expression, context, dependencies)) {
    return emitCBytesSliceValueExpression(expression, context, dependencies)
  }

  if (isBytesToStringCall(expression, context, dependencies)) {
    return emitCBytesToStringValueExpression(expression, context, dependencies)
  }

  return null
}

function emitCBufferFromValueExpression(
  expression: any,
  context: any,
  dependencies: BinaryLoweringDependencies
): PreparedExpression {
  const value = dependencies.emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_buffer_from')
  const temp = nextCName(context, 'ccjs_bytes')
  registerOwnedValue(context, temp)

  return {
    lines: [
      ...value.lines,
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(
        `ccjs_bytes_from_data(&ccjs_default_allocator, (const uint8_t*)${value.bytes}, ${value.length}, &${temp})`,
        context
      ),
      emitRuntimeValueCheck(temp, 'CCJS_TAG_BYTES', context)
    ],
    expression: temp
  }
}

function emitCBytesAllocValueExpression(
  expression: any,
  context: any,
  dependencies: BinaryLoweringDependencies
): PreparedExpression {
  const temp = nextCName(context, 'ccjs_bytes')
  registerOwnedValue(context, temp)

  if (isBinaryConstructorExpression(expression) && expression.args[0]?.type === 'ArrayLiteral') {
    const elements = expression.args[0].elements
    const lines = [
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(`ccjs_bytes_new(&ccjs_default_allocator, ${elements.length}, &${temp})`, context)
    ]

    for (const [index, element] of elements.entries()) {
      const value = dependencies.emitPreparedNumberExpression(element, context)

      lines.push(...value.lines)
      lines.push(emitStatusCheck(`ccjs_bytes_set(${temp}, ${index}, (uint8_t)(${value.expression}))`, context))
    }

    return {
      lines,
      expression: temp
    }
  }

  if (isBinaryConstructorExpression(expression) && dependencies.inferExpressionType(expression.args[0], context) !== 'number') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_JS_GLOBAL',
        'Uint8Array constructor currently supports only length or array literals in C',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: 'ccjs_undefined_value()'
    }
  }

  const size = dependencies.emitPreparedNumberExpression(expression.args[0], context)

  return {
    lines: [
      ...size.lines,
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(`ccjs_bytes_new(&ccjs_default_allocator, (size_t)(${size.expression}), &${temp})`, context)
    ],
    expression: temp
  }
}

function emitCBytesSliceValueExpression(
  expression: any,
  context: any,
  dependencies: BinaryLoweringDependencies
): PreparedExpression {
  const receiver = dependencies.emitCValueExpression(expression.callee.object, context)
  const start = dependencies.emitPreparedNumberExpression(expression.args[0], context)
  const end = expression.args[1] == null ? null : dependencies.emitPreparedNumberExpression(expression.args[1], context)
  const lengthName = nextCName(context, 'ccjs_bytes_len')
  const startRaw = nextCName(context, 'ccjs_bytes_start_raw')
  const startIndex = nextCName(context, 'ccjs_bytes_start')
  const endRaw = nextCName(context, 'ccjs_bytes_end_raw')
  const endIndex = nextCName(context, 'ccjs_bytes_end')
  const temp = nextCName(context, 'ccjs_bytes_slice')
  registerOwnedValue(context, temp)

  return {
    lines: [
      ...receiver.lines,
      ...start.lines,
      ...(end == null ? [] : end.lines),
      `size_t ${lengthName} = 0;`,
      emitStatusCheck(`ccjs_bytes_len(${receiver.expression}, &${lengthName})`, context),
      `double ${startRaw} = ${start.expression};`,
      `double ${endRaw} = ${end == null ? `((double)${lengthName})` : end.expression};`,
      ...emitSliceIndexNormalizationLines(startRaw, lengthName, startIndex, context, 'ccjs_bytes_start'),
      ...emitSliceIndexNormalizationLines(endRaw, lengthName, endIndex, context, 'ccjs_bytes_end'),
      `if (${endIndex} < ${startIndex}) ${endIndex} = ${startIndex};`,
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(`ccjs_bytes_slice(${receiver.expression}, ${startIndex}, ${endIndex}, &${temp})`, context),
      emitRuntimeValueCheck(temp, 'CCJS_TAG_BYTES', context)
    ],
    expression: temp
  }
}

function emitCBytesToStringValueExpression(
  expression: any,
  context: any,
  dependencies: BinaryLoweringDependencies
): PreparedExpression {
  const receiver = dependencies.emitCValueExpression(expression.callee.object, context)
  const temp = nextCName(context, 'ccjs_bytes_string')
  registerOwnedValue(context, temp)

  return {
    lines: [
      ...receiver.lines,
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(`ccjs_bytes_to_string(&ccjs_default_allocator, ${receiver.expression}, &${temp})`, context),
      emitRuntimeValueCheck(temp, 'CCJS_TAG_STRING', context)
    ],
    expression: temp
  }
}

export function emitPreparedBinaryNumberCallExpression(
  expression: any,
  context: any,
  dependencies: BinaryLoweringDependencies
): PreparedExpression | null {
  if (expression?.type === 'CallExpression' && expression.binaryRuntimeMethod === 'isBuffer') {
    const value = dependencies.emitCValueExpression(expression.args[0], context)

    return {
      lines: value.lines,
      expression: `(${value.expression}.tag == CCJS_TAG_BYTES ? 1 : 0)`
    }
  }

  return null
}

export function emitPreparedBytesLengthExpression(
  expression: any,
  context: any,
  dependencies: BinaryLoweringDependencies
): PreparedExpression | null {
  if (
    expression?.type !== 'MemberExpression' ||
    expression.property !== 'length' ||
    dependencies.inferExpressionType(expression.object, context) !== 'bytes'
  ) {
    return null
  }

  const value = dependencies.emitCValueExpression(expression.object, context)
  const temp = nextCName(context, 'ccjs_bytes_len')

  return {
    lines: [
      ...value.lines,
      `size_t ${temp} = 0;`,
      emitStatusCheck(`ccjs_bytes_len(${value.expression}, &${temp})`, context)
    ],
    expression: `((double)${temp})`
  }
}

export function emitPreparedBytesIndexExpression(
  expression: any,
  context: any,
  dependencies: BinaryLoweringDependencies
): PreparedExpression | null {
  if (expression?.type !== 'IndexExpression' || dependencies.inferExpressionType(expression.object, context) !== 'bytes') {
    return null
  }

  const value = dependencies.emitCValueExpression(expression.object, context)
  const index = dependencies.emitPreparedNumberExpression(expression.index, context)
  const byte = nextCName(context, 'ccjs_byte')

  return {
    lines: [
      ...value.lines,
      ...index.lines,
      `uint8_t ${byte} = 0;`,
      emitStatusCheck(`ccjs_bytes_get(${value.expression}, (size_t)(${index.expression}), &${byte})`, context)
    ],
    expression: `((double)${byte})`
  }
}

export function emitPreparedBytesIndexAssignment(
  expression: any,
  context: any,
  dependencies: BinaryLoweringDependencies
): PreparedStatement | null {
  if (
    expression?.target?.type !== 'IndexExpression' ||
    dependencies.inferExpressionType(expression.target.object, context) !== 'bytes'
  ) {
    return null
  }

  const value = dependencies.emitCValueExpression(expression.target.object, context)
  const index = dependencies.emitPreparedNumberExpression(expression.target.index, context)
  const byte = dependencies.emitPreparedNumberExpression(expression.value, context)

  return {
    lines: [
      ...value.lines,
      ...index.lines,
      ...byte.lines,
      emitStatusCheck(
        `ccjs_bytes_set(${value.expression}, (size_t)(${index.expression}), (uint8_t)(${byte.expression}))`,
        context
      )
    ]
  }
}

export function isBytesSliceCall(
  expression: any,
  context: any,
  dependencies: BinaryLoweringDependencies
): boolean {
  return (
    isBinaryRuntimeCall(expression) &&
    expression.binaryRuntimeMethod === 'slice' &&
    dependencies.inferExpressionType(expression.callee.object, context) === 'bytes'
  )
}

export function isBytesToStringCall(
  expression: any,
  context: any,
  dependencies: BinaryLoweringDependencies
): boolean {
  return (
    isBinaryRuntimeCall(expression) &&
    expression.binaryRuntimeMethod === 'toString' &&
    dependencies.inferExpressionType(expression.callee.object, context) === 'bytes'
  )
}
