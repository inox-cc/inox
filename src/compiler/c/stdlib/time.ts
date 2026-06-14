export function cTimeRuntimeCallName(callee: any): string | null {
  if (callee?.type !== 'MemberExpression' || callee.object.type !== 'Reference' || callee.object.path.length !== 1) {
    return null
  }

  if (callee.object.path[0] === 'Date' && callee.property === 'now') {
    return 'ccjs_date_now'
  }

  if (callee.object.path[0] === 'performance' && callee.property === 'now') {
    return 'ccjs_performance_now'
  }

  return null
}
