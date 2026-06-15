import { fsRuntimeCallInfoFromPath, isAsyncFsRuntimeMethod } from '../../stdlib/descriptors/fs.ts'
import { memberExpressionPath } from '../../member-paths.ts'
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
import type { CPreparedExpression as PreparedExpression, CPreparedStatement as PreparedStatement, CPreparedStringBytesOperand as PreparedStringBytesOperand } from '../types.ts'




export type FsLoweringDependencies = {
  emitCValueExpression: (expression: any, context: any) => PreparedExpression
  emitPreparedNumberExpression: (expression: any, context: any) => PreparedExpression
  emitPreparedStringBytesOperand: (
    expression: any,
    context: any,
    tempPrefix?: string
  ) => PreparedStringBytesOperand
  inferExpressionType: (expression: any, context: any) => string
}

type FsCallOptions = {
  out?: string
  owned?: boolean
}

const fsPromiseResultTypes: Record<string, string> = {
  access: 'void',
  appendFile: 'void',
  appendFileBytes: 'void',
  copyFile: 'void',
  lstat: 'object',
  mkdir: 'void',
  readDir: 'array',
  readDirDirents: 'array',
  readFile: 'string',
  readFileBytes: 'bytes',
  readlink: 'string',
  realpath: 'string',
  rename: 'void',
  rm: 'void',
  stat: 'object',
  symlink: 'void',
  unlink: 'void',
  writeFile: 'void',
  writeFileBytes: 'void'
}

type FsAsyncCallDescriptor =
  | { kind: 'path-out'; callName: string }
  | { kind: 'bytes-value-out'; callName: string }
  | { kind: 'path-arg-out'; callName: string; tempPrefix: string }
  | { kind: 'string-bytes-out'; callName: string }

const fsAsyncCallDescriptors: Record<string, FsAsyncCallDescriptor> = {
  appendFile: { kind: 'string-bytes-out', callName: 'ccjs_fs_append_file' },
  appendFileBytes: { kind: 'bytes-value-out', callName: 'ccjs_fs_append_file_bytes' },
  copyFile: { kind: 'path-arg-out', callName: 'ccjs_fs_copy_file', tempPrefix: 'ccjs_fs_dest_path' },
  lstat: { kind: 'path-out', callName: 'ccjs_fs_lstat' },
  readDir: { kind: 'path-out', callName: 'ccjs_fs_read_dir' },
  readDirDirents: { kind: 'path-out', callName: 'ccjs_fs_read_dir_dirents' },
  readFile: { kind: 'path-out', callName: 'ccjs_fs_read_file' },
  readFileBytes: { kind: 'path-out', callName: 'ccjs_fs_read_file_bytes' },
  readlink: { kind: 'path-out', callName: 'ccjs_fs_readlink' },
  realpath: { kind: 'path-out', callName: 'ccjs_fs_realpath' },
  rename: { kind: 'path-arg-out', callName: 'ccjs_fs_rename', tempPrefix: 'ccjs_fs_new_path' },
  stat: { kind: 'path-out', callName: 'ccjs_fs_stat' },
  symlink: { kind: 'path-arg-out', callName: 'ccjs_fs_symlink', tempPrefix: 'ccjs_fs_link_path' },
  unlink: { kind: 'path-out', callName: 'ccjs_fs_unlink' },
  writeFile: { kind: 'string-bytes-out', callName: 'ccjs_fs_write_file' },
  writeFileBytes: { kind: 'bytes-value-out', callName: 'ccjs_fs_write_file_bytes' }
}

const fsSyncValueCallNames: Record<string, string> = {
  lstatSync: 'ccjs_fs_lstat_sync',
  readDirDirentsSync: 'ccjs_fs_read_dir_dirents_sync',
  readDirSync: 'ccjs_fs_read_dir_sync',
  readFileBytesSync: 'ccjs_fs_read_file_bytes_sync',
  readFileSync: 'ccjs_fs_read_file_sync',
  readlinkSync: 'ccjs_fs_readlink_sync',
  realpathSync: 'ccjs_fs_realpath_sync',
  statSync: 'ccjs_fs_stat_sync'
}

type FsSyncStatementDescriptor =
  | { kind: 'path'; callName: string }
  | { kind: 'bytes-value'; callName: string }
  | { kind: 'path-arg'; callName: string; tempPrefix: string }
  | { kind: 'string-bytes'; callName: string }

const fsSyncStatementDescriptors: Record<string, FsSyncStatementDescriptor> = {
  appendFileBytesSync: { kind: 'bytes-value', callName: 'ccjs_fs_append_file_bytes_sync' },
  appendFileSync: { kind: 'string-bytes', callName: 'ccjs_fs_append_file_sync' },
  copyFileSync: { kind: 'path-arg', callName: 'ccjs_fs_copy_file_sync', tempPrefix: 'ccjs_fs_dest_path' },
  renameSync: { kind: 'path-arg', callName: 'ccjs_fs_rename_sync', tempPrefix: 'ccjs_fs_new_path' },
  symlinkSync: { kind: 'path-arg', callName: 'ccjs_fs_symlink_sync', tempPrefix: 'ccjs_fs_link_path' },
  unlinkSync: { kind: 'path', callName: 'ccjs_fs_unlink_sync' },
  writeFileBytesSync: { kind: 'bytes-value', callName: 'ccjs_fs_write_file_bytes_sync' },
  writeFileSync: { kind: 'string-bytes', callName: 'ccjs_fs_write_file_sync' }
}

export function cFsRuntimeExpressionMethod(expression: any): string | null {
  return expression?.fsRuntimeMethod ?? cFsRuntimeCallName(expression?.callee)
}

export function isAsyncFsRuntimeCallExpression(expression: any): boolean {
  const method = cFsRuntimeExpressionMethod(expression)

  return method != null && expression?.valueType === 'promise' && isAsyncFsRuntimeMethod(method)
}

export function cFsRuntimeConstantExpression(expression: any): string | null {
  const name = expression?.fsRuntimeConstant

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

function cFsRuntimeCallName(callee: any): string | null {
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
  expression: any,
  context: any,
  dependencies: FsLoweringDependencies,
  options: FsCallOptions = {}
): PreparedExpression | null {
  const method = cFsRuntimeExpressionMethod(expression)

  if (method == null || expression?.valueType !== 'promise') {
    return null
  }

  registerEventLoop(context)

  const out = options.out ?? nextCName(context, 'ccjs_promise')
  if (options.owned !== false) {
    registerOwnedPromise(
      context,
      out,
      expression.promiseValueType ?? fsPromiseResultTypes[method] ?? 'string',
      'error'
    )
  }
  const path = dependencies.emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_fs_path')
  const lines = [...path.lines]
  const descriptor = fsAsyncCallDescriptors[method]

  if (descriptor != null) {
    return emitPreparedFsAsyncDescriptorExpression(expression, context, dependencies, path, lines, out, descriptor)
  }

  if (method === 'access') {
    const mode = emitPreparedFsAccessModeExpression(expression, context, dependencies)

    lines.push(...mode.lines)
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
  expression: any,
  context: any,
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

    lines.push(...bytes.lines)
    lines.push(emitRuntimeValueCheck(bytes.expression, 'CCJS_TAG_BYTES', context))
    lines.push(
      emitStatusCheck(
        `${descriptor.callName}(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, ${bytes.expression}, &${out})`,
        context
      )
    )
  } else if (descriptor.kind === 'path-arg-out') {
    const argumentPath = dependencies.emitPreparedStringBytesOperand(expression.args[1], context, descriptor.tempPrefix)

    lines.push(...argumentPath.lines)
    lines.push(
      emitStatusCheck(
        `${descriptor.callName}(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, ${argumentPath.bytes}, ${argumentPath.length}, &${out})`,
        context
      )
    )
  } else {
    const bytes = dependencies.emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_bytes')

    lines.push(...bytes.lines)
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
  expression: any,
  context: any,
  dependencies: FsLoweringDependencies
): PreparedExpression | null {
  const method = cFsRuntimeExpressionMethod(expression)

  const callName = method == null ? null : fsSyncValueCallNames[method]

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

  return {
    lines: [
      ...path.lines,
      ...emitPrepareOwnedValueWrite(out),
      emitStatusCheck(call, context),
      emitRuntimeValueCheck(out, expectedTag, context)
    ],
    expression: out
  }
}

export function emitPreparedFsSyncStatementExpression(
  expression: any,
  context: any,
  dependencies: FsLoweringDependencies
): PreparedStatement | null {
  const method = cFsRuntimeExpressionMethod(expression)
  const descriptor = method == null ? null : fsSyncStatementDescriptors[method]
  const specialMethod = method === 'accessSync' || method === 'mkdirSync' || method === 'rmSync'

  if (method == null || (descriptor == null && !specialMethod)) {
    return null
  }

  const path = dependencies.emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_fs_path')
  const lines = [...path.lines]

  if (descriptor != null) {
    return emitPreparedFsSyncStatementDescriptor(expression, context, dependencies, path, lines, descriptor)
  }

  if (method === 'accessSync') {
    const mode = emitPreparedFsAccessModeExpression(expression, context, dependencies)

    lines.push(...mode.lines)
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
  expression: any,
  context: any,
  dependencies: FsLoweringDependencies,
  path: PreparedStringBytesOperand,
  lines: string[],
  descriptor: FsSyncStatementDescriptor
): PreparedStatement {
  if (descriptor.kind === 'path') {
    lines.push(emitStatusCheck(`${descriptor.callName}(${path.bytes}, ${path.length})`, context))
  } else if (descriptor.kind === 'bytes-value') {
    const bytes = dependencies.emitCValueExpression(expression.args[1], context)

    lines.push(...bytes.lines)
    lines.push(emitRuntimeValueCheck(bytes.expression, 'CCJS_TAG_BYTES', context))
    lines.push(emitStatusCheck(`${descriptor.callName}(${path.bytes}, ${path.length}, ${bytes.expression})`, context))
  } else if (descriptor.kind === 'path-arg') {
    const argumentPath = dependencies.emitPreparedStringBytesOperand(expression.args[1], context, descriptor.tempPrefix)

    lines.push(...argumentPath.lines)
    lines.push(
      emitStatusCheck(
        `${descriptor.callName}(${path.bytes}, ${path.length}, ${argumentPath.bytes}, ${argumentPath.length})`,
        context
      )
    )
  } else {
    const bytes = dependencies.emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_bytes')

    lines.push(...bytes.lines)
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
  expression: any,
  context: any,
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

export function emitFsBooleanFlag(expression: any, field: string): string {
  return expression?.[field] === true ? 'true' : 'false'
}

export function emitPreparedFsStatsMethodExpression(
  expression: any,
  context: any,
  dependencies: FsLoweringDependencies
): PreparedExpression | null {
  const method = cFsRuntimeExpressionMethod(expression)

  if (method == null || !['direntIsDirectory', 'direntIsFile', 'statsIsDirectory', 'statsIsFile'].includes(method)) {
    return null
  }

  const receiver = dependencies.emitCValueExpression(expression.callee.object, context)
  const helper =
    method === 'statsIsFile'
      ? 'ccjs_fs_stats_is_file'
      : method === 'statsIsDirectory'
        ? 'ccjs_fs_stats_is_directory'
        : method === 'direntIsFile'
          ? 'ccjs_fs_dirent_is_file'
          : 'ccjs_fs_dirent_is_directory'

  return {
    lines: receiver.lines,
    expression: `(${helper}(${receiver.expression}) ? 1 : 0)`
  }
}
