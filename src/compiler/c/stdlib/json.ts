export function cJsonRuntimeCallName(callee: any): string | null {
  if (callee?.type !== 'MemberExpression' || callee.object.type !== 'Reference' || callee.object.path.length !== 1) {
    return null
  }

  if (callee.object.path[0] !== 'JSON') {
    return null
  }

  return ['parse', 'stringify'].includes(callee.property) ? callee.property : null
}
