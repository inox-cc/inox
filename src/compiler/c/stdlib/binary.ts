export function binaryRuntimeMethodName(callee: any): string | null {
  if (callee?.type !== 'MemberExpression') {
    return null
  }

  if (callee.object?.type === 'Reference' && callee.object.path.length === 1 && callee.object.path[0] === 'Buffer') {
    return ['alloc', 'from'].includes(callee.property) ? callee.property : null
  }

  return ['slice', 'toString'].includes(callee.property) ? callee.property : null
}

export function isBinaryRuntimeCall(expression: any): boolean {
  return (
    expression?.type === 'CallExpression' &&
    typeof expression.binaryRuntimeMethod === 'string' &&
    binaryRuntimeMethodName(expression.callee) === expression.binaryRuntimeMethod
  )
}

export function isBufferFromCall(expression: any): boolean {
  return isBinaryRuntimeCall(expression) && expression.binaryRuntimeMethod === 'from'
}

export function isBufferAllocCall(expression: any): boolean {
  return isBinaryRuntimeCall(expression) && expression.binaryRuntimeMethod === 'alloc'
}

export function isBinaryConstructorExpression(expression: any): boolean {
  return (
    expression?.type === 'NewExpression' &&
    expression.callee.type === 'Reference' &&
    expression.callee.path.length === 1 &&
    expression.callee.path[0] === 'Uint8Array' &&
    expression.valueType === 'bytes'
  )
}
