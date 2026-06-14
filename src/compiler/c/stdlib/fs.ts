export function cFsRuntimeExpressionMethod(expression: any): string | null {
  return expression?.fsRuntimeMethod ?? cFsRuntimeCallName(expression?.callee)
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
  const path = cRuntimeMemberExpressionPath(callee)

  if (path == null || path[0] !== 'fs') {
    return null
  }

  if (path.length === 3 && path[1] === 'promises') {
    if (path[2] === 'readdir') {
      return 'readDir'
    }

    return [
      'access',
      'appendFile',
      'copyFile',
      'lstat',
      'mkdir',
      'readFile',
      'readlink',
      'realpath',
      'rename',
      'rm',
      'stat',
      'symlink',
      'unlink',
      'writeFile'
    ].includes(path[2])
      ? path[2]
      : null
  }

  if (path.length !== 2) {
    return null
  }

  if (path[1] === 'readdir') {
    return 'readDir'
  }

  if (path[1] === 'readdirSync') {
    return 'readDirSync'
  }

  return [
    'accessSync',
    'appendFileSync',
    'copyFileSync',
    'lstatSync',
    'mkdirSync',
    'readFileSync',
    'readlinkSync',
    'realpathSync',
    'renameSync',
    'rmSync',
    'statSync',
    'symlinkSync',
    'unlinkSync',
    'writeFileSync'
  ].includes(path[1])
    ? path[1]
    : null
}

function cRuntimeMemberExpressionPath(expression: any): string[] | null {
  if (expression?.type === 'Reference' && expression.path.length > 0) {
    return expression.path
  }

  if (expression?.type !== 'MemberExpression') {
    return null
  }

  const objectPath = cRuntimeMemberExpressionPath(expression.object)

  return objectPath == null ? null : [...objectPath, expression.property]
}
