import {
  binaryConstructorNameFromPath,
  binaryInstanceRuntimeMethodName,
  binaryRuntimeReturnType,
  binaryStaticRuntimeMethodNameFromPath
} from '../../stdlib/descriptors/binary.ts'
import { diagnostic } from '../../diagnostics.ts'
import type { AnyNode } from '../../types.ts'
import {
  emitPrepareOwnedValueWrite,
  emitStatusCheck,
  nextCName,
  registerOwnedValue,
  type CFunctionContext
} from '../context.ts'
import { emitRuntimeValueCheck } from '../runtime-values.ts'
import { emitSliceIndexNormalizationLines } from '../values/slices.ts'
import type {
  CPreparedExpression as PreparedExpression,
  CPreparedStatement as PreparedStatement,
  CPreparedStringBytesOperand as PreparedStringBytesOperand
} from '../types.ts'

export type BinaryLoweringDependencies = {
  emitCValueExpression: (expression: AnyNode, context: CFunctionContext) => PreparedExpression
  emitPreparedNumberExpression: (expression: AnyNode, context: CFunctionContext) => PreparedExpression
  emitPreparedStringBytesOperand: (
    expression: AnyNode,
    context: CFunctionContext,
    tempPrefix?: string
  ) => PreparedStringBytesOperand
  inferExpressionType: (expression: AnyNode, context: CFunctionContext) => string
}

const binaryRuntimeCallDescriptors = {
  fromData: { callName: 'ccjs_bytes_from_data', tempPrefix: 'ccjs_bytes', expectedTag: 'CCJS_TAG_BYTES' },
  get: { callName: 'ccjs_bytes_get', tempPrefix: 'ccjs_byte' },
  length: { callName: 'ccjs_bytes_len', tempPrefix: 'ccjs_bytes_len' },
  newBytes: { callName: 'ccjs_bytes_new', tempPrefix: 'ccjs_bytes' },
  set: { callName: 'ccjs_bytes_set' },
  slice: { callName: 'ccjs_bytes_slice', tempPrefix: 'ccjs_bytes_slice', expectedTag: 'CCJS_TAG_BYTES' },
  bytesToString: { callName: 'ccjs_bytes_to_string', tempPrefix: 'ccjs_bytes_string', expectedTag: 'CCJS_TAG_STRING' }
} as const

export function binaryRuntimeMethodName(callee: AnyNode): string | null {
  if (callee?.type !== 'MemberExpression') {
    return null
  }

  if (callee.object?.type === 'Reference' && callee.object.path.length === 1 && callee.object.path[0] === 'Buffer') {
    return binaryStaticRuntimeMethodNameFromPath([callee.object.path[0], callee.property])
  }

  return binaryInstanceRuntimeMethodName(callee.property)
}

export function isBinaryRuntimeCall(expression: AnyNode): boolean {
  return expression?.type === 'CallExpression' && typeof expression.binaryRuntimeMethod === 'string'
}

export function isBufferFromCall(expression: AnyNode): boolean {
  return isBinaryRuntimeCall(expression) && expression.binaryRuntimeMethod === 'from'
}

export function isBufferAllocCall(expression: AnyNode): boolean {
  return isBinaryRuntimeCall(expression) && expression.binaryRuntimeMethod === 'alloc'
}

export function isBinaryConstructorExpression(expression: AnyNode): boolean {
  return (
    expression?.type === 'NewExpression' &&
    expression.callee.type === 'Reference' &&
    binaryConstructorNameFromPath(expression.callee.path) != null &&
    expression.valueType === 'bytes'
  )
}

export function binaryRuntimeExpressionReturnType(expression: AnyNode): 'bytes' | 'string' | null {
  return typeof expression?.binaryRuntimeMethod === 'string'
    ? binaryRuntimeReturnType(expression.binaryRuntimeMethod)
    : null
}

export function emitPreparedBinaryValueExpression(
  expression: AnyNode,
  context: CFunctionContext,
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
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: BinaryLoweringDependencies
): PreparedExpression {
  const descriptor = binaryRuntimeCallDescriptors.fromData
  const value = dependencies.emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_buffer_from')
  const temp = nextCName(context, descriptor.tempPrefix)
  registerOwnedValue(context, temp)

  return {
    lines: [
      ...value.lines,
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(
        `${descriptor.callName}(&ccjs_default_allocator, (const uint8_t*)${value.bytes}, ${value.length}, &${temp})`,
        context
      ),
      emitRuntimeValueCheck(temp, descriptor.expectedTag, context)
    ],
    expression: temp
  }
}

function emitCBytesAllocValueExpression(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: BinaryLoweringDependencies
): PreparedExpression {
  const descriptor = binaryRuntimeCallDescriptors.newBytes
  const temp = nextCName(context, descriptor.tempPrefix)
  registerOwnedValue(context, temp)

  if (isBinaryConstructorExpression(expression) && expression.args[0]?.type === 'ArrayLiteral') {
    const elements = expression.args[0].elements
    const lines = [
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(`${descriptor.callName}(&ccjs_default_allocator, ${elements.length}, &${temp})`, context)
    ]

    for (const [index, element] of elements.entries()) {
      const value = dependencies.emitPreparedNumberExpression(element, context)

      lines.push(...value.lines)
      lines.push(
        emitStatusCheck(
          `${binaryRuntimeCallDescriptors.set.callName}(${temp}, ${index}, (uint8_t)(${value.expression}))`,
          context
        )
      )
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
      emitStatusCheck(
        `${descriptor.callName}(&ccjs_default_allocator, (size_t)(${size.expression}), &${temp})`,
        context
      )
    ],
    expression: temp
  }
}

function emitCBytesSliceValueExpression(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: BinaryLoweringDependencies
): PreparedExpression {
  const descriptor = binaryRuntimeCallDescriptors.slice
  const receiver = dependencies.emitCValueExpression(expression.callee.object, context)
  const start = dependencies.emitPreparedNumberExpression(expression.args[0], context)
  const end = expression.args[1] == null ? null : dependencies.emitPreparedNumberExpression(expression.args[1], context)
  const lengthName = nextCName(context, 'ccjs_bytes_len')
  const startRaw = nextCName(context, 'ccjs_bytes_start_raw')
  const startIndex = nextCName(context, 'ccjs_bytes_start')
  const endRaw = nextCName(context, 'ccjs_bytes_end_raw')
  const endIndex = nextCName(context, 'ccjs_bytes_end')
  const temp = nextCName(context, descriptor.tempPrefix)
  registerOwnedValue(context, temp)

  return {
    lines: [
      ...receiver.lines,
      ...start.lines,
      ...(end == null ? [] : end.lines),
      `size_t ${lengthName} = 0;`,
      emitStatusCheck(`${binaryRuntimeCallDescriptors.length.callName}(${receiver.expression}, &${lengthName})`, context),
      `double ${startRaw} = ${start.expression};`,
      `double ${endRaw} = ${end == null ? `((double)${lengthName})` : end.expression};`,
      ...emitSliceIndexNormalizationLines(startRaw, lengthName, startIndex, context, 'ccjs_bytes_start'),
      ...emitSliceIndexNormalizationLines(endRaw, lengthName, endIndex, context, 'ccjs_bytes_end'),
      `if (${endIndex} < ${startIndex}) ${endIndex} = ${startIndex};`,
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(`${descriptor.callName}(${receiver.expression}, ${startIndex}, ${endIndex}, &${temp})`, context),
      emitRuntimeValueCheck(temp, descriptor.expectedTag, context)
    ],
    expression: temp
  }
}

function emitCBytesToStringValueExpression(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: BinaryLoweringDependencies
): PreparedExpression {
  const descriptor = binaryRuntimeCallDescriptors.bytesToString
  const receiver = dependencies.emitCValueExpression(expression.callee.object, context)
  const temp = nextCName(context, descriptor.tempPrefix)
  registerOwnedValue(context, temp)

  return {
    lines: [
      ...receiver.lines,
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(`${descriptor.callName}(&ccjs_default_allocator, ${receiver.expression}, &${temp})`, context),
      emitRuntimeValueCheck(temp, descriptor.expectedTag, context)
    ],
    expression: temp
  }
}

export function emitPreparedBinaryNumberCallExpression(
  expression: AnyNode,
  context: CFunctionContext,
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
  expression: AnyNode,
  context: CFunctionContext,
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
  const descriptor = binaryRuntimeCallDescriptors.length
  const temp = nextCName(context, descriptor.tempPrefix)

  return {
    lines: [
      ...value.lines,
      `size_t ${temp} = 0;`,
      emitStatusCheck(`${descriptor.callName}(${value.expression}, &${temp})`, context)
    ],
    expression: `((double)${temp})`
  }
}

export function emitPreparedBytesIndexExpression(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: BinaryLoweringDependencies
): PreparedExpression | null {
  if (expression?.type !== 'IndexExpression' || dependencies.inferExpressionType(expression.object, context) !== 'bytes') {
    return null
  }

  const value = dependencies.emitCValueExpression(expression.object, context)
  const index = dependencies.emitPreparedNumberExpression(expression.index, context)
  const descriptor = binaryRuntimeCallDescriptors.get
  const byte = nextCName(context, descriptor.tempPrefix)

  return {
    lines: [
      ...value.lines,
      ...index.lines,
      `uint8_t ${byte} = 0;`,
      emitStatusCheck(`${descriptor.callName}(${value.expression}, (size_t)(${index.expression}), &${byte})`, context)
    ],
    expression: `((double)${byte})`
  }
}

export function emitPreparedBytesIndexAssignment(
  expression: AnyNode,
  context: CFunctionContext,
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
  const descriptor = binaryRuntimeCallDescriptors.set

  return {
    lines: [
      ...value.lines,
      ...index.lines,
      ...byte.lines,
      emitStatusCheck(
        `${descriptor.callName}(${value.expression}, (size_t)(${index.expression}), (uint8_t)(${byte.expression}))`,
        context
      )
    ]
  }
}

export function isBytesSliceCall(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: BinaryLoweringDependencies
): boolean {
  return (
    isBinaryRuntimeCall(expression) &&
    expression.binaryRuntimeMethod === 'slice' &&
    dependencies.inferExpressionType(expression.callee.object, context) === 'bytes'
  )
}

export function isBytesToStringCall(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: BinaryLoweringDependencies
): boolean {
  return (
    isBinaryRuntimeCall(expression) &&
    expression.binaryRuntimeMethod === 'toString' &&
    dependencies.inferExpressionType(expression.callee.object, context) === 'bytes'
  )
}
