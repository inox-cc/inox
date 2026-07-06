import type { AnyNode } from '../../../../compiler/types.ts'
import {
  emitPrepareOwnedValueWrite,
  emitRuntimeTypeCheck,
  emitStatusCheck,
  nextCName,
  registerEventLoop,
  registerOwnedPromise,
  registerOwnedValue
} from '../../../../compiler/c/context.ts'
import { cStringLiteral, emitCIdentifier } from '../../../../compiler/c/identifiers.ts'
import { emitRuntimeValueCheck } from '../../../../compiler/c/runtime-values.ts'
import type {
  CPreparedCallOptions as PreparedCallOptions,
  CPreparedExpression as PreparedExpression,
  CPreparedStringBytesOperand as PreparedStringBytesOperand
} from '../../../../compiler/c/types.ts'
import { isAsyncFetchRuntimeMethod } from './descriptor.ts'

type FetchFunctionContext = {
  cleanupEnabled: boolean
  eventLoopUsed: boolean
  externalEventLoop: boolean
  failureStatement?: string | null
  failureStatementUsed?: boolean
  nextId: number
  ownedPromises: string[]
  ownedValues: string[]
  objectDeclaredTypes: Map<string, string | null>
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

  if (out !== null && typeof out !== 'undefined') {
    return out
  }

  return nextCName(context, prefix)
}

function resolveFetchPromiseValueType(expression: AnyNode, method: string): string {
  if (expression.promiseValueType !== null && typeof expression.promiseValueType !== 'undefined') {
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

function fetchResponseCppReference(expression: AnyNode, context: FetchFunctionContext): string | null {
  if (expression.type !== 'Reference' || expression.path.length !== 1) {
    return null
  }

  const name = expression.path[0]

  if (context.objectDeclaredTypes.get(name) !== 'fetch.Response') {
    return null
  }

  return emitCIdentifier(name)
}

export function emitFetchStringArgument(operand: PreparedStringBytesOperand): string {
  if (operand.literalValue !== null && typeof operand.literalValue !== 'undefined') {
    return cStringLiteral(operand.literalValue)
  }

  return `inox::StringView(${operand.bytes}, ${operand.length})`
}

export function cFetchRuntimeExpressionMethod(expression: AnyNode | null | undefined): string | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  if (expression.fetchRuntimeMethod === null || typeof expression.fetchRuntimeMethod === 'undefined') {
    return null
  }

  return expression.fetchRuntimeMethod
}

export function isAsyncFetchRuntimeCallExpression(expression: AnyNode | null | undefined): boolean {
  const method = cFetchRuntimeExpressionMethod(expression)

  return (
    expression !== null &&
    typeof expression !== 'undefined' &&
    expression.valueType === 'promise' &&
    isAsyncFetchRuntimeMethod(method)
  )
}

export function emitFetchHeadersBooleanVariableDeclaration(
  statement: AnyNode,
  context: FetchFunctionContext,
  dependencies: FetchLoweringDependencies
): string[] | null {
  const fetchHeadersCall = emitPreparedFetchHeadersCallExpression(statement.init, context, dependencies, {
    out: statement.name
  })

  if (fetchHeadersCall !== null && typeof fetchHeadersCall !== 'undefined') {
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

  if (method !== null && typeof method !== 'undefined') {
    if (expression === null || typeof expression === 'undefined') {
      return null
    }

    if (expression.valueType !== 'promise') {
      return null
    }

    registerEventLoop(context)

    const out = preparedCallOut(options, context, 'inox_promise')
    const valueType = resolveFetchPromiseValueType(expression, method)

    if (options.cppExpression !== true && options.owned !== false) {
      registerOwnedPromise(context, out, valueType, 'error')
    }

    if (method === 'fetch') {
      const url = dependencies.emitPreparedStringBytesOperand(expression.args[0], context, 'inox_fetch_url')
      const init = emitPreparedFetchInitOperand(expression, context, dependencies)
      let call = ''

      const fetchExpression =
        init.expression === '0'
          ? `inox::fetch(${emitFetchStringArgument(url)})`
          : `inox::fetch(${emitFetchStringArgument(url)}, ${init.expression})`
      call = `(${out} = ${fetchExpression}, ${out}.valid() ? INOX_OK : INOX_ERR_TYPE)`

      const lines: string[] = []

      appendLines(lines, url.lines)
      appendLines(lines, init.lines)

      if (options.cppExpression === true) {
        return {
          lines,
          expression:
            init.expression === '0'
              ? `inox::fetch(${emitFetchStringArgument(url)})`
              : `inox::fetch(${emitFetchStringArgument(url)}, ${init.expression})`,
          valueType,
          rejectionValueType: 'error'
        }
      }

      lines.push(emitStatusCheck(call, context))

      return {
        lines,
        expression: out,
        valueType,
        rejectionValueType: 'error'
      }
    }

    if (method === 'text') {
      if (options.cppExpression === true) {
        const reference = fetchResponseCppReference(expression.callee.object, context)

        if (reference !== null && typeof reference !== 'undefined') {
          return {
            lines: [],
            expression: `${reference}.text()`,
            valueType: 'string',
            rejectionValueType: 'error'
          }
        }
      }

      const response = dependencies.emitCValueExpression(expression.callee.object, context)
      const lines: string[] = []

      appendLines(lines, response.lines)
      lines.push(
        emitRuntimeTypeCheck(
          `${response.expression}.tag != INOX_TAG_OBJECT || ${response.expression}.as.ref == 0`,
          context
        )
      )
      lines.push(
        emitStatusCheck(
          `(${out} = inox::FetchResponse(inox::Value(${response.expression})).text(), ${out}.valid() ? INOX_OK : INOX_ERR_TYPE)`,
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
    const name = dependencies.emitPreparedStringBytesOperand(expression.args[0], context, 'inox_fetch_header_name')
    const lines: string[] = []

    appendLines(lines, headers.lines)
    lines.push(
      emitRuntimeTypeCheck(`${headers.expression}.tag != INOX_TAG_OBJECT || ${headers.expression}.as.ref == 0`, context)
    )
    appendLines(lines, name.lines)

    if (method === 'headersHas') {
      const out = preparedCallOut(options, context, 'inox_fetch_header_has')
      lines.push(`int ${out} = 0;`)
      lines.push(
        emitStatusCheck(
          `(${out} = inox::fetch_headers_has(${headers.expression}, ${emitFetchStringArgument(name)}), inox::thrown() ? INOX_ERR_TYPE : INOX_OK)`,
          context
        )
      )

      return {
        lines,
        expression: out,
        valueType: 'boolean'
      }
    }

    const out = preparedCallOut(options, context, 'inox_fetch_header_value')

    if (options.owned !== false) {
      registerOwnedValue(context, out)
    }

    appendLines(lines, emitPrepareOwnedValueWrite(out))
    lines.push(`${out} = inox::fetch_headers_get(${headers.expression}, ${emitFetchStringArgument(name)});`)
    lines.push(emitRuntimeTypeCheck('inox::thrown()', context))

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
  if (expression.args.length < 2 || expression.args[1].type !== 'ObjectLiteral') {
    return {
      lines: [],
      expression: '0'
    }
  }

  const init = expression.args[1]
  const lines: string[] = []
  const methodValue = dependencies.findObjectLiteralPropertyValue(init, 'method')
  const headersValue = dependencies.findObjectLiteralPropertyValue(init, 'headers')
  const bodyValue = dependencies.findObjectLiteralPropertyValue(init, 'body')
  const signalValue = dependencies.findObjectLiteralPropertyValue(init, 'signal')
  const redirectValue = dependencies.findObjectLiteralPropertyValue(init, 'redirect')
  let method: PreparedStringBytesOperand = emptyStringBytesOperand()
  let redirect: PreparedStringBytesOperand = emptyStringBytesOperand()
  let body: PreparedStringBytesOperand = emptyStringBytesOperand()
  let signal: PreparedExpression = { lines: [], expression: 'inox_undefined_value()' }
  let headersExpression = '0'
  let headerCount = '0'

  if (methodValue !== null && typeof methodValue !== 'undefined') {
    method = dependencies.emitPreparedStringBytesOperand(methodValue, context, 'inox_fetch_method')
  }

  if (redirectValue !== null && typeof redirectValue !== 'undefined') {
    redirect = dependencies.emitPreparedStringBytesOperand(redirectValue, context, 'inox_fetch_redirect')
  }

  if (bodyValue !== null && typeof bodyValue !== 'undefined') {
    body = emitPreparedFetchBodyOperand(bodyValue, context, dependencies)
  }

  if (signalValue !== null && typeof signalValue !== 'undefined') {
    signal = emitPreparedFetchSignalOperand(signalValue, context, dependencies)
  }

  appendLines(lines, method.lines)

  if (
    headersValue !== null &&
    typeof headersValue !== 'undefined' &&
    headersValue.type === 'ObjectLiteral' &&
    headersValue.properties.length > 0
  ) {
    const headersName = nextCName(context, 'inox_fetch_headers')
    const headerInitializers: string[] = []

    for (const property of headersValue.properties) {
      const value = dependencies.emitPreparedStringBytesOperand(property.value, context, 'inox_fetch_header')

      appendLines(lines, value.lines)
      headerInitializers.push(`{ ${cStringLiteral(String(property.key))}, ${emitFetchStringArgument(value)} }`)
    }

    lines.push(
      `inox::FetchHeader ${headersName}[${headersValue.properties.length}] = { ${joinStrings(headerInitializers, ', ')} };`
    )
    headersExpression = headersName
    headerCount = `${headersValue.properties.length}`
  }

  appendLines(lines, body.lines)
  appendLines(lines, signal.lines)
  appendLines(lines, redirect.lines)

  const initName = nextCName(context, 'inox_fetch_init')

  lines.push(
    `inox::FetchInit ${initName} = { ${emitFetchStringArgument(method)}, ${headersExpression}, ${headerCount}, ${emitFetchStringArgument(body)}, ${signal.expression}, ${emitFetchStringArgument(redirect)} };`
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
    const signal = nextCName(context, 'inox_fetch_signal')
    const lines: string[] = []

    registerOwnedValue(context, signal)
    appendLines(lines, controller.lines)
    lines.push(
      emitRuntimeTypeCheck(
        `${controller.expression}.tag != INOX_TAG_OBJECT || ${controller.expression}.as.ref == 0`,
        context
      )
    )
    appendLines(lines, emitPrepareOwnedValueWrite(signal))
    lines.push(`${signal} = inox::fetch_abort_controller_signal(${controller.expression});`)
    lines.push(emitRuntimeTypeCheck('inox::thrown()', context))

    return {
      lines,
      expression: signal
    }
  }

  const signal = dependencies.emitCValueExpression(expression, context)
  const lines: string[] = []

  appendLines(lines, signal.lines)
  lines.push(
    emitRuntimeTypeCheck(`${signal.expression}.tag != INOX_TAG_OBJECT || ${signal.expression}.as.ref == 0`, context)
  )

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
    const bytes = nextCName(context, 'inox_fetch_body')
    const lines: string[] = []

    appendLines(lines, value.lines)
    lines.push(emitRuntimeValueCheck(value.expression, 'INOX_TAG_BYTES', context))
    lines.push(`inox_bytes* ${bytes} = (inox_bytes*)${value.expression}.as.ref;`)

    return {
      lines,
      bytes: `(const char*)${bytes}->bytes`,
      length: `${bytes}->len`
    }
  }

  return dependencies.emitPreparedStringBytesOperand(expression, context, 'inox_fetch_body')
}
