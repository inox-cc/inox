import {
  mathBinaryMethods,
  mathNullaryMethods,
  mathRuntimeMethodNameFromPath,
  mathUnaryMethods
} from '../stdlib/descriptors/math.ts'
import { memberExpressionPath } from '../member-paths.ts'

export const cMathNullaryMethods = new Set(mathNullaryMethods)
export const cMathUnaryMethods = new Set(mathUnaryMethods)
export const cMathBinaryMethods = new Set(mathBinaryMethods)

export function mathRuntimeMethodName(callee: any): string | null {
  return mathRuntimeMethodNameFromPath(memberExpressionPath(callee))
}
