import {
  isTimerClearMethod,
  isTimerStartMethod,
  timerRuntimeMethodNameFromPath
} from '../../stdlib/descriptors/timers.ts'

export function cTimerRuntimeCallName(callee: any): string | null {
  if (callee?.type !== 'Reference' || callee.path.length !== 1) {
    return null
  }

  return timerRuntimeMethodNameFromPath(callee.path)
}

export function cTimerStartCallName(callee: any): string | null {
  if (callee?.type !== 'Reference' || callee.path.length !== 1) {
    return null
  }

  return isTimerStartMethod(callee.path[0]) ? callee.path[0] : null
}

export function cTimerClearCallName(callee: any): string | null {
  if (callee?.type !== 'Reference' || callee.path.length !== 1) {
    return null
  }

  return isTimerClearMethod(callee.path[0]) ? callee.path[0] : null
}

export function isTimerStartCallExpression(expression: any): boolean {
  if (expression?.type !== 'CallExpression') {
    return false
  }

  return cTimerStartCallName(expression.callee) != null || expression.timerRuntimeMethod?.startsWith('set') === true
}

export function timerCallbackFunctionType(): any {
  return {
    kind: 'function',
    params: [],
    returnType: 'void',
    returnNullable: false
  }
}
