import {
  mathBinaryMethods,
  mathNullaryMethods,
  mathRuntimeMethodNameFromPath,
  mathUnaryMethods
} from '../stdlib/descriptors/math.ts'

export const cMathNullaryMethods = new Set(mathNullaryMethods)
export const cMathUnaryMethods = new Set(mathUnaryMethods)
export const cMathBinaryMethods = new Set(mathBinaryMethods)

export function mathRuntimeMethodName(callee: any): string | null {
  if (callee?.type !== 'MemberExpression' || callee.object.type !== 'Reference' || callee.object.path.length !== 1) {
    return null
  }

  return mathRuntimeMethodNameFromPath([callee.object.path[0], callee.property])
}
