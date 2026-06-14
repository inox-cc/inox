export function cPromiseRuntimeCallName(callee: any): string | null {
  if (callee?.type !== 'MemberExpression' || callee.object.type !== 'Reference' || callee.object.path.length !== 1) {
    return null
  }

  if (callee.object.path[0] !== 'Promise') {
    return null
  }

  return ['resolve', 'reject'].includes(callee.property) ? callee.property : null
}
