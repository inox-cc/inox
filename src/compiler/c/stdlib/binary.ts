import {
  binaryConstructorNameFromPath,
  binaryInstanceRuntimeMethodName,
  binaryRuntimeReturnType,
  binaryStaticRuntimeMethodNameFromPath
} from '../../stdlib/descriptors/binary.ts'

export function binaryRuntimeMethodName(callee: any): string | null {
  if (callee?.type !== 'MemberExpression') {
    return null
  }

  if (callee.object?.type === 'Reference' && callee.object.path.length === 1 && callee.object.path[0] === 'Buffer') {
    return binaryStaticRuntimeMethodNameFromPath([callee.object.path[0], callee.property])
  }

  return binaryInstanceRuntimeMethodName(callee.property)
}

export function isBinaryRuntimeCall(expression: any): boolean {
  return expression?.type === 'CallExpression' && typeof expression.binaryRuntimeMethod === 'string'
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
    binaryConstructorNameFromPath(expression.callee.path) != null &&
    expression.valueType === 'bytes'
  )
}

export function binaryRuntimeExpressionReturnType(expression: any): 'bytes' | 'string' | null {
  return typeof expression?.binaryRuntimeMethod === 'string'
    ? binaryRuntimeReturnType(expression.binaryRuntimeMethod)
    : null
}
