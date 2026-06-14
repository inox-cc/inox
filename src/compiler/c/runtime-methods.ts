export const cMathNullaryMethods = new Set(['random'])
export const cMathUnaryMethods = new Set(['abs', 'ceil', 'cos', 'floor', 'fround', 'round', 'sin', 'sqrt', 'trunc'])
export const cMathBinaryMethods = new Set(['max', 'min'])

export function mathRuntimeMethodName(callee: any): string | null {
  if (callee?.type !== 'MemberExpression' || callee.object.type !== 'Reference' || callee.object.path.length !== 1) {
    return null
  }

  if (callee.object.path[0] !== 'Math') {
    return null
  }

  return cMathNullaryMethods.has(callee.property) ||
    cMathUnaryMethods.has(callee.property) ||
    cMathBinaryMethods.has(callee.property)
    ? callee.property
    : null
}
