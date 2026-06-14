import { fsRuntimeCallInfoFromPath, isAsyncFsRuntimeMethod } from '../../stdlib/descriptors/fs.ts'
import { memberExpressionPath } from '../../member-paths.ts'

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
