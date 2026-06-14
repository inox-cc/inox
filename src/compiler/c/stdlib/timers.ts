export function cTimerRuntimeCallName(callee: any): string | null {
  if (callee?.type !== 'Reference' || callee.path.length !== 1) {
    return null
  }

  return cTimerStartCallName(callee) ?? cTimerClearCallName(callee)
}

export function cTimerStartCallName(callee: any): string | null {
  if (callee?.type !== 'Reference' || callee.path.length !== 1) {
    return null
  }

  return ['setImmediate', 'setInterval', 'setTimeout'].includes(callee.path[0]) ? callee.path[0] : null
}

export function cTimerClearCallName(callee: any): string | null {
  if (callee?.type !== 'Reference' || callee.path.length !== 1) {
    return null
  }

  return ['clearImmediate', 'clearInterval', 'clearTimeout'].includes(callee.path[0]) ? callee.path[0] : null
}

export function timerCallbackFunctionType(): any {
  return {
    kind: 'function',
    params: [],
    returnType: 'void',
    returnNullable: false
  }
}
