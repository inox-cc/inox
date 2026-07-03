import { memberExpressionPath } from '../../../../compiler/member-paths.ts'
import {
  dateConstructorRuntimeMethodNameFromPath,
  dateInstanceRuntimeMethodName,
  dateInstanceRuntimeMethodReturnType,
  timeRuntimeCFunctionNameFromPath,
  timeRuntimeMethodNameFromPath
} from './descriptor.ts'
import type { AnyNode } from '../../../../compiler/types.ts'
import { emitStatusCheck, nextCName, registerOwnedValue } from '../../../../compiler/c/context.ts'
import type { CFunctionContext } from '../../../../compiler/c/context.ts'
import type { CPreparedExpression, CPreparedStringBytesOperand } from '../../../../compiler/c/types.ts'

export function cTimeRuntimeCallName(callee: AnyNode | null | undefined): string | null {
  return timeRuntimeCFunctionNameFromPath(memberExpressionPath(callee))
}

export type TimeLoweringDependencies = {
  emitPreparedNumberExpression(expression: AnyNode, context: CFunctionContext): CPreparedExpression
  emitPreparedStringBytesOperand(
    expression: AnyNode,
    context: CFunctionContext,
    tempPrefix: string
  ): CPreparedStringBytesOperand
  inferExpressionType(expression: AnyNode, context: CFunctionContext): string
}

type DatePartInfo = {
  code: number
  utc: boolean
}

type DatePartsExpression = {
  args: string[]
  lines: string[]
}

function timeRuntimeMethodForExpression(
  expression: AnyNode | null | undefined,
  context?: CFunctionContext | null
): string | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  const explicitMethod = nullableString(expression.timeRuntimeMethod)

  if (explicitMethod !== null && typeof explicitMethod !== 'undefined') {
    return explicitMethod
  }

  if (expression.type === 'NewExpression') {
    return dateConstructorRuntimeMethodNameFromPath(memberExpressionPath(expression.callee))
  }

  if (expression.type === 'CallExpression') {
    const path = memberExpressionPath(expression.callee)
    const method = timeRuntimeMethodNameFromPath(path)

    if (method !== null && typeof method !== 'undefined') {
      return method
    }

    const constructorMethod = dateConstructorRuntimeMethodNameFromPath(path)

    if (constructorMethod !== null && typeof constructorMethod !== 'undefined') {
      return constructorMethod
    }

    if (
      context !== null &&
      typeof context !== 'undefined' &&
      expression.callee.type === 'MemberExpression' &&
      depsInferDateReceiver(expression.callee.object, context)
    ) {
      return dateInstanceRuntimeMethodName(expression.callee.property)
    }
  }

  return null
}

export function emitPreparedDateNumberExpression(
  expression: AnyNode,
  context: CFunctionContext,
  deps: TimeLoweringDependencies
): CPreparedExpression | null {
  const method = timeRuntimeMethodForExpression(expression, context)

  if (method === null || typeof method === 'undefined') {
    return null
  }

  if (method === 'dateNow') {
    return {
      lines: [],
      expression: 'Date.now()'
    }
  }

  if (method === 'performanceNow') {
    return {
      lines: [],
      expression: 'performance.now()'
    }
  }

  if (method === 'dateParse') {
    return emitPreparedDateParseExpression(expression, context, deps)
  }

  if (method === 'dateUTC') {
    return emitPreparedDateUTCExpression(expression, context, deps)
  }

  if (method === 'dateConstructor') {
    return emitPreparedDateConstructorExpression(expression, context, deps)
  }

  const part = datePartInfo(method)

  if (part !== null && typeof part !== 'undefined') {
    return emitPreparedDatePartExpression(expression, context, deps, part)
  }

  if (method === 'getTime' || method === 'valueOf') {
    return emitPreparedDateReceiverExpression(expression, context, deps)
  }

  if (method === 'getTimezoneOffset') {
    const receiver = emitPreparedDateReceiverExpression(expression, context, deps)
    return {
      lines: receiver.lines,
      expression: `inox_date_get_timezone_offset(${receiver.expression})`
    }
  }

  return null
}

export function emitPreparedDateStringExpression(
  expression: AnyNode,
  context: CFunctionContext,
  deps: TimeLoweringDependencies
): CPreparedExpression | null {
  const method = timeRuntimeMethodForExpression(expression, context)
  const returnType = dateInstanceRuntimeMethodReturnType(method)

  if (returnType !== 'string') {
    return null
  }

  const receiver = emitPreparedDateReceiverExpression(expression, context, deps)
  const out = nextCName(context, 'inox_date_string')
  const kind = dateStringKind(method !== null && typeof method !== 'undefined' ? method : '')
  const lines: string[] = []

  registerOwnedValue(context, out)
  pushTimeLines(lines, receiver.lines)
  lines.push(
    emitStatusCheck(`inox_date_to_string(&inox_default_allocator, ${receiver.expression}, ${kind}, &${out})`, context)
  )

  return {
    lines,
    expression: out
  }
}

export function isDateStringExpression(expression: AnyNode, context: CFunctionContext): boolean {
  const method = timeRuntimeMethodForExpression(expression, context)

  if (dateInstanceRuntimeMethodReturnType(method) !== 'string') {
    return false
  }

  if (expression.type !== 'CallExpression' || expression.callee.type !== 'MemberExpression') {
    return false
  }

  return depsInferDateReceiver(expression.callee.object, context)
}

function emitPreparedDateParseExpression(
  expression: AnyNode,
  context: CFunctionContext,
  deps: TimeLoweringDependencies
): CPreparedExpression {
  const text = emitPreparedTimeStringArg(expression, 0, context, deps, 'inox_date_parse_text')

  return {
    lines: text.lines,
    expression: `Date.parse(${text.bytes}, ${text.length})`
  }
}

function emitPreparedDateUTCExpression(
  expression: AnyNode,
  context: CFunctionContext,
  deps: TimeLoweringDependencies
): CPreparedExpression {
  const prepared = emitPreparedDateParts(expression, context, deps)

  return {
    lines: prepared.lines,
    expression: `Date.UTC(${joinTimeStrings(prepared.args, ', ')})`
  }
}

function emitPreparedDateConstructorExpression(
  expression: AnyNode,
  context: CFunctionContext,
  deps: TimeLoweringDependencies
): CPreparedExpression {
  if (expression.args.length === 0) {
    return {
      lines: [],
      expression: 'Date.now()'
    }
  }

  if (expression.args.length === 1) {
    const arg = expression.args[0]
    const argType = deps.inferExpressionType(arg, context)

    if (argType === 'string') {
      const text = emitPreparedTimeStringArg(expression, 0, context, deps, 'inox_date_text')

      return {
        lines: text.lines,
        expression: `Date.parse(${text.bytes}, ${text.length})`
      }
    }

    return deps.emitPreparedNumberExpression(arg, context)
  }

  const prepared = emitPreparedDateParts(expression, context, deps)

  return {
    lines: prepared.lines,
    expression: `inox_date_from_local(${joinTimeStrings(prepared.args, ', ')})`
  }
}

function emitPreparedDatePartExpression(
  expression: AnyNode,
  context: CFunctionContext,
  deps: TimeLoweringDependencies,
  part: DatePartInfo
): CPreparedExpression {
  const receiver = emitPreparedDateReceiverExpression(expression, context, deps)
  const lines: string[] = []

  pushTimeLines(lines, receiver.lines)

  return {
    lines,
    expression: `inox_date_get_part(${receiver.expression}, ${part.code}, ${part.utc ? 'true' : 'false'})`
  }
}

function emitPreparedDateReceiverExpression(
  expression: AnyNode,
  context: CFunctionContext,
  deps: TimeLoweringDependencies
): CPreparedExpression {
  if (expression.type === 'CallExpression' && expression.callee.type === 'MemberExpression') {
    return deps.emitPreparedNumberExpression(expression.callee.object, context)
  }

  return deps.emitPreparedNumberExpression(expression, context)
}

function emitPreparedDateParts(
  expression: AnyNode,
  context: CFunctionContext,
  deps: TimeLoweringDependencies
): DatePartsExpression {
  const defaults = ['0', '0', '1', '0', '0', '0', '0']
  const args: string[] = []
  const lines: string[] = []

  for (let index = 0; index < defaults.length; index = index + 1) {
    if (index < expression.args.length) {
      const value = deps.emitPreparedNumberExpression(expression.args[index], context)

      pushTimeLines(lines, value.lines)
      args.push(value.expression)
    } else {
      args.push(defaults[index])
    }
  }

  return { lines, args }
}

function emitPreparedTimeStringArg(
  expression: AnyNode,
  index: number,
  context: CFunctionContext,
  deps: TimeLoweringDependencies,
  tempPrefix: string
): CPreparedStringBytesOperand {
  if (index < expression.args.length) {
    return deps.emitPreparedStringBytesOperand(expression.args[index], context, tempPrefix)
  }

  return {
    lines: [],
    bytes: '""',
    length: '0'
  }
}

function datePartInfo(method: string): DatePartInfo | null {
  if (method === 'getFullYear') return { code: 0, utc: false }
  if (method === 'getMonth') return { code: 1, utc: false }
  if (method === 'getDate') return { code: 2, utc: false }
  if (method === 'getDay') return { code: 3, utc: false }
  if (method === 'getHours') return { code: 4, utc: false }
  if (method === 'getMinutes') return { code: 5, utc: false }
  if (method === 'getSeconds') return { code: 6, utc: false }
  if (method === 'getMilliseconds') return { code: 7, utc: false }
  if (method === 'getUTCFullYear') return { code: 0, utc: true }
  if (method === 'getUTCMonth') return { code: 1, utc: true }
  if (method === 'getUTCDate') return { code: 2, utc: true }
  if (method === 'getUTCDay') return { code: 3, utc: true }
  if (method === 'getUTCHours') return { code: 4, utc: true }
  if (method === 'getUTCMinutes') return { code: 5, utc: true }
  if (method === 'getUTCSeconds') return { code: 6, utc: true }
  if (method === 'getUTCMilliseconds') return { code: 7, utc: true }

  return null
}

function dateStringKind(method: string): string {
  if (method === 'toUTCString') return '1'
  if (method === 'toString') return '2'
  if (method === 'toDateString') return '3'
  if (method === 'toTimeString') return '4'

  return '0'
}

function depsInferDateReceiver(expression: AnyNode, context: CFunctionContext): boolean {
  if (expression.valueType === 'date') {
    return true
  }

  if (expression.type !== 'Reference' || expression.path.length !== 1) {
    return false
  }

  return context.variables.get(expression.path[0]) === 'date'
}

function pushTimeLines(target: string[], source: string[]): void {
  for (const line of source) {
    target.push(line)
  }
}

function joinTimeStrings(values: string[], separator: string): string {
  let result = ''

  for (let index = 0; index < values.length; index = index + 1) {
    if (index > 0) {
      result = result + separator
    }

    result = result + values[index]
  }

  return result
}

function nullableString(value: string | null | undefined): string | null {
  if (value === null || typeof value === 'undefined') {
    return null
  }

  return value
}
