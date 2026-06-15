import {
  isTimerClearMethod,
  isTimerStartMethod,
  timerRuntimeMethodNameFromPath
} from '../../stdlib/descriptors/timers.ts'
import { diagnostic } from '../../diagnostics.ts'
import {
  emitEventLoopReference,
  emitFailureStatement,
  emitStatusCheck,
  nextCName,
  registerEventLoop,
  type CFunctionContext
} from '../context.ts'
import type {
  CPreparedCallOptions as PreparedCallOptions,
  CPreparedExpression as PreparedExpression
} from '../types.ts'

export type TimerLoweringDependencies = {
  emitPreparedNumberExpression: (expression: any, context: CFunctionContext) => PreparedExpression
  emitReference: (expression: any, context: CFunctionContext) => string
  emitRuntimeCallbackValue: (expression: any, functionType: any, context: CFunctionContext) => PreparedExpression
}

type TimerStartCallDescriptor = {
  callName: string
  delay: boolean
  requiresHandle: boolean
}

const timerStartCallDescriptors: Record<string, TimerStartCallDescriptor> = {
  setImmediate: {
    callName: 'ccjs_loop_queue_immediate',
    delay: false,
    requiresHandle: false
  },
  setInterval: {
    callName: 'ccjs_loop_set_interval',
    delay: true,
    requiresHandle: true
  },
  setTimeout: {
    callName: 'ccjs_loop_set_timeout',
    delay: true,
    requiresHandle: false
  }
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
  context: CFunctionContext,
  dependencies: TimerLoweringDependencies,
  inferred?: string
): string[] | null {
  if (inferred == null) {
    if (statement.init?.type === 'CallExpression' && isTimerStartCallExpression(statement.init)) {
      const timerCall = emitPreparedTimerCallExpression(statement.init, context, dependencies, {
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

  const handle = emitPreparedTimerHandleExpression(statement.init, context, dependencies)

  context.variables.set(statement.name, 'timer')

  return [...handle.lines, `ccjs_timer_handle* ${statement.name} = ${handle.expression};`]
}

export function emitPreparedTimerCallExpression(
  expression: any,
  context: CFunctionContext,
  dependencies: TimerLoweringDependencies,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  const method = expression?.timerRuntimeMethod ?? cTimerRuntimeCallName(expression?.callee)

  if (method == null) {
    return null
  }

  const clearMethod = method.startsWith('clear') ? method : cTimerClearCallName(expression.callee)

  if (clearMethod != null) {
    const handle = emitPreparedTimerHandleExpression(expression.args[0], context, dependencies)

    return {
      lines: [...handle.lines, `ccjs_loop_clear_timer(${handle.expression});`],
      expression: ''
    }
  }

  const descriptor = timerStartCallDescriptors[method]

  if (descriptor == null) {
    return null
  }

  if (context.statusReturn && !context.externalEventLoop) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_TIMER_CALLBACK',
        'timer calls inside runtime callbacks need callback loop capture and are not supported by the current C backend slice',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: ''
    }
  }

  if (descriptor.requiresHandle && options.out == null && options.asValue !== true) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_TIMER_HANDLE',
        'setInterval requires a timer handle so it can be cleared by the current C backend slice',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: ''
    }
  }

  registerEventLoop(context)

  const out = options.out ?? (options.asValue === true ? nextCName(context, 'ccjs_timer_handle') : null)
  const callback = dependencies.emitRuntimeCallbackValue(expression.args[0], timerCallbackFunctionType(), context)
  const callbackContext = nextCName(context, 'ccjs_timer_ctx')
  const lines = [
    ...(out != null && options.out == null ? [`ccjs_timer_handle* ${out} = 0;`] : []),
    ...callback.lines,
    `ccjs_value* ${callbackContext} = ccjs_default_alloc(0, sizeof(ccjs_value), _Alignof(ccjs_value));`,
    `if (${callbackContext} == 0) ${emitFailureStatement(context)}`,
    `*${callbackContext} = ${callback.expression};`,
    `ccjs_retain(*${callbackContext});`
  ]
  const outArgument = out == null ? '0' : `&${out}`

  if (!descriptor.delay) {
    lines.push(
      `if (${descriptor.callName}(${emitEventLoopReference(context)}, ccjs_timer_callback_run, ${callbackContext}, ccjs_timer_callback_finalize, ${outArgument}) != CCJS_OK) {`
    )
    lines.push(`  ccjs_timer_callback_finalize(${callbackContext});`)
    lines.push(`  ${emitFailureStatement(context)}`)
    lines.push('}')

    return {
      lines,
      expression: out ?? ''
    }
  }

  const delay = dependencies.emitPreparedNumberExpression(expression.args[1], context)

  lines.push(...delay.lines)
  lines.push(
    `if (${descriptor.callName}(${emitEventLoopReference(context)}, ${delay.expression}, ccjs_timer_callback_run, ${callbackContext}, ccjs_timer_callback_finalize, ${outArgument}) != CCJS_OK) {`
  )
  lines.push(`  ccjs_timer_callback_finalize(${callbackContext});`)
  lines.push(`  ${emitFailureStatement(context)}`)
  lines.push('}')

  return {
    lines,
    expression: out ?? ''
  }
}

export function emitPreparedTimerHandleExpression(
  expression: any,
  context: CFunctionContext,
  dependencies: TimerLoweringDependencies
): PreparedExpression {
  if (
    expression?.type === 'Reference' &&
    expression.path.length === 1 &&
    context.variables.get(expression.path[0]) === 'timer'
  ) {
    return {
      lines: [],
      expression: dependencies.emitReference(expression, context)
    }
  }

  if (
    expression?.type === 'CallExpression' &&
    (cTimerStartCallName(expression.callee) != null || expression.timerRuntimeMethod?.startsWith('set'))
  ) {
    const call = emitPreparedTimerCallExpression(expression, context, dependencies, {
      asValue: true
    })

    if (call != null) {
      return call
    }
  }

  context.diagnostics.push(
    diagnostic('CCJS_C_TIMER_HANDLE', 'timer clear calls require a timer handle value', expression?.loc)
  )

  return {
    lines: [],
    expression: '0'
  }
}
