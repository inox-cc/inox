import {
  isTimerClearMethod,
  isTimerStartMethod,
  timerRuntimeMethodNameFromPath
} from '../../stdlib/descriptors/timers.ts'
import { diagnostic } from '../../diagnostics.ts'
import type { AnyNode } from '../../types.ts'
import {
  emitEventLoopReference,
  emitFailureStatement,
  emitStatusCheck,
  nextCName,
  registerEventLoop
} from '../context.ts'
import type {
  CFunctionType,
  CPreparedCallOptions as PreparedCallOptions,
  CPreparedExpression as PreparedExpression
} from '../types.ts'

type TimerFunctionContext = {
  cleanupEnabled: boolean
  diagnostics: AnyNode[]
  eventLoopUsed: boolean
  externalEventLoop: boolean
  failureStatement?: string | null
  failureStatementUsed?: boolean
  nextId: number
  returnType?: string
  statusReturn: boolean
  throwingFunction: boolean
  usedCleanupGoto: boolean
  variables: Map<string, string>
}

export type TimerLoweringDependencies = {
  emitPreparedNumberExpression(expression: AnyNode, context: TimerFunctionContext): PreparedExpression
  emitReference(expression: AnyNode, context: TimerFunctionContext): string
  emitRuntimeCallbackValue(
    expression: AnyNode,
    functionType: CFunctionType | null | undefined,
    context: TimerFunctionContext
  ): PreparedExpression
}

export function cTimerRuntimeCallName(callee: AnyNode | null | undefined): string | null {
  if (callee === null || typeof callee === 'undefined' || callee.type !== 'Reference' || callee.path.length !== 1) {
    return null
  }

  return timerRuntimeMethodNameFromPath(callee.path)
}

export function cTimerStartCallName(callee: AnyNode | null | undefined): string | null {
  if (callee === null || typeof callee === 'undefined' || callee.type !== 'Reference' || callee.path.length !== 1) {
    return null
  }

  if (isTimerStartMethod(callee.path[0])) {
    return callee.path[0]
  }

  return null
}

export function cTimerClearCallName(callee: AnyNode | null | undefined): string | null {
  if (callee === null || typeof callee === 'undefined' || callee.type !== 'Reference' || callee.path.length !== 1) {
    return null
  }

  if (isTimerClearMethod(callee.path[0])) {
    return callee.path[0]
  }

  return null
}

export function isTimerStartCallExpression(expression: AnyNode | null | undefined): boolean {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'CallExpression') {
    return false
  }

  return !!cTimerStartCallName(expression.callee) || timerRuntimeMethodStartsWithSet(expression)
}

function timerStartCallNameFor(method: string | null): string | null {
  if (method === 'setImmediate') {
    return 'inox_loop_queue_immediate'
  }

  if (method === 'setInterval') {
    return 'inox_loop_set_interval'
  }

  if (method === 'setTimeout') {
    return 'inox_loop_set_timeout'
  }

  return null
}

function timerStartCallHasDelay(method: string | null): boolean {
  return method === 'setInterval' || method === 'setTimeout'
}

function timerStartCallRequiresHandle(method: string | null): boolean {
  return method === 'setInterval'
}

function timerRuntimeMethodForExpression(expression: AnyNode | null | undefined): string | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  if (expression.timerRuntimeMethod !== null && typeof expression.timerRuntimeMethod !== 'undefined') {
    return expression.timerRuntimeMethod
  }

  return cTimerRuntimeCallName(expression.callee)
}

function timerRuntimeMethodStartsWithSet(expression: AnyNode | null | undefined): boolean {
  if (expression === null || typeof expression === 'undefined') {
    return false
  }

  if (expression.timerRuntimeMethod === null || typeof expression.timerRuntimeMethod === 'undefined') {
    return false
  }

  return expression.timerRuntimeMethod.startsWith('set')
}

function appendTimerLines(target: string[], lines: string[]): void {
  for (const line of lines) {
    target.push(line)
  }
}

function timerOutName(options: PreparedCallOptions, context: TimerFunctionContext): string | null {
  if (options.out !== null && typeof options.out !== 'undefined') {
    return options.out
  }

  if (options.asValue === true) {
    return nextCName(context, 'inox_timer_handle')
  }

  return null
}

function timerOutArgument(out: string | null): string {
  if (out === null || typeof out === 'undefined') {
    return '0'
  }

  return `&${out}`
}

function timerOutExpression(out: string | null): string {
  let expression = ''

  if (out !== null && typeof out !== 'undefined') {
    expression = out
  }

  return expression
}

export function timerCallbackFunctionType(): CFunctionType {
  return {
    kind: 'function',
    params: [],
    returnType: 'void',
    returnNullable: false
  }
}

export function emitTimerVariableDeclaration(
  statement: AnyNode,
  context: TimerFunctionContext,
  dependencies: TimerLoweringDependencies,
  inferred: string | null = null
): string[] | null {
  if (inferred === null || typeof inferred === 'undefined') {
    const init = statement.init

    if (
      init !== null &&
      typeof init !== 'undefined' &&
      init.type === 'CallExpression' &&
      isTimerStartCallExpression(init)
    ) {
      const timerCall = emitPreparedTimerCallExpression(init, context, dependencies, {
        out: statement.name
      })

      if (timerCall !== null && typeof timerCall !== 'undefined') {
        const lines = [`inox_timer_handle* ${statement.name} = 0;`]
        appendTimerLines(lines, timerCall.lines)
        context.variables.set(statement.name, 'timer')

        return lines
      }
    }

    if (
      init !== null &&
      typeof init !== 'undefined' &&
      init.type === 'CallExpression' &&
      cTimerClearCallName(init.callee)
    ) {
      context.diagnostics.push(
        diagnostic('INOX_C_TIMER_HANDLE', 'timer clear calls return void and cannot initialize a value', statement.loc)
      )
      context.variables.set(statement.name, 'timer')

      return [`inox_timer_handle* ${statement.name} = 0;`]
    }

    return null
  }

  if (inferred !== 'timer') {
    return null
  }

  const handle = emitPreparedTimerHandleExpression(statement.init, context, dependencies)
  const lines: string[] = []

  appendTimerLines(lines, handle.lines)
  lines.push(`inox_timer_handle* ${statement.name} = ${handle.expression};`)

  context.variables.set(statement.name, 'timer')

  return lines
}

export function emitPreparedTimerCallExpression(
  expression: AnyNode,
  context: TimerFunctionContext,
  dependencies: TimerLoweringDependencies,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  const method = timerRuntimeMethodForExpression(expression)

  if (method === null || typeof method === 'undefined') {
    return null
  }

  let clearMethod: string | null = null

  if (method.startsWith('clear')) {
    clearMethod = method
  } else {
    clearMethod = cTimerClearCallName(expression.callee)
  }

  if (clearMethod !== null && typeof clearMethod !== 'undefined') {
    const handle = emitPreparedTimerHandleExpression(expression.args[0], context, dependencies)
    const lines: string[] = []

    appendTimerLines(lines, handle.lines)
    lines.push(`inox_loop_clear_timer(${handle.expression});`)

    return {
      lines: lines,
      expression: ''
    }
  }

  const callName = timerStartCallNameFor(method)

  if (callName === null || typeof callName === 'undefined') {
    return null
  }

  if (context.statusReturn && !context.externalEventLoop) {
    context.diagnostics.push(
      diagnostic(
        'INOX_C_TIMER_CALLBACK',
        'timer calls inside runtime callbacks need callback loop capture and are not supported by the current C backend slice',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: ''
    }
  }

  if (
    timerStartCallRequiresHandle(method) &&
    (options.out === null || typeof options.out === 'undefined') &&
    options.asValue !== true
  ) {
    context.diagnostics.push(
      diagnostic(
        'INOX_C_TIMER_HANDLE',
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

  const out = timerOutName(options, context)
  const callback = dependencies.emitRuntimeCallbackValue(expression.args[0], timerCallbackFunctionType(), context)
  const callbackContext = nextCName(context, 'inox_timer_ctx')
  const lines: string[] = []

  if (out !== null && typeof out !== 'undefined' && (options.out === null || typeof options.out === 'undefined')) {
    lines.push(`inox_timer_handle* ${out} = 0;`)
  }

  appendTimerLines(lines, callback.lines)
  lines.push(`inox_value* ${callbackContext} = inox_default_alloc(0, sizeof(inox_value), _Alignof(inox_value));`)
  lines.push(`if (${callbackContext} == 0) ${emitFailureStatement(context)}`)
  lines.push(`*${callbackContext} = ${callback.expression};`)
  lines.push(`inox_retain(*${callbackContext});`)
  const outArgument = timerOutArgument(out)

  if (!timerStartCallHasDelay(method)) {
    lines.push(
      `if (${callName}(${emitEventLoopReference(context)}, inox_timer_callback_run, ${callbackContext}, inox_timer_callback_finalize, ${outArgument}) != INOX_OK) {`
    )
    lines.push(`  inox_timer_callback_finalize(${callbackContext});`)
    lines.push(`  ${emitFailureStatement(context)}`)
    lines.push('}')

    return {
      lines: lines,
      expression: timerOutExpression(out)
    }
  }

  const delay = dependencies.emitPreparedNumberExpression(expression.args[1], context)

  appendTimerLines(lines, delay.lines)
  lines.push(
    `if (${callName}(${emitEventLoopReference(context)}, ${delay.expression}, inox_timer_callback_run, ${callbackContext}, inox_timer_callback_finalize, ${outArgument}) != INOX_OK) {`
  )
  lines.push(`  inox_timer_callback_finalize(${callbackContext});`)
  lines.push(`  ${emitFailureStatement(context)}`)
  lines.push('}')

  return {
    lines: lines,
    expression: timerOutExpression(out)
  }
}

export function emitPreparedTimerHandleExpression(
  expression: AnyNode | null | undefined,
  context: TimerFunctionContext,
  dependencies: TimerLoweringDependencies
): PreparedExpression {
  if (
    expression !== null &&
    typeof expression !== 'undefined' &&
    expression.type === 'Reference' &&
    expression.path.length === 1 &&
    context.variables.get(expression.path[0]) === 'timer'
  ) {
    return {
      lines: [],
      expression: dependencies.emitReference(expression, context)
    }
  }

  if (
    expression !== null &&
    typeof expression !== 'undefined' &&
    expression.type === 'CallExpression' &&
    (!!cTimerStartCallName(expression.callee) || timerRuntimeMethodStartsWithSet(expression))
  ) {
    const call = emitPreparedTimerCallExpression(expression, context, dependencies, {
      asValue: true
    })

    if (call !== null && typeof call !== 'undefined') {
      return call
    }
  }

  if (expression !== null && typeof expression !== 'undefined') {
    context.diagnostics.push(
      diagnostic('INOX_C_TIMER_HANDLE', 'timer clear calls require a timer handle value', expression.loc)
    )
  } else {
    context.diagnostics.push(diagnostic('INOX_C_TIMER_HANDLE', 'timer clear calls require a timer handle value'))
  }

  return {
    lines: [],
    expression: '0'
  }
}
