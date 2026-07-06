import { diagnostic } from '../../../../compiler/diagnostics.ts'
import {
  binaryConstructorNameFromPath,
  binaryInstanceRuntimeMethodName,
  binaryRuntimeReturnType,
  binaryStaticRuntimeMethodNameFromPath
} from './descriptor.ts'
import type { AnyNode } from '../../../../compiler/types.ts'
import type { CFunctionContext } from '../../../../compiler/c/context.ts'
import { emitRuntimeTypeCheck, nextCName } from '../../../../compiler/c/context.ts'
import type {
  CPreparedExpression as PreparedExpression,
  CPreparedStatement as PreparedStatement,
  CPreparedStringBytesOperand as PreparedStringBytesOperand
} from '../../../../compiler/c/types.ts'
import { emitSliceIndexNormalizationLines } from '../../../../compiler/c/values/slices.ts'

export type BinaryBytesKind = 'buffer' | 'uint8array'

export type BinaryLoweringDependencies = {
  emitCValueExpression: (expression: AnyNode, context: CFunctionContext) => PreparedExpression
  emitPreparedNumberExpression: (expression: AnyNode, context: CFunctionContext) => PreparedExpression
  emitPreparedStringBytesOperand: (
    expression: AnyNode,
    context: CFunctionContext,
    tempPrefix: string
  ) => PreparedStringBytesOperand
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

function binaryThrownCheck(context: CFunctionContext): string {
  return emitRuntimeTypeCheck('inox::thrown()', context)
}

function binaryCppType(kind: BinaryBytesKind): string {
  return kind === 'buffer' ? 'Buffer' : 'Uint8Array'
}

function binaryFacade(expression: string, kind: BinaryBytesKind): string {
  return `${binaryCppType(kind)}(${expression})`
}

export function binaryRuntimeMethodName(callee: AnyNode): string | null {
  if (callee.type !== 'MemberExpression') {
    return null
  }

  let root: string | null = null

  if (
    callee.object !== null &&
    typeof callee.object !== 'undefined' &&
    callee.object.type === 'Reference' &&
    callee.object.path.length === 1
  ) {
    root = binaryStringAt(callee.object.path, 0)
  }

  if (root === 'Buffer') {
    return binaryStaticRuntimeMethodNameFromPath([root, callee.property])
  }

  return binaryInstanceRuntimeMethodName(callee.property)
}

export function isBinaryRuntimeCall(expression: AnyNode | null | undefined): boolean {
  return (
    expression !== null &&
    typeof expression !== 'undefined' &&
    expression.type === 'CallExpression' &&
    expression.binaryRuntimeMethod !== null &&
    typeof expression.binaryRuntimeMethod !== 'undefined'
  )
}

export function isBufferFromCall(expression: AnyNode | null | undefined): boolean {
  return (
    expression !== null &&
    typeof expression !== 'undefined' &&
    isBinaryRuntimeCall(expression) &&
    expression.binaryRuntimeMethod === 'from'
  )
}

export function isBufferAllocCall(expression: AnyNode | null | undefined): boolean {
  return (
    expression !== null &&
    typeof expression !== 'undefined' &&
    isBinaryRuntimeCall(expression) &&
    expression.binaryRuntimeMethod === 'alloc'
  )
}

export function isBinaryConstructorExpression(expression: AnyNode): boolean {
  return (
    expression.type === 'NewExpression' &&
    expression.callee.type === 'Reference' &&
    !!binaryConstructorNameFromPath(expression.callee.path) &&
    expression.valueType === 'bytes'
  )
}

export function binaryRuntimeExpressionReturnType(expression: AnyNode | null | undefined): string | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  if (expression.binaryRuntimeMethod !== null && typeof expression.binaryRuntimeMethod !== 'undefined') {
    return binaryRuntimeReturnType(expression.binaryRuntimeMethod)
  }

  return null
}

export function resolveBinaryExpressionKind(
  expression: AnyNode | null | undefined,
  context: CFunctionContext
): BinaryBytesKind | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  if (expression.type === 'Reference' && expression.path.length === 1) {
    const kind = context.byteKinds.get(binaryStringAt(expression.path, 0))

    if (kind === 'buffer' || kind === 'uint8array') {
      return kind
    }

    return null
  }

  if (isBinaryConstructorExpression(expression)) {
    return 'uint8array'
  }

  if (isBufferFromCall(expression) || isBufferAllocCall(expression)) {
    return 'buffer'
  }

  if (
    isBinaryRuntimeCall(expression) &&
    expression.binaryRuntimeMethod === 'slice' &&
    expression.callee !== null &&
    typeof expression.callee !== 'undefined' &&
    expression.callee.type === 'MemberExpression'
  ) {
    return resolveBinaryExpressionKind(expression.callee.object, context)
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
  const temp = nextCName(context, 'buffer')
  const lines: string[] = []

  pushBinaryLines(lines, value.lines)
  lines.push(`auto ${temp} = Buffer::from(inox::StringView(${value.bytes}, ${value.length}));`)
  lines.push(binaryThrownCheck(context))

  return {
    lines: lines,
    expression: temp,
    valueType: 'bytes',
    cppType: 'Buffer',
    runtimeTypeChecked: true
  }
}

function emitCBytesAllocValueExpression(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: BinaryLoweringDependencies
): PreparedExpression {
  const kind: BinaryBytesKind = isBufferAllocCall(expression) ? 'buffer' : 'uint8array'
  const cppType = binaryCppType(kind)
  const temp = nextCName(context, kind === 'buffer' ? 'buffer' : 'uint8array')
  let firstArg: AnyNode | null = null

  if (expression.args.length > 0) {
    firstArg = expression.args[0]
  }

  if (
    isBinaryConstructorExpression(expression) &&
    firstArg !== null &&
    typeof firstArg !== 'undefined' &&
    firstArg.type === 'ArrayLiteral'
  ) {
    const elements = firstArg.elements
    const lines: string[] = []

    lines.push(`auto ${temp} = Uint8Array::create(${elements.length});`)
    lines.push(binaryThrownCheck(context))

    for (let index = 0; index < elements.length; index = index + 1) {
      const element = binaryNodeAt(elements, index)
      const value = dependencies.emitPreparedNumberExpression(element, context)

      pushBinaryLines(lines, value.lines)
      lines.push(`${temp}.set(${index}, (uint8_t)(${value.expression}));`)
      lines.push(binaryThrownCheck(context))
    }

    return {
      lines,
      expression: temp,
      valueType: 'bytes',
      cppType: 'Uint8Array',
      runtimeTypeChecked: true
    }
  }

  if (
    isBinaryConstructorExpression(expression) &&
    firstArg !== null &&
    typeof firstArg !== 'undefined' &&
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
  const factory = kind === 'buffer' ? 'Buffer::alloc' : 'Uint8Array::create'

  pushBinaryLines(lines, size.lines)
  lines.push(`auto ${temp} = ${factory}((size_t)(${size.expression}));`)
  lines.push(binaryThrownCheck(context))

  return {
    lines: lines,
    expression: temp,
    valueType: 'bytes',
    cppType,
    runtimeTypeChecked: true
  }
}

function emitCBytesSliceValueExpression(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: BinaryLoweringDependencies
): PreparedExpression {
  const receiver = dependencies.emitCValueExpression(expression.callee.object, context)
  const start = dependencies.emitPreparedNumberExpression(expression.args[0], context)
  const kind = resolveBinaryExpressionKind(expression.callee.object, context) ?? 'uint8array'
  const cppType = binaryCppType(kind)
  const lengthName = nextCName(context, 'bytes_length')
  const startRaw = nextCName(context, 'inox_bytes_start_raw')
  const startIndex = nextCName(context, 'inox_bytes_start')
  const endRaw = nextCName(context, 'inox_bytes_end_raw')
  const endIndex = nextCName(context, 'inox_bytes_end')
  const temp = nextCName(context, kind === 'buffer' ? 'buffer_slice' : 'uint8array_slice')
  const lines: string[] = []
  const endLines: string[] = []
  let endExpression = `((double)${lengthName})`
  const receiverFacade = binaryFacade(receiver.expression, kind)

  if (expression.args.length > 1) {
    const preparedEnd = dependencies.emitPreparedNumberExpression(expression.args[1], context)
    endExpression = preparedEnd.expression
    pushBinaryLines(endLines, preparedEnd.lines)
  }

  pushBinaryLines(lines, receiver.lines)
  pushBinaryLines(lines, start.lines)

  pushBinaryLines(lines, endLines)

  lines.push(`auto ${lengthName} = ${receiverFacade}.length();`)
  lines.push(binaryThrownCheck(context))
  lines.push(`double ${startRaw} = ${start.expression};`)
  lines.push(`double ${endRaw} = ${endExpression};`)
  pushBinaryLines(
    lines,
    emitSliceIndexNormalizationLines(startRaw, lengthName, startIndex, context, 'inox_bytes_start')
  )
  pushBinaryLines(lines, emitSliceIndexNormalizationLines(endRaw, lengthName, endIndex, context, 'inox_bytes_end'))
  lines.push(`if (${endIndex} < ${startIndex}) ${endIndex} = ${startIndex};`)
  lines.push(`auto ${temp} = ${receiverFacade}.slice(${startIndex}, ${endIndex});`)
  lines.push(binaryThrownCheck(context))

  return {
    lines: lines,
    expression: temp,
    valueType: 'bytes',
    cppType,
    runtimeTypeChecked: true
  }
}

function emitCBytesToStringValueExpression(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: BinaryLoweringDependencies
): PreparedExpression {
  const receiver = dependencies.emitCValueExpression(expression.callee.object, context)
  const temp = nextCName(context, 'inox_bytes_string')
  let kind: BinaryBytesKind = 'buffer'
  const lines: string[] = []

  if (resolveBinaryExpressionKind(expression.callee.object, context) === 'uint8array') {
    kind = 'uint8array'
  }

  pushBinaryLines(lines, receiver.lines)
  lines.push(`auto ${temp} = ${binaryFacade(receiver.expression, kind)}.toString();`)
  lines.push(binaryThrownCheck(context))

  return {
    lines: lines,
    expression: temp,
    valueType: 'string',
    cppType: 'inox::String',
    runtimeTypeChecked: true
  }
}

export function emitPreparedBinaryNumberCallExpression(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: BinaryLoweringDependencies
): PreparedExpression | null {
  if (expression.type === 'CallExpression' && expression.binaryRuntimeMethod === 'isBuffer') {
    const value = dependencies.emitCValueExpression(expression.args[0], context)
    const kind = resolveBinaryExpressionKind(expression.args[0], context)
    let isBufferExpression = `(Buffer::isBuffer(${value.expression}) ? 1 : 0)`

    if (kind === 'uint8array') {
      isBufferExpression = '0'
    }

    return {
      lines: value.lines,
      expression: isBufferExpression
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
  const kind = resolveBinaryExpressionKind(expression.object, context) ?? 'uint8array'
  const temp = nextCName(context, 'bytes_length')
  const lines: string[] = []

  pushBinaryLines(lines, value.lines)
  lines.push(`auto ${temp} = ${binaryFacade(value.expression, kind)}.length();`)
  lines.push(binaryThrownCheck(context))

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
  const kind = resolveBinaryExpressionKind(expression.object, context) ?? 'uint8array'
  const byte = nextCName(context, 'inox_byte')
  const lines: string[] = []

  pushBinaryLines(lines, value.lines)
  pushBinaryLines(lines, index.lines)
  lines.push(`auto ${byte} = ${binaryFacade(value.expression, kind)}.get((size_t)(${index.expression}));`)
  lines.push(binaryThrownCheck(context))

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
    expression.target === null ||
    typeof expression.target === 'undefined' ||
    expression.target.type !== 'IndexExpression' ||
    dependencies.inferExpressionType(expression.target.object, context) !== 'bytes'
  ) {
    return null
  }

  const value = dependencies.emitCValueExpression(expression.target.object, context)
  const index = dependencies.emitPreparedNumberExpression(expression.target.index, context)
  const byte = dependencies.emitPreparedNumberExpression(expression.value, context)
  const kind = resolveBinaryExpressionKind(expression.target.object, context) ?? 'uint8array'
  const lines: string[] = []

  pushBinaryLines(lines, value.lines)
  pushBinaryLines(lines, index.lines)
  pushBinaryLines(lines, byte.lines)
  lines.push(`${binaryFacade(value.expression, kind)}.set((size_t)(${index.expression}), (uint8_t)(${byte.expression}));`)
  lines.push(binaryThrownCheck(context))

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
