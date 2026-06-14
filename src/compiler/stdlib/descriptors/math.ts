export const mathNullaryMethods = ['random'] as const
export const mathUnaryMethods = ['abs', 'ceil', 'cos', 'floor', 'fround', 'round', 'sin', 'sqrt', 'trunc'] as const
export const mathBinaryMethods = ['max', 'min'] as const

export type MathRuntimeMethod =
  | (typeof mathNullaryMethods)[number]
  | (typeof mathUnaryMethods)[number]
  | (typeof mathBinaryMethods)[number]

const mathNullaryMethodSet = new Set<string>(mathNullaryMethods)
const mathUnaryMethodSet = new Set<string>(mathUnaryMethods)
const mathBinaryMethodSet = new Set<string>(mathBinaryMethods)
const mathRuntimeMethodSet = new Set<string>([...mathNullaryMethods, ...mathUnaryMethods, ...mathBinaryMethods])

export function mathRuntimeMethodNameFromPath(path: readonly string[] | null | undefined): MathRuntimeMethod | null {
  if (path == null || path.length !== 2 || path[0] !== 'Math') {
    return null
  }

  return isMathRuntimeMethod(path[1]) ? path[1] : null
}

export function isMathRuntimeMethod(method: string): method is MathRuntimeMethod {
  return mathRuntimeMethodSet.has(method)
}

export function mathRuntimeArgCount(method: string): number | null {
  if (mathNullaryMethodSet.has(method)) {
    return 0
  }

  if (mathUnaryMethodSet.has(method)) {
    return 1
  }

  return mathBinaryMethodSet.has(method) ? 2 : null
}
