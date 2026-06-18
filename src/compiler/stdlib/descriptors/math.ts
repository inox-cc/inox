export const mathNullaryMethods: string[] = ['random']
export const mathUnaryMethods: string[] = ['abs', 'ceil', 'cos', 'floor', 'fround', 'round', 'sin', 'sqrt', 'trunc']
export const mathBinaryMethods: string[] = ['max', 'min']

export type MathRuntimeMethod = string

export function mathRuntimeMethodNameFromPath(path: string[]): MathRuntimeMethod | null {
  if (path.length !== 2 || path[0] !== 'Math') {
    return null
  }

  if (isMathRuntimeMethod(path[1])) {
    return path[1]
  }

  return null
}

export function isMathRuntimeMethod(method: string): boolean {
  return (
    hasString(mathNullaryMethods, method) ||
    hasString(mathUnaryMethods, method) ||
    hasString(mathBinaryMethods, method)
  )
}

export function mathRuntimeArgCount(method: string): number | null {
  if (hasString(mathNullaryMethods, method)) {
    return 0
  }

  if (hasString(mathUnaryMethods, method)) {
    return 1
  }

  if (hasString(mathBinaryMethods, method)) {
    return 2
  }

  return null
}

export function knownMathRuntimeArgCount(method: string): number {
  if (hasString(mathNullaryMethods, method)) {
    return 0
  }

  if (hasString(mathUnaryMethods, method)) {
    return 1
  }

  return 2
}

function hasString(values: string[], expected: string): boolean {
  for (const value of values) {
    if (value === expected) {
      return true
    }
  }

  return false
}
