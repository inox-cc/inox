export function cCryptoRuntimeCallName(callee: any): string | null {
  if (callee?.type !== 'MemberExpression' || callee.object.type !== 'Reference' || callee.object.path.length !== 1) {
    return null
  }

  if (callee.object.path[0] !== 'crypto') {
    return null
  }

  return callee.property === 'getRandomValues' ? callee.property : null
}
