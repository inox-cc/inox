import { isAsyncFetchRuntimeMethod } from '../../stdlib/descriptors/fetch.ts'
import type { AnyNode } from '../../types.ts'
import {
  emitEventLoopReference,
  emitPrepareOwnedValueWrite,
  emitRuntimeTypeCheck,
  emitStatusCheck,
  nextCName,
  registerEventLoop,
  registerOwnedPromise,
  registerOwnedValue
} from '../context.ts'
import { cStringLiteral, utf8ByteLength } from '../identifiers.ts'
import { emitRuntimeValueCheck } from '../runtime-values.ts'
import type {
  CPreparedCallOptions as PreparedCallOptions,
  CPreparedExpression as PreparedExpression,
  CPreparedStringBytesOperand as PreparedStringBytesOperand
} from '../types.ts'

type FetchFunctionContext = {
  cleanupEnabled: boolean
  eventLoopUsed: boolean
  externalEventLoop: boolean
  failureStatement?: string | null
  failureStatementUsed?: boolean
  nextId: number
  ownedPromises: string[]
  ownedValues: string[]
  promiseRejectionValueTypes: Map<string, string>
  promiseValueTypes: Map<string, string>
  returnType?: string
  statusReturn: boolean
  throwingFunction: boolean
  usedCleanupGoto: boolean
  variables: Map<string, string>
}

export type FetchLoweringDependencies = {
  emitCValueExpression(expression: AnyNode, context: FetchFunctionContext): PreparedExpression
  emitPreparedStringBytesOperand(
    expression: AnyNode,
    context: FetchFunctionContext,
    tempPrefix: string
  ): PreparedStringBytesOperand
  findObjectLiteralPropertyValue(expression: AnyNode, key: string): AnyNode | null
  inferExpressionType(expression: AnyNode, context: FetchFunctionContext): string
}

function appendLines(target: string[], values: string[]): void {
  for (const value of values) {
    target.push(value)
  }
}

function preparedCallOut(options: PreparedCallOptions, context: FetchFunctionContext, prefix: string): string {
  const out = options.out

  if (out != null) {
    return out
  }

  return nextCName(context, prefix)
}

function resolveFetchPromiseValueType(expression: AnyNode, method: string): string {
  if (expression.promiseValueType != null) {
    return expression.promiseValueType
  }

  if (method === 'text') {
    return 'string'
  }

  return 'object'
}

function emptyStringBytesOperand(): PreparedStringBytesOperand {
  return { lines: [], bytes: '0', length: '0' }
}

export function cFetchRuntimeExpressionMethod(expression: AnyNode | null | undefined): string | null {
  if (expression == null) {
    return null
  }

  if (expression.fetchRuntimeMethod == null) {
    return null
  }

  return expression.fetchRuntimeMethod
}

export function isAsyncFetchRuntimeCallExpression(expression: AnyNode | null | undefined): boolean {
  const method = cFetchRuntimeExpressionMethod(expression)

  return expression != null && expression.valueType === 'promise' && isAsyncFetchRuntimeMethod(method)
}

export function emitFetchHeadersBooleanVariableDeclaration(
  statement: AnyNode,
  context: FetchFunctionContext,
  dependencies: FetchLoweringDependencies
): string[] | null {
  const fetchHeadersCall = emitPreparedFetchHeadersCallExpression(statement.init, context, dependencies, {
    out: statement.name
  })

  if (fetchHeadersCall != null) {
    if (statement.valueType !== 'boolean') {
      return null
    }

    context.variables.set(statement.name, 'boolean')

    return fetchHeadersCall.lines
  }

  return null
}

export function emitPreparedFetchCallExpression(
  expression: AnyNode | null | undefined,
  context: FetchFunctionContext,
  dependencies: FetchLoweringDependencies,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  const method = cFetchRuntimeExpressionMethod(expression)

  if (method != null) {
    if (expression == null) {
      return null
    }

    if (expression.valueType !== 'promise') {
      return null
    }

    registerEventLoop(context)

    const out = preparedCallOut(options, context, 'ccjs_promise')
    const valueType = resolveFetchPromiseValueType(expression, method)

    if (options.owned !== false) {
      registerOwnedPromise(context, out, valueType, 'error')
    }

    if (method === 'fetch') {
      const url = dependencies.emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_fetch_url')
      const init = emitPreparedFetchInitOperand(expression, context, dependencies)
      let call = ''

      if (init.expression === '0') {
        call = `ccjs_fetch(${emitEventLoopReference(context)}, ${url.bytes}, ${url.length}, &${out})`
      } else {
        call = `ccjs_fetch_with_init(${emitEventLoopReference(context)}, ${url.bytes}, ${url.length}, ${init.expression}, &${out})`
      }

      const lines: string[] = []

      appendLines(lines, url.lines)
      appendLines(lines, init.lines)
      lines.push(emitStatusCheck(call, context))

      return {
        lines,
        expression: out,
        valueType,
        rejectionValueType: 'error'
      }
    }

    if (method === 'text') {
      const response = dependencies.emitCValueExpression(expression.callee.object, context)
      const lines: string[] = []

      appendLines(lines, response.lines)
      lines.push(
        emitRuntimeTypeCheck(
          `${response.expression}.tag != CCJS_TAG_OBJECT || ${response.expression}.as.ref == 0`,
          context
        )
      )
      lines.push(
        emitStatusCheck(
          `ccjs_fetch_response_text(${emitEventLoopReference(context)}, ${response.expression}, &${out})`,
          context
        )
      )

      return {
        lines,
        expression: out,
        valueType: 'string',
        rejectionValueType: 'error'
      }
    }
  }

  return null
}

export function emitPreparedFetchHeadersCallExpression(
  expression: AnyNode,
  context: FetchFunctionContext,
  dependencies: FetchLoweringDependencies,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  const method = cFetchRuntimeExpressionMethod(expression)

  if (method === 'headersGet' || method === 'headersHas') {
    const headers = dependencies.emitCValueExpression(expression.callee.object, context)
    const name = dependencies.emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_fetch_header_name')
    const lines: string[] = []

    appendLines(lines, headers.lines)
    lines.push(
      emitRuntimeTypeCheck(`${headers.expression}.tag != CCJS_TAG_OBJECT || ${headers.expression}.as.ref == 0`, context)
    )
    appendLines(lines, name.lines)

    if (method === 'headersHas') {
      const out = preparedCallOut(options, context, 'ccjs_fetch_header_has')
      lines.push(`int ${out} = 0;`)
      lines.push(
        emitStatusCheck(`ccjs_fetch_headers_has(${headers.expression}, ${name.bytes}, ${name.length}, &${out})`, context)
      )

      return {
        lines,
        expression: out,
        valueType: 'boolean'
      }
    }

    const out = preparedCallOut(options, context, 'ccjs_fetch_header_value')

    if (options.owned !== false) {
      registerOwnedValue(context, out)
    }

    appendLines(lines, emitPrepareOwnedValueWrite(out))
    lines.push(
      emitStatusCheck(
        `ccjs_fetch_headers_get(&ccjs_default_allocator, ${headers.expression}, ${name.bytes}, ${name.length}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      valueType: 'string',
      nullable: true
    }
  }

  return null
}

export function emitPreparedFetchInitOperand(
  expression: AnyNode,
  context: FetchFunctionContext,
  dependencies: FetchLoweringDependencies
): PreparedExpression {
  const init = expression.args[1]

  if (init == null || init.type !== 'ObjectLiteral') {
    return {
      lines: [],
      expression: '0'
    }
  }

  const lines: string[] = []
  const methodValue = dependencies.findObjectLiteralPropertyValue(init, 'method')
  const headersValue = dependencies.findObjectLiteralPropertyValue(init, 'headers')
  const bodyValue = dependencies.findObjectLiteralPropertyValue(init, 'body')
  const signalValue = dependencies.findObjectLiteralPropertyValue(init, 'signal')
  const redirectValue = dependencies.findObjectLiteralPropertyValue(init, 'redirect')
  let method: PreparedStringBytesOperand = emptyStringBytesOperand()
  let redirect: PreparedStringBytesOperand = emptyStringBytesOperand()
  let body: PreparedStringBytesOperand = emptyStringBytesOperand()
  let signal: PreparedExpression = { lines: [], expression: 'ccjs_undefined_value()' }
  let headersExpression = '0'
  let headerCount = '0'

  if (methodValue != null) {
    method = dependencies.emitPreparedStringBytesOperand(methodValue, context, 'ccjs_fetch_method')
  }

  if (redirectValue != null) {
    redirect = dependencies.emitPreparedStringBytesOperand(redirectValue, context, 'ccjs_fetch_redirect')
  }

  if (bodyValue != null) {
    body = emitPreparedFetchBodyOperand(bodyValue, context, dependencies)
  }

  if (signalValue != null) {
    signal = emitPreparedFetchSignalOperand(signalValue, context, dependencies)
  }

  appendLines(lines, method.lines)

  if (headersValue != null && headersValue.type === 'ObjectLiteral' && headersValue.properties.length > 0) {
    const headersName = nextCName(context, 'ccjs_fetch_headers')
    const headerInitializers: string[] = []

    for (const property of headersValue.properties) {
      const value = dependencies.emitPreparedStringBytesOperand(property.value, context, 'ccjs_fetch_header')

      appendLines(lines, value.lines)
      headerInitializers.push(
        `{ ${cStringLiteral(String(property.key))}, ${utf8ByteLength(String(property.key))}, ${value.bytes}, ${value.length} }`
      )
    }

    lines.push(
      `ccjs_fetch_header ${headersName}[${headersValue.properties.length}] = { ${joinStrings(headerInitializers, ', ')} };`
    )
    headersExpression = headersName
    headerCount = `${headersValue.properties.length}`
  }

  appendLines(lines, body.lines)
  appendLines(lines, signal.lines)
  appendLines(lines, redirect.lines)

  const initName = nextCName(context, 'ccjs_fetch_init')

  lines.push(
    `ccjs_fetch_init ${initName} = { ${method.bytes}, ${method.length}, ${headersExpression}, ${headerCount}, ${body.bytes}, ${body.length}, ${signal.expression}, ${redirect.bytes}, ${redirect.length} };`
  )

  return {
    lines,
    expression: `&${initName}`
  }
}

function joinStrings(values: string[], separator: string): string {
  let result = ''

  for (let index = 0; index < values.length; index = index + 1) {
    if (index > 0) {
      result = result + separator
    }

    result = result + values[index]
  }

  return result
}

export function emitPreparedFetchSignalOperand(
  expression: AnyNode,
  context: FetchFunctionContext,
  dependencies: FetchLoweringDependencies
): PreparedExpression {
  if (expression.type === 'MemberExpression' && expression.property === 'signal') {
    const controller = dependencies.emitCValueExpression(expression.object, context)
    const signal = nextCName(context, 'ccjs_fetch_signal')
    const lines: string[] = []

    registerOwnedValue(context, signal)
    appendLines(lines, controller.lines)
    lines.push(
      emitRuntimeTypeCheck(`${controller.expression}.tag != CCJS_TAG_OBJECT || ${controller.expression}.as.ref == 0`, context)
    )
    appendLines(lines, emitPrepareOwnedValueWrite(signal))
    lines.push(emitStatusCheck(`ccjs_fetch_abort_controller_signal(${controller.expression}, &${signal})`, context))

    return {
      lines,
      expression: signal
    }
  }

  const signal = dependencies.emitCValueExpression(expression, context)
  const lines: string[] = []

  appendLines(lines, signal.lines)
  lines.push(emitRuntimeTypeCheck(`${signal.expression}.tag != CCJS_TAG_OBJECT || ${signal.expression}.as.ref == 0`, context))

  return {
    lines,
    expression: signal.expression
  }
}

export function emitPreparedFetchBodyOperand(
  expression: AnyNode,
  context: FetchFunctionContext,
  dependencies: FetchLoweringDependencies
): PreparedStringBytesOperand {
  if (dependencies.inferExpressionType(expression, context) === 'bytes') {
    const value = dependencies.emitCValueExpression(expression, context)
    const bytes = nextCName(context, 'ccjs_fetch_body')
    const lines: string[] = []

    appendLines(lines, value.lines)
    lines.push(emitRuntimeValueCheck(value.expression, 'CCJS_TAG_BYTES', context))
    lines.push(`ccjs_bytes* ${bytes} = (ccjs_bytes*)${value.expression}.as.ref;`)

    return {
      lines,
      bytes: `(const char*)${bytes}->bytes`,
      length: `${bytes}->len`
    }
  }

  return dependencies.emitPreparedStringBytesOperand(expression, context, 'ccjs_fetch_body')
}
