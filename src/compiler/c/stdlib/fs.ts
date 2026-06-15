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

type PreparedExpression = {
  lines: string[]
  expression: string
  rejectionValueType?: string
}

type PreparedStatement = {
  lines: string[]
}

type PreparedStringBytesOperand = {
  lines: string[]
  bytes: string
  length: string
}

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
      expression.promiseValueType ??
        ([
          'access',
          'appendFile',
          'appendFileBytes',
          'copyFile',
          'mkdir',
          'rename',
          'rm',
          'symlink',
          'unlink',
          'writeFile',
          'writeFileBytes'
        ].includes(method)
          ? 'void'
          : method === 'readDir' || method === 'readDirDirents'
            ? 'array'
            : method === 'stat' || method === 'lstat'
              ? 'object'
              : method === 'realpath' || method === 'readlink'
                ? 'string'
                : method === 'readFileBytes'
                  ? 'bytes'
                  : 'string'),
      'error'
    )
  }
  const path = dependencies.emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_fs_path')
  const lines = [...path.lines]

  if (method === 'readFile') {
    lines.push(
      emitStatusCheck(
        `ccjs_fs_read_file(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'readFileBytes') {
    lines.push(
      emitStatusCheck(
        `ccjs_fs_read_file_bytes(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'readDir') {
    lines.push(
      emitStatusCheck(
        `ccjs_fs_read_dir(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'readDirDirents') {
    lines.push(
      emitStatusCheck(
        `ccjs_fs_read_dir_dirents(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'stat' || method === 'lstat') {
    lines.push(
      emitStatusCheck(
        `ccjs_fs_${method}(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'realpath' || method === 'readlink') {
    lines.push(
      emitStatusCheck(
        `ccjs_fs_${method}(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
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

  if (method === 'appendFileBytes') {
    const bytes = dependencies.emitCValueExpression(expression.args[1], context)

    lines.push(...bytes.lines)
    lines.push(emitRuntimeValueCheck(bytes.expression, 'CCJS_TAG_BYTES', context))
    lines.push(
      emitStatusCheck(
        `ccjs_fs_append_file_bytes(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, ${bytes.expression}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'appendFile') {
    const bytes = dependencies.emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_bytes')

    lines.push(...bytes.lines)
    lines.push(
      emitStatusCheck(
        `ccjs_fs_append_file(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, ${bytes.bytes}, ${bytes.length}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'copyFile') {
    const destPath = dependencies.emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_dest_path')

    lines.push(...destPath.lines)
    lines.push(
      emitStatusCheck(
        `ccjs_fs_copy_file(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, ${destPath.bytes}, ${destPath.length}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'symlink') {
    const linkPath = dependencies.emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_link_path')

    lines.push(...linkPath.lines)
    lines.push(
      emitStatusCheck(
        `ccjs_fs_symlink(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, ${linkPath.bytes}, ${linkPath.length}, &${out})`,
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

  if (method === 'unlink') {
    lines.push(
      emitStatusCheck(
        `ccjs_fs_unlink(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, &${out})`,
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

  if (method === 'rename') {
    const newPath = dependencies.emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_new_path')

    lines.push(...newPath.lines)
    lines.push(
      emitStatusCheck(
        `ccjs_fs_rename(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, ${newPath.bytes}, ${newPath.length}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'writeFileBytes') {
    const bytes = dependencies.emitCValueExpression(expression.args[1], context)

    lines.push(...bytes.lines)
    lines.push(emitRuntimeValueCheck(bytes.expression, 'CCJS_TAG_BYTES', context))
    lines.push(
      emitStatusCheck(
        `ccjs_fs_write_file_bytes(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, ${bytes.expression}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  const bytes = dependencies.emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_bytes')

  lines.push(...bytes.lines)
  lines.push(
    emitStatusCheck(
      `ccjs_fs_write_file(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, ${bytes.bytes}, ${bytes.length}, &${out})`,
      context
    )
  )

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

  if (
    method == null ||
    ![
      'lstatSync',
      'readFileBytesSync',
      'readFileSync',
      'readDirDirentsSync',
      'readDirSync',
      'readlinkSync',
      'realpathSync',
      'statSync'
    ].includes(method)
  ) {
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
  const call =
    method === 'readFileSync'
      ? `ccjs_fs_read_file_sync(&ccjs_default_allocator, ${path.bytes}, ${path.length}, &${out})`
      : method === 'readFileBytesSync'
        ? `ccjs_fs_read_file_bytes_sync(&ccjs_default_allocator, ${path.bytes}, ${path.length}, &${out})`
        : method === 'readDirSync'
          ? `ccjs_fs_read_dir_sync(&ccjs_default_allocator, ${path.bytes}, ${path.length}, &${out})`
          : method === 'readDirDirentsSync'
            ? `ccjs_fs_read_dir_dirents_sync(&ccjs_default_allocator, ${path.bytes}, ${path.length}, &${out})`
            : method === 'realpathSync'
              ? `ccjs_fs_realpath_sync(&ccjs_default_allocator, ${path.bytes}, ${path.length}, &${out})`
              : method === 'readlinkSync'
                ? `ccjs_fs_readlink_sync(&ccjs_default_allocator, ${path.bytes}, ${path.length}, &${out})`
                : method === 'statSync'
                  ? `ccjs_fs_stat_sync(&ccjs_default_allocator, ${path.bytes}, ${path.length}, &${out})`
                  : `ccjs_fs_lstat_sync(&ccjs_default_allocator, ${path.bytes}, ${path.length}, &${out})`

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

  if (
    method == null ||
    ![
      'accessSync',
      'appendFileBytesSync',
      'appendFileSync',
      'copyFileSync',
      'mkdirSync',
      'renameSync',
      'rmSync',
      'symlinkSync',
      'unlinkSync',
      'writeFileBytesSync',
      'writeFileSync'
    ].includes(method)
  ) {
    return null
  }

  const path = dependencies.emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_fs_path')
  const lines = [...path.lines]

  if (method === 'accessSync') {
    const mode = emitPreparedFsAccessModeExpression(expression, context, dependencies)

    lines.push(...mode.lines)
    lines.push(emitStatusCheck(`ccjs_fs_access_sync(${path.bytes}, ${path.length}, ${mode.expression})`, context))

    return {
      lines
    }
  }

  if (method === 'appendFileBytesSync') {
    const bytes = dependencies.emitCValueExpression(expression.args[1], context)

    lines.push(...bytes.lines)
    lines.push(emitRuntimeValueCheck(bytes.expression, 'CCJS_TAG_BYTES', context))
    lines.push(
      emitStatusCheck(`ccjs_fs_append_file_bytes_sync(${path.bytes}, ${path.length}, ${bytes.expression})`, context)
    )

    return {
      lines
    }
  }

  if (method === 'appendFileSync') {
    const bytes = dependencies.emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_bytes')

    lines.push(...bytes.lines)
    lines.push(
      emitStatusCheck(
        `ccjs_fs_append_file_sync(${path.bytes}, ${path.length}, ${bytes.bytes}, ${bytes.length})`,
        context
      )
    )

    return {
      lines
    }
  }

  if (method === 'copyFileSync') {
    const destPath = dependencies.emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_dest_path')

    lines.push(...destPath.lines)
    lines.push(
      emitStatusCheck(
        `ccjs_fs_copy_file_sync(${path.bytes}, ${path.length}, ${destPath.bytes}, ${destPath.length})`,
        context
      )
    )

    return {
      lines
    }
  }

  if (method === 'symlinkSync') {
    const linkPath = dependencies.emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_link_path')

    lines.push(...linkPath.lines)
    lines.push(
      emitStatusCheck(
        `ccjs_fs_symlink_sync(${path.bytes}, ${path.length}, ${linkPath.bytes}, ${linkPath.length})`,
        context
      )
    )

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

  if (method === 'unlinkSync') {
    lines.push(emitStatusCheck(`ccjs_fs_unlink_sync(${path.bytes}, ${path.length})`, context))

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

  if (method === 'renameSync') {
    const newPath = dependencies.emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_new_path')

    lines.push(...newPath.lines)
    lines.push(
      emitStatusCheck(
        `ccjs_fs_rename_sync(${path.bytes}, ${path.length}, ${newPath.bytes}, ${newPath.length})`,
        context
      )
    )

    return {
      lines
    }
  }

  if (method === 'writeFileBytesSync') {
    const bytes = dependencies.emitCValueExpression(expression.args[1], context)

    lines.push(...bytes.lines)
    lines.push(emitRuntimeValueCheck(bytes.expression, 'CCJS_TAG_BYTES', context))
    lines.push(
      emitStatusCheck(`ccjs_fs_write_file_bytes_sync(${path.bytes}, ${path.length}, ${bytes.expression})`, context)
    )

    return {
      lines
    }
  }

  const bytes = dependencies.emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_bytes')

  lines.push(...bytes.lines)
  lines.push(
    emitStatusCheck(`ccjs_fs_write_file_sync(${path.bytes}, ${path.length}, ${bytes.bytes}, ${bytes.length})`, context)
  )

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
