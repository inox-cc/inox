import { memberExpressionPath } from '../member-paths.ts'
import { mathRuntimeMethodNameFromPath } from '../stdlib/descriptors/math.ts'
import type { AnyNode } from '../types.ts'

export const cMathNullaryMethods = new Set(['random'])
export const cMathUnaryMethods = new Set(['abs', 'ceil', 'cos', 'floor', 'fround', 'round', 'sin', 'sqrt', 'trunc'])
export const cMathBinaryMethods = new Set(['max', 'min'])

export function mathRuntimeMethodName(callee: AnyNode): string | null {
  return mathRuntimeMethodNameFromPath(memberExpressionPath(callee))
}
