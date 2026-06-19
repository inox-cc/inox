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
  registerOwnedValue
} from '../context.ts'
import type { CFunctionContext } from '../context.ts'
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
  emitPreparedStringBytesOperand: (expression: AnyNode, context: CFunctionContext, tempPrefix: string) => PreparedStringBytesOperand
  inferExpressionType: (expression: AnyNode, context: CFunctionContext) => string
}

function pushBinaryLines(target: string[], lines: string[]): void {
  for (const line of lines) {
    target.push(line)
  }
}

function binaryNodeAt(values: AnyNode[], index: number): AnyNode {
  return values[index]
}

function binaryStringAt(values: string[], index: number): string {
  return values[index]
}

export function binaryRuntimeMethodName(callee: AnyNode): string | null {
  if (callee.type !== 'MemberExpression') {
    return null
  }

  let root: string | null = null

  if (callee.object != null && callee.object.type === 'Reference' && callee.object.path.length === 1) {
    root = binaryStringAt(callee.object.path, 0)
  }

  if (
    root === 'Buffer'
  ) {
    return binaryStaticRuntimeMethodNameFromPath([root, callee.property])
  }

  return binaryInstanceRuntimeMethodName(callee.property)
}

export function isBinaryRuntimeCall(expression: AnyNode | null | undefined): boolean {
  return expression != null && expression.type === 'CallExpression' && expression.binaryRuntimeMethod != null
}

export function isBufferFromCall(expression: AnyNode | null | undefined): boolean {
  return expression != null && isBinaryRuntimeCall(expression) && expression.binaryRuntimeMethod === 'from'
}

export function isBufferAllocCall(expression: AnyNode | null | undefined): boolean {
  return expression != null && isBinaryRuntimeCall(expression) && expression.binaryRuntimeMethod === 'alloc'
}

export function isBinaryConstructorExpression(expression: AnyNode): boolean {
  return (
    expression.type === 'NewExpression' &&
    expression.callee.type === 'Reference' &&
    binaryConstructorNameFromPath(expression.callee.path) != null &&
    expression.valueType === 'bytes'
  )
}

export function binaryRuntimeExpressionReturnType(expression: AnyNode | null | undefined): string | null {
  if (expression == null) {
    return null
  }

  if (expression.binaryRuntimeMethod != null) {
    return binaryRuntimeReturnType(expression.binaryRuntimeMethod)
  }

  return null
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
  const value = dependencies.emitPreparedStringBytesOperand(expression.args[0], context, 'inox_buffer_from')
  const temp = nextCName(context, 'inox_bytes')
  registerOwnedValue(context, temp)
  const lines: string[] = []

  pushBinaryLines(lines, value.lines)
  pushBinaryLines(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(
    emitStatusCheck(
      `inox_bytes_from_data(&inox_default_allocator, (const uint8_t*)${value.bytes}, ${value.length}, &${temp})`,
      context
    )
  )
  lines.push(emitRuntimeValueCheck(temp, 'INOX_TAG_BYTES', context))

  return {
    lines: lines,
    expression: temp
  }
}

function emitCBytesAllocValueExpression(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: BinaryLoweringDependencies
): PreparedExpression {
  const temp = nextCName(context, 'inox_bytes')
  registerOwnedValue(context, temp)
  let firstArg: AnyNode | null = null

  if (expression.args.length > 0) {
    firstArg = expression.args[0]
  }

  if (isBinaryConstructorExpression(expression) && firstArg != null && firstArg.type === 'ArrayLiteral') {
    const elements = firstArg.elements
    const lines: string[] = []

    pushBinaryLines(lines, emitPrepareOwnedValueWrite(temp))
    lines.push(emitStatusCheck(`inox_bytes_new(&inox_default_allocator, ${elements.length}, &${temp})`, context))

    for (let index = 0; index < elements.length; index = index + 1) {
      const element = binaryNodeAt(elements, index)
      const value = dependencies.emitPreparedNumberExpression(element, context)

      pushBinaryLines(lines, value.lines)
      lines.push(
        emitStatusCheck(
          `inox_bytes_set(${temp}, ${index}, (uint8_t)(${value.expression}))`,
          context
        )
      )
    }

    return {
      lines,
      expression: temp
    }
  }

  if (
    isBinaryConstructorExpression(expression) &&
    firstArg != null &&
    dependencies.inferExpressionType(firstArg, context) !== 'number'
  ) {
    context.diagnostics.push(
      diagnostic(
        'INOX_C_JS_GLOBAL',
        'Uint8Array constructor currently supports only length or array literals in C',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: 'inox_undefined_value()'
    }
  }

  const size = dependencies.emitPreparedNumberExpression(expression.args[0], context)
  const lines: string[] = []

  pushBinaryLines(lines, size.lines)
  pushBinaryLines(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(
    emitStatusCheck(
      `inox_bytes_new(&inox_default_allocator, (size_t)(${size.expression}), &${temp})`,
      context
    )
  )

  return {
    lines: lines,
    expression: temp
  }
}

function emitCBytesSliceValueExpression(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: BinaryLoweringDependencies
): PreparedExpression {
  const receiver = dependencies.emitCValueExpression(expression.callee.object, context)
  const start = dependencies.emitPreparedNumberExpression(expression.args[0], context)
  const lengthName = nextCName(context, 'inox_bytes_len')
  const startRaw = nextCName(context, 'inox_bytes_start_raw')
  const startIndex = nextCName(context, 'inox_bytes_start')
  const endRaw = nextCName(context, 'inox_bytes_end_raw')
  const endIndex = nextCName(context, 'inox_bytes_end')
  const temp = nextCName(context, 'inox_bytes_slice')
  registerOwnedValue(context, temp)
  const lines: string[] = []
  const endLines: string[] = []
  let endExpression = `((double)${lengthName})`

  if (expression.args.length > 1) {
    const preparedEnd = dependencies.emitPreparedNumberExpression(expression.args[1], context)
    endExpression = preparedEnd.expression
    pushBinaryLines(endLines, preparedEnd.lines)
  }

  pushBinaryLines(lines, receiver.lines)
  pushBinaryLines(lines, start.lines)

  pushBinaryLines(lines, endLines)

  lines.push(`size_t ${lengthName} = 0;`)
  lines.push(emitStatusCheck(`inox_bytes_len(${receiver.expression}, &${lengthName})`, context))
  lines.push(`double ${startRaw} = ${start.expression};`)
  lines.push(`double ${endRaw} = ${endExpression};`)
  pushBinaryLines(lines, emitSliceIndexNormalizationLines(startRaw, lengthName, startIndex, context, 'inox_bytes_start'))
  pushBinaryLines(lines, emitSliceIndexNormalizationLines(endRaw, lengthName, endIndex, context, 'inox_bytes_end'))
  lines.push(`if (${endIndex} < ${startIndex}) ${endIndex} = ${startIndex};`)
  pushBinaryLines(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(emitStatusCheck(`inox_bytes_slice(${receiver.expression}, ${startIndex}, ${endIndex}, &${temp})`, context))
  lines.push(emitRuntimeValueCheck(temp, 'INOX_TAG_BYTES', context))

  return {
    lines: lines,
    expression: temp
  }
}

function emitCBytesToStringValueExpression(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: BinaryLoweringDependencies
): PreparedExpression {
  const receiver = dependencies.emitCValueExpression(expression.callee.object, context)
  const temp = nextCName(context, 'inox_bytes_string')
  registerOwnedValue(context, temp)
  const lines: string[] = []

  pushBinaryLines(lines, receiver.lines)
  pushBinaryLines(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(emitStatusCheck(`inox_bytes_to_string(&inox_default_allocator, ${receiver.expression}, &${temp})`, context))
  lines.push(emitRuntimeValueCheck(temp, 'INOX_TAG_STRING', context))

  return {
    lines: lines,
    expression: temp
  }
}

export function emitPreparedBinaryNumberCallExpression(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: BinaryLoweringDependencies
): PreparedExpression | null {
  if (expression.type === 'CallExpression' && expression.binaryRuntimeMethod === 'isBuffer') {
    const value = dependencies.emitCValueExpression(expression.args[0], context)

    return {
      lines: value.lines,
      expression: `(${value.expression}.tag == INOX_TAG_BYTES ? 1 : 0)`
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
    expression.type !== 'MemberExpression' ||
    expression.property !== 'length' ||
    dependencies.inferExpressionType(expression.object, context) !== 'bytes'
  ) {
    return null
  }

  const value = dependencies.emitCValueExpression(expression.object, context)
  const temp = nextCName(context, 'inox_bytes_len')
  const lines: string[] = []

  pushBinaryLines(lines, value.lines)
  lines.push(`size_t ${temp} = 0;`)
  lines.push(emitStatusCheck(`inox_bytes_len(${value.expression}, &${temp})`, context))

  return {
    lines: lines,
    expression: `((double)${temp})`
  }
}

export function emitPreparedBytesIndexExpression(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: BinaryLoweringDependencies
): PreparedExpression | null {
  if (
    expression.type !== 'IndexExpression' ||
    dependencies.inferExpressionType(expression.object, context) !== 'bytes'
  ) {
    return null
  }

  const value = dependencies.emitCValueExpression(expression.object, context)
  const index = dependencies.emitPreparedNumberExpression(expression.index, context)
  const byte = nextCName(context, 'inox_byte')
  const lines: string[] = []

  pushBinaryLines(lines, value.lines)
  pushBinaryLines(lines, index.lines)
  lines.push(`uint8_t ${byte} = 0;`)
  lines.push(emitStatusCheck(`inox_bytes_get(${value.expression}, (size_t)(${index.expression}), &${byte})`, context))

  return {
    lines: lines,
    expression: `((double)${byte})`
  }
}

export function emitPreparedBytesIndexAssignment(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: BinaryLoweringDependencies
): PreparedStatement | null {
  if (
    expression.target == null ||
    expression.target.type !== 'IndexExpression' ||
    dependencies.inferExpressionType(expression.target.object, context) !== 'bytes'
  ) {
    return null
  }

  const value = dependencies.emitCValueExpression(expression.target.object, context)
  const index = dependencies.emitPreparedNumberExpression(expression.target.index, context)
  const byte = dependencies.emitPreparedNumberExpression(expression.value, context)
  const lines: string[] = []

  pushBinaryLines(lines, value.lines)
  pushBinaryLines(lines, index.lines)
  pushBinaryLines(lines, byte.lines)
  lines.push(
    emitStatusCheck(
      `inox_bytes_set(${value.expression}, (size_t)(${index.expression}), (uint8_t)(${byte.expression}))`,
      context
    )
  )

  return {
    lines: lines
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
