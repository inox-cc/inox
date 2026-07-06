import { memberExpressionPath } from '../../../../compiler/member-paths.ts'
import { fsRuntimeCallInfoFromPath, isAsyncFsRuntimeMethod } from './descriptor.ts'
import type { AnyNode } from '../../../../compiler/types.ts'
import {
  emitPrepareOwnedValueWrite,
  emitRuntimeTypeCheck,
  emitStatusCheck,
  nextCName,
  registerEventLoop,
  registerOwnedPromise,
  registerOwnedValue
} from '../../../../compiler/c/context.ts'
import { emitRuntimeValueCheck } from '../../../../compiler/c/runtime-values.ts'
import type {
  CPreparedCallOptions as PreparedCallOptions,
  CPreparedExpression as PreparedExpression,
  CPreparedStatement as PreparedStatement,
  CPreparedStringBytesOperand as PreparedStringBytesOperand
} from '../../../../compiler/c/types.ts'
import { cRuntimeValueTag } from '../../../../compiler/c/value-types.ts'

type FsFunctionContext = {
  cleanupEnabled: boolean
  eventLoopUsed: boolean
  externalEventLoop: boolean
  failureStatement?: string | null
  failureStatementUsed?: boolean
  nextId: number
  ownedPromises: string[]
  ownedValues: string[]
  promiseRejectionValueTypes: Map<string, string>
  promiseValueTypes: Map<string, string>
  returnType?: string
  statusReturn: boolean
  throwingFunction: boolean
  usedCleanupGoto: boolean
  variables: Map<string, string>
}

export type FsLoweringDependencies = {
  emitCValueExpression(expression: AnyNode, context: FsFunctionContext): PreparedExpression
  emitPreparedNumberExpression(expression: AnyNode, context: FsFunctionContext): PreparedExpression
  emitPreparedStringBytesOperand(
    expression: AnyNode,
    context: FsFunctionContext,
    tempPrefix?: string
  ): PreparedStringBytesOperand
  inferExpressionType(expression: AnyNode, context: FsFunctionContext): string
}

export type FsAsyncTaskSourceExpression = {
  lines: string[]
}

type FsAsyncCallDescriptor = {
  callName: string
  kind: string
  tempPrefix?: string
}

type FsSyncStatementDescriptor = {
  callName: string
  kind: string
  tempPrefix?: string
}

function emitFsStringArgument(operand: PreparedStringBytesOperand): string {
  return operand.cppExpression ?? `inox::StringView(${operand.bytes}, ${operand.length})`
}

function fsSyncValueCppType(callName: string, valueType: string): string | null {
  if (callName === 'fs.statSync' || callName === 'fs.lstatSync') {
    return 'FsStats'
  }

  if (callName === 'fs.readdirSync' || callName === 'fs.readdirDirentsSync') {
    return 'Array'
  }

  if (
    valueType === 'string' &&
    (callName === 'fs.readFileSync' || callName === 'fs.realpathSync' || callName === 'fs.readlinkSync')
  ) {
    return 'inox::String'
  }

  if (callName === 'fs.readFileBytesSync') {
    return 'Buffer'
  }

  return null
}

function fsAsyncCppExpression(
  expression: AnyNode,
  context: FsFunctionContext,
  dependencies: FsLoweringDependencies,
  path: PreparedStringBytesOperand,
  lines: string[],
  descriptor: FsAsyncCallDescriptor
): PreparedExpression | null {
  const method = cFsRuntimeExpressionMethod(expression)

  return {
    lines,
    expression: emitFsAsyncPromiseCall(expression, context, dependencies, path, lines, descriptor),
    valueType: fsPromiseValueType(expression, method),
    rejectionValueType: 'error'
  }
}

function emitFsAsyncPromiseCall(
  expression: AnyNode,
  context: FsFunctionContext,
  dependencies: FsLoweringDependencies,
  path: PreparedStringBytesOperand,
  lines: string[],
  descriptor: FsAsyncCallDescriptor
): string {
  if (descriptor.kind === 'path-out') {
    return `${descriptor.callName}(${emitFsStringArgument(path)})`
  }

  if (descriptor.kind === 'access-out') {
    const mode = emitPreparedFsAccessModeExpression(expression, context, dependencies)
    appendLines(lines, mode.lines)

    return `${descriptor.callName}(${emitFsStringArgument(path)}, ${mode.expression})`
  }

  if (descriptor.kind === 'mkdir-out') {
    return `${descriptor.callName}(${emitFsStringArgument(path)}, ${emitFsBooleanFlag(expression, 'fsRecursive')})`
  }

  if (descriptor.kind === 'rm-out') {
    return `${descriptor.callName}(${emitFsStringArgument(path)}, ${emitFsBooleanFlag(expression, 'fsRecursive')}, ${emitFsBooleanFlag(expression, 'fsForce')})`
  }

  if (descriptor.kind === 'bytes-value-out') {
    const bytes = dependencies.emitCValueExpression(expression.args[1], context)

    appendLines(lines, bytes.lines)
    lines.push(emitRuntimeValueCheck(bytes.expression, 'INOX_TAG_BYTES', context))

    return `${descriptor.callName}(${emitFsStringArgument(path)}, ${bytes.expression})`
  }

  if (descriptor.kind === 'path-arg-out') {
    const argumentPath = dependencies.emitPreparedStringBytesOperand(
      expression.args[1],
      context,
      fsDescriptorTempPrefix(descriptor)
    )

    appendLines(lines, argumentPath.lines)

    return `${descriptor.callName}(${emitFsStringArgument(path)}, ${emitFsStringArgument(argumentPath)})`
  }

  const bytes = dependencies.emitPreparedStringBytesOperand(expression.args[1], context, 'inox_fs_bytes')

  appendLines(lines, bytes.lines)

  return `${descriptor.callName}(${emitFsStringArgument(path)}, ${emitFsStringArgument(bytes)})`
}

const fsSyncStatementDescriptors: Record<string, FsSyncStatementDescriptor> = {
  appendFileSync: { kind: 'string-bytes', callName: 'fs.appendFileSync' },
  copyFileSync: { kind: 'path-arg', callName: 'fs.copyFileSync', tempPrefix: 'inox_fs_dest_path' },
  renameSync: { kind: 'path-arg', callName: 'fs.renameSync', tempPrefix: 'inox_fs_new_path' },
  symlinkSync: { kind: 'path-arg', callName: 'fs.symlinkSync', tempPrefix: 'inox_fs_link_path' },
  unlinkSync: { kind: 'path', callName: 'fs.unlinkSync' },
  writeFileSync: { kind: 'string-bytes', callName: 'fs.writeFileSync' }
}

function fsPromiseResultTypeForMethod(method: string | null): string | null {
  if (
    method === 'access' ||
    method === 'appendFile' ||
    method === 'copyFile' ||
    method === 'mkdir' ||
    method === 'rename' ||
    method === 'rm' ||
    method === 'symlink' ||
    method === 'unlink' ||
    method === 'writeFile'
  ) {
    return 'void'
  }

  if (method === 'lstat' || method === 'stat') {
    return 'object'
  }

  if (method === 'readdir') {
    return 'array'
  }

  if (method === 'readFile' || method === 'readlink' || method === 'realpath') {
    return 'string'
  }

  return null
}

function fsAsyncCallDescriptorForExpression(expression: AnyNode, method: string | null): FsAsyncCallDescriptor | null {
  if (method === 'access') {
    return { kind: 'access-out', callName: 'fs.promises.access' }
  }

  if (method === 'appendFile') {
    if (fsUsesBytes(expression)) {
      return { kind: 'bytes-value-out', callName: 'fs.promises.appendFile' }
    }

    return { kind: 'string-bytes-out', callName: 'fs.promises.appendFile' }
  }

  if (method === 'copyFile') {
    return { kind: 'path-arg-out', callName: 'fs.promises.copyFile', tempPrefix: 'inox_fs_dest_path' }
  }

  if (method === 'lstat') {
    return { kind: 'path-out', callName: 'fs.promises.lstat' }
  }

  if (method === 'mkdir') {
    return { kind: 'mkdir-out', callName: 'fs.promises.mkdir' }
  }

  if (method === 'readFile') {
    if (fsUsesBytes(expression)) {
      return { kind: 'path-out', callName: 'fs.promises.readFileBytes' }
    }

    return { kind: 'path-out', callName: 'fs.promises.readFile' }
  }

  if (method === 'readdir') {
    if (fsUsesDirents(expression)) {
      return { kind: 'path-out', callName: 'fs.promises.readdirDirents' }
    }

    return { kind: 'path-out', callName: 'fs.promises.readdir' }
  }

  if (method === 'readlink') {
    return { kind: 'path-out', callName: 'fs.promises.readlink' }
  }

  if (method === 'realpath') {
    return { kind: 'path-out', callName: 'fs.promises.realpath' }
  }

  if (method === 'rename') {
    return { kind: 'path-arg-out', callName: 'fs.promises.rename', tempPrefix: 'inox_fs_new_path' }
  }

  if (method === 'rm') {
    return { kind: 'rm-out', callName: 'fs.promises.rm' }
  }

  if (method === 'stat') {
    return { kind: 'path-out', callName: 'fs.promises.stat' }
  }

  if (method === 'symlink') {
    return { kind: 'path-arg-out', callName: 'fs.promises.symlink', tempPrefix: 'inox_fs_link_path' }
  }

  if (method === 'unlink') {
    return { kind: 'path-out', callName: 'fs.promises.unlink' }
  }

  if (method === 'writeFile') {
    if (fsUsesBytes(expression)) {
      return { kind: 'bytes-value-out', callName: 'fs.promises.writeFile' }
    }

    return { kind: 'string-bytes-out', callName: 'fs.promises.writeFile' }
  }

  return null
}

function fsSyncValueCallNameForExpression(expression: AnyNode, method: string | null): string | null {
  if (method === 'lstatSync') {
    return 'fs.lstatSync'
  }

  if (method === 'readFileSync') {
    if (fsUsesBytes(expression)) {
      return 'fs.readFileBytesSync'
    }

    return 'fs.readFileSync'
  }

  if (method === 'readdirSync') {
    if (fsUsesDirents(expression)) {
      return 'fs.readdirDirentsSync'
    }

    return 'fs.readdirSync'
  }

  if (method === 'readlinkSync') {
    return 'fs.readlinkSync'
  }

  if (method === 'realpathSync') {
    return 'fs.realpathSync'
  }

  if (method === 'statSync') {
    return 'fs.statSync'
  }

  return null
}

function fsSyncStatementDescriptorForExpression(
  expression: AnyNode,
  method: string | null
): FsSyncStatementDescriptor | null {
  if (method === null || typeof method === 'undefined') {
    return null
  }

  if (method === 'appendFileSync' && fsUsesBytes(expression)) {
    return { kind: 'bytes-value', callName: 'fs.appendFileSync' }
  }

  if (method === 'writeFileSync' && fsUsesBytes(expression)) {
    return { kind: 'bytes-value', callName: 'fs.writeFileSync' }
  }

  return fsSyncStatementDescriptors[method] ?? null
}

export function cFsRuntimeExpressionMethod(expression: AnyNode | null | undefined): string | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  if (expression.fsRuntimeMethod !== null && typeof expression.fsRuntimeMethod !== 'undefined') {
    return expression.fsRuntimeMethod
  }

  return cFsRuntimeCallName(expression.callee)
}

export function isAsyncFsRuntimeCallExpression(expression: AnyNode | null | undefined): boolean {
  const method = cFsRuntimeExpressionMethod(expression)

  return (
    expression !== null &&
    typeof expression !== 'undefined' &&
    method !== null &&
    typeof method !== 'undefined' &&
    expression.valueType === 'promise' &&
    isAsyncFsRuntimeMethod(method)
  )
}

export function cFsRuntimeConstantExpression(expression: AnyNode | null | undefined): string | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  const name = expression.fsRuntimeConstant

  if (name === 'F_OK') {
    return 'INOX_FS_F_OK'
  }

  if (name === 'R_OK') {
    return 'INOX_FS_R_OK'
  }

  if (name === 'W_OK') {
    return 'INOX_FS_W_OK'
  }

  if (name === 'X_OK') {
    return 'INOX_FS_X_OK'
  }

  return null
}

function cFsRuntimeCallName(callee: AnyNode): string | null {
  const path = memberExpressionPath(callee)

  if (path === null || typeof path === 'undefined' || path[0] !== 'fs') {
    return null
  }

  const info = fsRuntimeCallInfoFromPath(path)

  if (info === null || typeof info === 'undefined') {
    return null
  }

  if (info.mode === 'promise' || info.mode === 'sync' || (info.mode === 'callback' && info.nodeName === 'readdir')) {
    return info.method
  }

  return null
}

export function emitPreparedFsCallExpression(
  expression: AnyNode,
  context: FsFunctionContext,
  dependencies: FsLoweringDependencies,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  const method = cFsRuntimeExpressionMethod(expression)

  if (method === null || typeof method === 'undefined') {
    return null
  }

  if (expression.valueType !== 'promise') {
    return null
  }

  registerEventLoop(context)

  const path = dependencies.emitPreparedStringBytesOperand(expression.args[0], context, 'inox_fs_path')
  const lines: string[] = []
  appendLines(lines, path.lines)
  const descriptor = fsAsyncCallDescriptorForExpression(expression, method)

  if (options.cppExpression === true && descriptor !== null && typeof descriptor !== 'undefined') {
    const cppExpression = fsAsyncCppExpression(expression, context, dependencies, path, lines, descriptor)

    if (cppExpression !== null && typeof cppExpression !== 'undefined') {
      return cppExpression
    }
  }

  const out = preparedFsCallOut(options, context, 'inox_promise')
  if (options.owned !== false) {
    registerOwnedPromise(context, out, fsPromiseValueType(expression, method), 'error')
  }

  if (descriptor !== null && typeof descriptor !== 'undefined') {
    return emitPreparedFsAsyncDescriptorExpression(expression, context, dependencies, path, lines, out, descriptor)
  }

  return null
}

export function emitPreparedFsAsyncTaskSourceExpression(
  expression: AnyNode,
  context: FsFunctionContext,
  dependencies: FsLoweringDependencies
): FsAsyncTaskSourceExpression | null {
  if (!isAsyncFsRuntimeCallExpression(expression)) {
    return null
  }

  const method = cFsRuntimeExpressionMethod(expression)
  const path = dependencies.emitPreparedStringBytesOperand(expression.args[0], context, 'inox_fs_path')
  const lines: string[] = []
  appendLines(lines, path.lines)
  const descriptor = fsAsyncCallDescriptorForExpression(expression, method)

  if (descriptor !== null && typeof descriptor !== 'undefined') {
    emitPreparedFsAsyncTaskDescriptorSourceExpression(expression, context, dependencies, path, lines, descriptor)

    return {
      lines
    }
  }

  return null
}

function emitPreparedFsAsyncTaskDescriptorSourceExpression(
  expression: AnyNode,
  context: FsFunctionContext,
  dependencies: FsLoweringDependencies,
  path: PreparedStringBytesOperand,
  lines: string[],
  descriptor: FsAsyncCallDescriptor
): void {
  const call = emitFsAsyncPromiseCall(expression, context, dependencies, path, lines, descriptor)

  lines.push(`frame->awaited = ${call}.release();`)
  lines.push('status = frame->awaited != nullptr ? INOX_OK : INOX_ERR_TYPE;')
}

function emitPreparedFsAsyncDescriptorExpression(
  expression: AnyNode,
  context: FsFunctionContext,
  dependencies: FsLoweringDependencies,
  path: PreparedStringBytesOperand,
  lines: string[],
  out: string,
  descriptor: FsAsyncCallDescriptor
): PreparedExpression {
  const call = emitFsAsyncPromiseCall(expression, context, dependencies, path, lines, descriptor)

  lines.push(`${out} = ${call};`)
  lines.push(emitStatusCheck(`${out}.valid() ? INOX_OK : INOX_ERR_TYPE`, context))

  return {
    lines,
    expression: out,
    rejectionValueType: 'error'
  }
}

export function emitPreparedFsSyncValueExpression(
  expression: AnyNode,
  context: FsFunctionContext,
  dependencies: FsLoweringDependencies
): PreparedExpression | null {
  const method = cFsRuntimeExpressionMethod(expression)
  const callName = fsSyncValueCallNameForExpression(expression, method)

  if (callName === null || typeof callName === 'undefined') {
    return null
  }

  const valueType = dependencies.inferExpressionType(expression, context)
  const expectedTag = cRuntimeValueTag(valueType) ?? ''

  if (expectedTag === '') {
    return null
  }

  const path = dependencies.emitPreparedStringBytesOperand(expression.args[0], context, 'inox_fs_path')
  const lines: string[] = []
  appendLines(lines, path.lines)

  const cppType = fsSyncValueCppType(callName, valueType)

  if (cppType !== null && typeof cppType !== 'undefined') {
    const out = nextCName(context, 'fs_value')
    lines.push(`auto ${out} = ${callName}(${emitFsStringArgument(path)});`)
    lines.push(emitRuntimeTypeCheck('inox::thrown()', context))

    return {
      lines,
      expression: out,
      cppType,
      valueType
    }
  }

  const out = nextCName(context, 'inox_fs_value')
  registerOwnedValue(context, out)
  const call = `${callName}(&inox_default_allocator, ${path.bytes}, ${path.length}, &${out})`
  appendLines(lines, emitPrepareOwnedValueWrite(out))
  lines.push(emitStatusCheck(call, context))
  lines.push(emitRuntimeValueCheck(out, expectedTag, context))

  return {
    lines,
    expression: out
  }
}

export function emitPreparedFsSyncStatementExpression(
  expression: AnyNode,
  context: FsFunctionContext,
  dependencies: FsLoweringDependencies
): PreparedStatement | null {
  const method = cFsRuntimeExpressionMethod(expression)
  const descriptor = fsSyncStatementDescriptorForExpression(expression, method)
  const specialMethod = method === 'accessSync' || method === 'mkdirSync' || method === 'rmSync'

  if (
    method === null ||
    typeof method === 'undefined' ||
    ((descriptor === null || typeof descriptor === 'undefined') && !specialMethod)
  ) {
    return null
  }

  const path = dependencies.emitPreparedStringBytesOperand(expression.args[0], context, 'inox_fs_path')
  const lines: string[] = []
  appendLines(lines, path.lines)

  if (descriptor !== null && typeof descriptor !== 'undefined') {
    return emitPreparedFsSyncStatementDescriptor(expression, context, dependencies, path, lines, descriptor)
  }

  if (method === 'accessSync') {
    const mode = emitPreparedFsAccessModeExpression(expression, context, dependencies)

    appendLines(lines, mode.lines)
    lines.push(`fs.accessSync(${emitFsStringArgument(path)}, ${mode.expression});`)
    lines.push(emitRuntimeTypeCheck('inox::thrown()', context))

    return {
      lines
    }
  }

  if (method === 'mkdirSync') {
    lines.push(`fs.mkdirSync(${emitFsStringArgument(path)}, ${emitFsBooleanFlag(expression, 'fsRecursive')});`)
    lines.push(emitRuntimeTypeCheck('inox::thrown()', context))

    return {
      lines
    }
  }

  if (method === 'rmSync') {
    lines.push(
      `fs.rmSync(${emitFsStringArgument(path)}, ${emitFsBooleanFlag(expression, 'fsRecursive')}, ${emitFsBooleanFlag(expression, 'fsForce')});`
    )
    lines.push(emitRuntimeTypeCheck('inox::thrown()', context))

    return {
      lines
    }
  }

  return null
}

function emitPreparedFsSyncStatementDescriptor(
  expression: AnyNode,
  context: FsFunctionContext,
  dependencies: FsLoweringDependencies,
  path: PreparedStringBytesOperand,
  lines: string[],
  descriptor: FsSyncStatementDescriptor
): PreparedStatement {
  if (descriptor.kind === 'path') {
    lines.push(`${descriptor.callName}(${emitFsStringArgument(path)});`)
    lines.push(emitRuntimeTypeCheck('inox::thrown()', context))
  } else if (descriptor.kind === 'bytes-value') {
    const bytes = dependencies.emitCValueExpression(expression.args[1], context)

    appendLines(lines, bytes.lines)
    lines.push(emitRuntimeValueCheck(bytes.expression, 'INOX_TAG_BYTES', context))
    lines.push(`${descriptor.callName}(${emitFsStringArgument(path)}, ${bytes.expression});`)
    lines.push(emitRuntimeTypeCheck('inox::thrown()', context))
  } else if (descriptor.kind === 'path-arg') {
    const argumentPath = dependencies.emitPreparedStringBytesOperand(
      expression.args[1],
      context,
      fsDescriptorTempPrefix(descriptor)
    )

    appendLines(lines, argumentPath.lines)
    lines.push(`${descriptor.callName}(${emitFsStringArgument(path)}, ${emitFsStringArgument(argumentPath)});`)
    lines.push(emitRuntimeTypeCheck('inox::thrown()', context))
  } else {
    const bytes = dependencies.emitPreparedStringBytesOperand(expression.args[1], context, 'inox_fs_bytes')

    appendLines(lines, bytes.lines)
    lines.push(`${descriptor.callName}(${emitFsStringArgument(path)}, ${emitFsStringArgument(bytes)});`)
    lines.push(emitRuntimeTypeCheck('inox::thrown()', context))
  }

  return {
    lines
  }
}

export function emitPreparedFsAccessModeExpression(
  expression: AnyNode,
  context: FsFunctionContext,
  dependencies: FsLoweringDependencies
): PreparedExpression {
  if (expression.args[1] === null || typeof expression.args[1] === 'undefined') {
    return {
      lines: [],
      expression: 'INOX_FS_F_OK'
    }
  }

  const mode = dependencies.emitPreparedNumberExpression(expression.args[1], context)

  return {
    lines: mode.lines,
    expression: `((int)${mode.expression})`
  }
}

export function emitFsBooleanFlag(expression: AnyNode, field: string): string {
  if (field === 'fsRecursive') {
    if (expression.fsRecursive === true) {
      return 'true'
    }

    return 'false'
  }

  if (field === 'fsForce') {
    if (expression.fsForce === true) {
      return 'true'
    }

    return 'false'
  }

  return 'false'
}

function fsUsesBytes(expression: AnyNode): boolean {
  return expression.fsBytes === true
}

function fsUsesDirents(expression: AnyNode): boolean {
  return expression.fsDirents === true
}

export function emitPreparedFsStatsMethodExpression(
  expression: AnyNode,
  context: FsFunctionContext,
  dependencies: FsLoweringDependencies
): PreparedExpression | null {
  const method = cFsRuntimeExpressionMethod(expression)

  if (method === null || typeof method === 'undefined') {
    return null
  }

  if (!isFsStatsRuntimeMethod(method)) {
    return null
  }

  const receiver = dependencies.emitCValueExpression(expression.callee.object, context)
  const runtimeClass = fsStatsRuntimeClass(method)
  const runtimeMethod = fsStatsRuntimeClassMethod(method)

  return {
    lines: receiver.lines,
    expression: `(${runtimeClass}(${receiver.expression}).${runtimeMethod}() ? 1 : 0)`
  }
}

function appendLines(target: string[], values: string[]): void {
  for (const value of values) {
    target.push(value)
  }
}

function preparedFsCallOut(options: PreparedCallOptions, context: FsFunctionContext, prefix: string): string {
  const out = options.out

  if (out !== null && typeof out !== 'undefined') {
    return out
  }

  return nextCName(context, prefix)
}

function fsPromiseValueType(expression: AnyNode, method: string | null): string {
  if (expression.promiseValueType !== null && typeof expression.promiseValueType !== 'undefined') {
    return expression.promiseValueType
  }

  if (method === null || typeof method === 'undefined') {
    return 'string'
  }

  const valueType = fsPromiseResultTypeForMethod(method)

  if (valueType !== null && typeof valueType !== 'undefined') {
    return valueType
  }

  return 'string'
}

function fsDescriptorTempPrefix(descriptor: FsAsyncCallDescriptor | FsSyncStatementDescriptor): string {
  if (descriptor.tempPrefix !== null && typeof descriptor.tempPrefix !== 'undefined') {
    return descriptor.tempPrefix
  }

  return 'inox_fs_path'
}

function isFsStatsRuntimeMethod(method: string | null): boolean {
  return (
    method === 'direntIsDirectory' ||
    method === 'direntIsFile' ||
    method === 'statsIsDirectory' ||
    method === 'statsIsFile'
  )
}

function fsStatsRuntimeClass(method: string | null): string {
  if (method === 'statsIsFile' || method === 'statsIsDirectory') {
    return 'FsStats'
  }

  return 'FsDirent'
}

function fsStatsRuntimeClassMethod(method: string | null): string {
  if (method === 'statsIsFile' || method === 'direntIsFile') {
    return 'isFile'
  }

  return 'isDirectory'
}
