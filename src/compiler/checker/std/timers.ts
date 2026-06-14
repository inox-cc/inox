import {
  isTimerClearMethod,
  timerRuntimeMethodNameFromPath
} from '../../stdlib/descriptors/timers.ts'
import type { AnyNode } from '../../types.ts'

export function timerRuntimeMethodName(callee: AnyNode): string | null {
  if (callee.type !== 'Reference' || callee.path.length !== 1) {
    return null
  }

  return timerRuntimeMethodNameFromPath(callee.path)
}

export function timerClearMethodName(method: string): string | null {
  return isTimerClearMethod(method) ? method : null
}

export function timerCallbackFunctionType(): AnyNode {
  return {
    kind: 'function',
    params: [],
    returnType: 'void',
    returnNullable: false
  }
}
