import {
  isTimerClearMethod,
  isTimerStartMethod,
  timerRuntimeMethodNameFromPath
} from '../../stdlib/descriptors/timers.ts'
import { diagnostic } from '../../diagnostics.ts'

type PreparedExpression = {
  lines: string[]
  expression: string
}

export type TimerDeclarationDependencies = {
  emitPreparedTimerCallExpression: (expression: any, context: any, options?: any) => PreparedExpression | null
  emitPreparedTimerHandleExpression: (expression: any, context: any) => PreparedExpression
}

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

export function emitTimerVariableDeclaration(
  statement: any,
  context: any,
  dependencies: TimerDeclarationDependencies,
  inferred?: string
): string[] | null {
  if (inferred == null) {
    if (statement.init?.type === 'CallExpression' && isTimerStartCallExpression(statement.init)) {
      const timerCall = dependencies.emitPreparedTimerCallExpression(statement.init, context, {
        out: statement.name
      })

      if (timerCall != null) {
        context.variables.set(statement.name, 'timer')

        return [`ccjs_timer_handle* ${statement.name} = 0;`, ...timerCall.lines]
      }
    }

    if (statement.init?.type === 'CallExpression' && cTimerClearCallName(statement.init.callee) != null) {
      context.diagnostics.push(
        diagnostic('CCJS_C_TIMER_HANDLE', 'timer clear calls return void and cannot initialize a value', statement.loc)
      )
      context.variables.set(statement.name, 'timer')

      return [`ccjs_timer_handle* ${statement.name} = 0;`]
    }

    return null
  }

  if (inferred !== 'timer') {
    return null
  }

  const handle = dependencies.emitPreparedTimerHandleExpression(statement.init, context)

  context.variables.set(statement.name, 'timer')

  return [...handle.lines, `ccjs_timer_handle* ${statement.name} = ${handle.expression};`]
}
