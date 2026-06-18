import { fsRuntimeCallInfoFromPath, isAsyncFsRuntimeMethod } from '../../stdlib/descriptors/fs.ts'
import { memberExpressionPath } from '../../member-paths.ts'
import type { AnyNode } from '../../types.ts'
import {
  emitEventLoopReference,
  emitPrepareOwnedValueWrite,
  emitStatusCheck,
  registerEventLoop,
  registerOwnedPromise,
  registerOwnedValue,
  nextCName
} from '../context.ts'
import { emitRuntimeValueCheck } from '../runtime-values.ts'
import { cRuntimeValueTag } from '../value-types.ts'
import type {
  CPreparedCallOptions as PreparedCallOptions,
  CPreparedExpression as PreparedExpression,
  CPreparedStatement as PreparedStatement,
  CPreparedStringBytesOperand as PreparedStringBytesOperand
} from '../types.ts'

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

function fsPromiseResultTypeForMethod(method: string | null): string | null {
  if (
    method === 'access' ||
    method === 'appendFile' ||
    method === 'appendFileBytes' ||
    method === 'copyFile' ||
    method === 'mkdir' ||
    method === 'rename' ||
    method === 'rm' ||
    method === 'symlink' ||
    method === 'unlink' ||
    method === 'writeFile' ||
    method === 'writeFileBytes'
  ) {
    return 'void'
  }

  if (method === 'lstat' || method === 'stat') {
    return 'object'
  }

  if (method === 'readDir' || method === 'readDirDirents') {
    return 'array'
  }

  if (method === 'readFile' || method === 'readlink' || method === 'realpath') {
    return 'string'
  }

  if (method === 'readFileBytes') {
    return 'bytes'
  }

  return null
}

function fsAsyncCallDescriptorForMethod(method: string | null): FsAsyncCallDescriptor | null {
  if (method === 'appendFile') {
    return { kind: 'string-bytes-out', callName: 'ccjs_fs_append_file' }
  }

  if (method === 'appendFileBytes') {
    return { kind: 'bytes-value-out', callName: 'ccjs_fs_append_file_bytes' }
  }

  if (method === 'copyFile') {
    return { kind: 'path-arg-out', callName: 'ccjs_fs_copy_file', tempPrefix: 'ccjs_fs_dest_path' }
  }

  if (method === 'lstat') {
    return { kind: 'path-out', callName: 'ccjs_fs_lstat' }
  }

  if (method === 'readDir') {
    return { kind: 'path-out', callName: 'ccjs_fs_read_dir' }
  }

  if (method === 'readDirDirents') {
    return { kind: 'path-out', callName: 'ccjs_fs_read_dir_dirents' }
  }

  if (method === 'readFile') {
    return { kind: 'path-out', callName: 'ccjs_fs_read_file' }
  }

  if (method === 'readFileBytes') {
    return { kind: 'path-out', callName: 'ccjs_fs_read_file_bytes' }
  }

  if (method === 'readlink') {
    return { kind: 'path-out', callName: 'ccjs_fs_readlink' }
  }

  if (method === 'realpath') {
    return { kind: 'path-out', callName: 'ccjs_fs_realpath' }
  }

  if (method === 'rename') {
    return { kind: 'path-arg-out', callName: 'ccjs_fs_rename', tempPrefix: 'ccjs_fs_new_path' }
  }

  if (method === 'stat') {
    return { kind: 'path-out', callName: 'ccjs_fs_stat' }
  }

  if (method === 'symlink') {
    return { kind: 'path-arg-out', callName: 'ccjs_fs_symlink', tempPrefix: 'ccjs_fs_link_path' }
  }

  if (method === 'unlink') {
    return { kind: 'path-out', callName: 'ccjs_fs_unlink' }
  }

  if (method === 'writeFile') {
    return { kind: 'string-bytes-out', callName: 'ccjs_fs_write_file' }
  }

  if (method === 'writeFileBytes') {
    return { kind: 'bytes-value-out', callName: 'ccjs_fs_write_file_bytes' }
  }

  return null
}

function fsSyncValueCallNameForMethod(method: string | null): string | null {
  if (method === 'lstatSync') {
    return 'ccjs_fs_lstat_sync'
  }

  if (method === 'readDirDirentsSync') {
    return 'ccjs_fs_read_dir_dirents_sync'
  }

  if (method === 'readDirSync') {
    return 'ccjs_fs_read_dir_sync'
  }

  if (method === 'readFileBytesSync') {
    return 'ccjs_fs_read_file_bytes_sync'
  }

  if (method === 'readFileSync') {
    return 'ccjs_fs_read_file_sync'
  }

  if (method === 'readlinkSync') {
    return 'ccjs_fs_readlink_sync'
  }

  if (method === 'realpathSync') {
    return 'ccjs_fs_realpath_sync'
  }

  if (method === 'statSync') {
    return 'ccjs_fs_stat_sync'
  }

  return null
}

function fsSyncStatementDescriptorForMethod(method: string | null): FsSyncStatementDescriptor | null {
  if (method === 'appendFileBytesSync') {
    return { kind: 'bytes-value', callName: 'ccjs_fs_append_file_bytes_sync' }
  }

  if (method === 'appendFileSync') {
    return { kind: 'string-bytes', callName: 'ccjs_fs_append_file_sync' }
  }

  if (method === 'copyFileSync') {
    return { kind: 'path-arg', callName: 'ccjs_fs_copy_file_sync', tempPrefix: 'ccjs_fs_dest_path' }
  }

  if (method === 'renameSync') {
    return { kind: 'path-arg', callName: 'ccjs_fs_rename_sync', tempPrefix: 'ccjs_fs_new_path' }
  }

  if (method === 'symlinkSync') {
    return { kind: 'path-arg', callName: 'ccjs_fs_symlink_sync', tempPrefix: 'ccjs_fs_link_path' }
  }

  if (method === 'unlinkSync') {
    return { kind: 'path', callName: 'ccjs_fs_unlink_sync' }
  }

  if (method === 'writeFileBytesSync') {
    return { kind: 'bytes-value', callName: 'ccjs_fs_write_file_bytes_sync' }
  }

  if (method === 'writeFileSync') {
    return { kind: 'string-bytes', callName: 'ccjs_fs_write_file_sync' }
  }

  return null
}

export function cFsRuntimeExpressionMethod(expression: AnyNode | null | undefined): string | null {
  if (expression == null) {
    return null
  }

  if (expression.fsRuntimeMethod != null) {
    return expression.fsRuntimeMethod
  }

  return cFsRuntimeCallName(expression.callee)
}

export function isAsyncFsRuntimeCallExpression(expression: AnyNode | null | undefined): boolean {
  const method = cFsRuntimeExpressionMethod(expression)

  return expression != null && method != null && expression.valueType === 'promise' && isAsyncFsRuntimeMethod(method)
}

export function cFsRuntimeConstantExpression(expression: AnyNode | null | undefined): string | null {
  if (expression == null) {
    return null
  }

  const name = expression.fsRuntimeConstant

  if (name === 'F_OK') {
    return 'CCJS_FS_F_OK'
  }

  if (name === 'R_OK') {
    return 'CCJS_FS_R_OK'
  }

  if (name === 'W_OK') {
    return 'CCJS_FS_W_OK'
  }

  if (name === 'X_OK') {
    return 'CCJS_FS_X_OK'
  }

  return null
}

function cFsRuntimeCallName(callee: AnyNode): string | null {
  const path = memberExpressionPath(callee)

  if (path == null || path[0] !== 'fs') {
    return null
  }

  const info = fsRuntimeCallInfoFromPath(path)

  if (info == null) {
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

  if (method == null) {
    return null
  }

  if (expression.valueType !== 'promise') {
    return null
  }

  registerEventLoop(context)

  const out = preparedFsCallOut(options, context, 'ccjs_promise')
  if (options.owned !== false) {
    registerOwnedPromise(context, out, fsPromiseValueType(expression, method), 'error')
  }
  const path = dependencies.emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_fs_path')
  const lines: string[] = []
  appendLines(lines, path.lines)
  const descriptor = fsAsyncCallDescriptorForMethod(method)

  if (descriptor != null) {
    return emitPreparedFsAsyncDescriptorExpression(expression, context, dependencies, path, lines, out, descriptor)
  }

  if (method === 'access') {
    const mode = emitPreparedFsAccessModeExpression(expression, context, dependencies)

    appendLines(lines, mode.lines)
    lines.push(
      emitStatusCheck(
        `ccjs_fs_access(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, ${mode.expression}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'mkdir') {
    lines.push(
      emitStatusCheck(
        `ccjs_fs_mkdir(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, ${emitFsBooleanFlag(expression, 'fsRecursive')}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'rm') {
    lines.push(
      emitStatusCheck(
        `ccjs_fs_rm(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, ${emitFsBooleanFlag(expression, 'fsRecursive')}, ${emitFsBooleanFlag(expression, 'fsForce')}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  return null
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
  if (descriptor.kind === 'path-out') {
    lines.push(
      emitStatusCheck(
        `${descriptor.callName}(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, &${out})`,
        context
      )
    )
  } else if (descriptor.kind === 'bytes-value-out') {
    const bytes = dependencies.emitCValueExpression(expression.args[1], context)

    appendLines(lines, bytes.lines)
    lines.push(emitRuntimeValueCheck(bytes.expression, 'CCJS_TAG_BYTES', context))
    lines.push(
      emitStatusCheck(
        `${descriptor.callName}(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, ${bytes.expression}, &${out})`,
        context
      )
    )
  } else if (descriptor.kind === 'path-arg-out') {
    const argumentPath = dependencies.emitPreparedStringBytesOperand(
      expression.args[1],
      context,
      fsDescriptorTempPrefix(descriptor)
    )

    appendLines(lines, argumentPath.lines)
    lines.push(
      emitStatusCheck(
        `${descriptor.callName}(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, ${argumentPath.bytes}, ${argumentPath.length}, &${out})`,
        context
      )
    )
  } else {
    const bytes = dependencies.emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_bytes')

    appendLines(lines, bytes.lines)
    lines.push(
      emitStatusCheck(
        `${descriptor.callName}(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, ${bytes.bytes}, ${bytes.length}, &${out})`,
        context
      )
    )
  }

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
  const callName = fsSyncValueCallNameForMethod(method)

  if (callName == null) {
    return null
  }

  const valueType = dependencies.inferExpressionType(expression, context)
  const expectedTag = cRuntimeValueTag(valueType)

  if (expectedTag == null) {
    return null
  }

  const path = dependencies.emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_fs_path')
  const out = nextCName(context, 'ccjs_fs_value')
  registerOwnedValue(context, out)
  const call = `${callName}(&ccjs_default_allocator, ${path.bytes}, ${path.length}, &${out})`
  const lines: string[] = []
  appendLines(lines, path.lines)
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
  const descriptor = fsSyncStatementDescriptorForMethod(method)
  const specialMethod = method === 'accessSync' || method === 'mkdirSync' || method === 'rmSync'

  if (method == null || (descriptor == null && !specialMethod)) {
    return null
  }

  const path = dependencies.emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_fs_path')
  const lines: string[] = []
  appendLines(lines, path.lines)

  if (descriptor != null) {
    return emitPreparedFsSyncStatementDescriptor(expression, context, dependencies, path, lines, descriptor)
  }

  if (method === 'accessSync') {
    const mode = emitPreparedFsAccessModeExpression(expression, context, dependencies)

    appendLines(lines, mode.lines)
    lines.push(emitStatusCheck(`ccjs_fs_access_sync(${path.bytes}, ${path.length}, ${mode.expression})`, context))

    return {
      lines
    }
  }

  if (method === 'mkdirSync') {
    lines.push(
      emitStatusCheck(
        `ccjs_fs_mkdir_sync(${path.bytes}, ${path.length}, ${emitFsBooleanFlag(expression, 'fsRecursive')})`,
        context
      )
    )

    return {
      lines
    }
  }

  if (method === 'rmSync') {
    lines.push(
      emitStatusCheck(
        `ccjs_fs_rm_sync(${path.bytes}, ${path.length}, ${emitFsBooleanFlag(expression, 'fsRecursive')}, ${emitFsBooleanFlag(expression, 'fsForce')})`,
        context
      )
    )

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
    lines.push(emitStatusCheck(`${descriptor.callName}(${path.bytes}, ${path.length})`, context))
  } else if (descriptor.kind === 'bytes-value') {
    const bytes = dependencies.emitCValueExpression(expression.args[1], context)

    appendLines(lines, bytes.lines)
    lines.push(emitRuntimeValueCheck(bytes.expression, 'CCJS_TAG_BYTES', context))
    lines.push(emitStatusCheck(`${descriptor.callName}(${path.bytes}, ${path.length}, ${bytes.expression})`, context))
  } else if (descriptor.kind === 'path-arg') {
    const argumentPath = dependencies.emitPreparedStringBytesOperand(
      expression.args[1],
      context,
      fsDescriptorTempPrefix(descriptor)
    )

    appendLines(lines, argumentPath.lines)
    lines.push(
      emitStatusCheck(
        `${descriptor.callName}(${path.bytes}, ${path.length}, ${argumentPath.bytes}, ${argumentPath.length})`,
        context
      )
    )
  } else {
    const bytes = dependencies.emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_bytes')

    appendLines(lines, bytes.lines)
    lines.push(
      emitStatusCheck(
        `${descriptor.callName}(${path.bytes}, ${path.length}, ${bytes.bytes}, ${bytes.length})`,
        context
      )
    )
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
  if (expression.args[1] == null) {
    return {
      lines: [],
      expression: 'CCJS_FS_F_OK'
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

export function emitPreparedFsStatsMethodExpression(
  expression: AnyNode,
  context: FsFunctionContext,
  dependencies: FsLoweringDependencies
): PreparedExpression | null {
  const method = cFsRuntimeExpressionMethod(expression)

  if (method == null) {
    return null
  }

  if (!isFsStatsRuntimeMethod(method)) {
    return null
  }

  const receiver = dependencies.emitCValueExpression(expression.callee.object, context)
  const helper = fsStatsRuntimeHelper(method)

  return {
    lines: receiver.lines,
    expression: `(${helper}(${receiver.expression}) ? 1 : 0)`
  }
}

function appendLines(target: string[], values: string[]): void {
  for (const value of values) {
    target.push(value)
  }
}

function preparedFsCallOut(options: PreparedCallOptions, context: FsFunctionContext, prefix: string): string {
  const out = options.out

  if (out != null) {
    return out
  }

  return nextCName(context, prefix)
}

function fsPromiseValueType(expression: AnyNode, method: string | null): string {
  if (expression.promiseValueType != null) {
    return expression.promiseValueType
  }

  if (method == null) {
    return 'string'
  }

  const valueType = fsPromiseResultTypeForMethod(method)

  if (valueType != null) {
    return valueType
  }

  return 'string'
}

function fsDescriptorTempPrefix(descriptor: FsAsyncCallDescriptor | FsSyncStatementDescriptor): string {
  if (descriptor.tempPrefix != null) {
    return descriptor.tempPrefix
  }

  return 'ccjs_fs_path'
}

function isFsStatsRuntimeMethod(method: string | null): boolean {
  return (
    method === 'direntIsDirectory' ||
    method === 'direntIsFile' ||
    method === 'statsIsDirectory' ||
    method === 'statsIsFile'
  )
}

function fsStatsRuntimeHelper(method: string | null): string {
  if (method === 'statsIsFile') {
    return 'ccjs_fs_stats_is_file'
  }

  if (method === 'statsIsDirectory') {
    return 'ccjs_fs_stats_is_directory'
  }

  if (method === 'direntIsFile') {
    return 'ccjs_fs_dirent_is_file'
  }

  return 'ccjs_fs_dirent_is_directory'
}
