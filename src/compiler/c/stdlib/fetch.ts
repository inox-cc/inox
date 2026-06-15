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
  registerOwnedValue,
  type CFunctionContext
} from '../context.ts'
import { cStringLiteral, utf8ByteLength } from '../identifiers.ts'
import { emitRuntimeValueCheck } from '../runtime-values.ts'
import type {
  CPreparedCallOptions as PreparedCallOptions,
  CPreparedExpression as PreparedExpression,
  CPreparedStringBytesOperand as PreparedStringBytesOperand
} from '../types.ts'

export type FetchLoweringDependencies = {
  emitCValueExpression: (expression: AnyNode, context: CFunctionContext) => PreparedExpression
  emitPreparedStringBytesOperand: (
    expression: AnyNode,
    context: CFunctionContext,
    tempPrefix?: string
  ) => PreparedStringBytesOperand
  findObjectLiteralPropertyValue: (expression: AnyNode, key: string) => AnyNode | null
  inferExpressionType: (expression: AnyNode, context: CFunctionContext) => string
}

const fetchPromiseResultTypes: Record<string, string> = {
  fetch: 'object',
  text: 'string'
}

const fetchResponseCallDescriptors: Record<string, { callName: string; valueType: string }> = {
  text: { callName: 'ccjs_fetch_response_text', valueType: 'string' }
}

type FetchHeadersCallDescriptor =
  | { kind: 'boolean'; callName: string; tempPrefix: string; valueType: 'boolean' }
  | { kind: 'nullable-string'; callName: string; tempPrefix: string; valueType: 'string' }

const fetchHeadersCallDescriptors: Record<string, FetchHeadersCallDescriptor> = {
  headersGet: {
    kind: 'nullable-string',
    callName: 'ccjs_fetch_headers_get',
    tempPrefix: 'ccjs_fetch_header_value',
    valueType: 'string'
  },
  headersHas: {
    kind: 'boolean',
    callName: 'ccjs_fetch_headers_has',
    tempPrefix: 'ccjs_fetch_header_has',
    valueType: 'boolean'
  }
}

export function cFetchRuntimeExpressionMethod(expression: AnyNode): string | null {
  return expression?.fetchRuntimeMethod ?? null
}

export function isAsyncFetchRuntimeCallExpression(expression: AnyNode): boolean {
  const method = cFetchRuntimeExpressionMethod(expression)

  return expression?.valueType === 'promise' && isAsyncFetchRuntimeMethod(method)
}

export function emitFetchHeadersBooleanVariableDeclaration(
  statement: AnyNode,
  context: CFunctionContext,
  dependencies: FetchLoweringDependencies
): string[] | null {
  const fetchHeadersCall = emitPreparedFetchHeadersCallExpression(statement.init, context, dependencies, {
    out: statement.name
  })

  if (fetchHeadersCall == null || statement.valueType !== 'boolean') {
    return null
  }

  context.variables.set(statement.name, 'boolean')

  return fetchHeadersCall.lines
}

export function emitPreparedFetchCallExpression(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: FetchLoweringDependencies,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  const method = cFetchRuntimeExpressionMethod(expression)

  if (method == null || expression?.valueType !== 'promise') {
    return null
  }

  registerEventLoop(context)

  const out = options.out ?? nextCName(context, 'ccjs_promise')
  const valueType = expression.promiseValueType ?? fetchPromiseResultTypes[method] ?? 'object'

  if (options.owned !== false) {
    registerOwnedPromise(context, out, valueType, 'error')
  }

  if (method === 'fetch') {
    const url = dependencies.emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_fetch_url')
    const init = emitPreparedFetchInitOperand(expression, context, dependencies)
    const call =
      init.expression === '0'
        ? `ccjs_fetch(${emitEventLoopReference(context)}, ${url.bytes}, ${url.length}, &${out})`
        : `ccjs_fetch_with_init(${emitEventLoopReference(context)}, ${url.bytes}, ${url.length}, ${init.expression}, &${out})`

    return {
      lines: [...url.lines, ...init.lines, emitStatusCheck(call, context)],
      expression: out,
      valueType,
      rejectionValueType: 'error'
    }
  }

  const descriptor = fetchResponseCallDescriptors[method]

  if (descriptor == null) {
    return null
  }

  const response = dependencies.emitCValueExpression(expression.callee.object, context)

  return {
    lines: [
      ...response.lines,
      emitRuntimeTypeCheck(
        `${response.expression}.tag != CCJS_TAG_OBJECT || ${response.expression}.as.ref == 0`,
        context
      ),
      emitStatusCheck(
        `${descriptor.callName}(${emitEventLoopReference(context)}, ${response.expression}, &${out})`,
        context
      )
    ],
    expression: out,
    valueType: descriptor.valueType,
    rejectionValueType: 'error'
  }
}

export function emitPreparedFetchHeadersCallExpression(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: FetchLoweringDependencies,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  const method = cFetchRuntimeExpressionMethod(expression)
  const descriptor = method == null ? null : fetchHeadersCallDescriptors[method]

  if (descriptor == null) {
    return null
  }

  const headers = dependencies.emitCValueExpression(expression.callee.object, context)
  const name = dependencies.emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_fetch_header_name')
  const lines = [
    ...headers.lines,
    emitRuntimeTypeCheck(`${headers.expression}.tag != CCJS_TAG_OBJECT || ${headers.expression}.as.ref == 0`, context),
    ...name.lines
  ]

  if (descriptor.kind === 'boolean') {
    const out = options.out ?? nextCName(context, descriptor.tempPrefix)
    lines.push(`int ${out} = 0;`)
    lines.push(
      emitStatusCheck(`${descriptor.callName}(${headers.expression}, ${name.bytes}, ${name.length}, &${out})`, context)
    )

    return {
      lines,
      expression: out,
      valueType: descriptor.valueType
    }
  }

  const out = options.out ?? nextCName(context, descriptor.tempPrefix)

  if (options.owned !== false) {
    registerOwnedValue(context, out)
  }

  lines.push(...emitPrepareOwnedValueWrite(out))
  lines.push(
    emitStatusCheck(
      `${descriptor.callName}(&ccjs_default_allocator, ${headers.expression}, ${name.bytes}, ${name.length}, &${out})`,
      context
    )
  )

  return {
    lines,
    expression: out,
    valueType: descriptor.valueType,
    nullable: true
  }
}

export function emitPreparedFetchInitOperand(
  expression: AnyNode,
  context: CFunctionContext,
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
  const method =
    methodValue == null
      ? { lines: [] as string[], bytes: '0', length: '0' }
      : dependencies.emitPreparedStringBytesOperand(methodValue, context, 'ccjs_fetch_method')
  const redirect =
    redirectValue == null
      ? { lines: [] as string[], bytes: '0', length: '0' }
      : dependencies.emitPreparedStringBytesOperand(redirectValue, context, 'ccjs_fetch_redirect')
  const body =
    bodyValue == null
      ? { lines: [] as string[], bytes: '0', length: '0' }
      : emitPreparedFetchBodyOperand(bodyValue, context, dependencies)
  const signal =
    signalValue == null
      ? { lines: [] as string[], expression: 'ccjs_undefined_value()' }
      : emitPreparedFetchSignalOperand(signalValue, context, dependencies)
  let headersExpression = '0'
  let headerCount = '0'

  lines.push(...method.lines)

  if (headersValue?.type === 'ObjectLiteral' && headersValue.properties.length > 0) {
    const headersName = nextCName(context, 'ccjs_fetch_headers')
    const headerInitializers: string[] = []

    for (const property of headersValue.properties) {
      const value = dependencies.emitPreparedStringBytesOperand(property.value, context, 'ccjs_fetch_header')

      lines.push(...value.lines)
      headerInitializers.push(
        `{ ${cStringLiteral(String(property.key))}, ${utf8ByteLength(String(property.key))}, ${value.bytes}, ${value.length} }`
      )
    }

    lines.push(
      `ccjs_fetch_header ${headersName}[${headersValue.properties.length}] = { ${headerInitializers.join(', ')} };`
    )
    headersExpression = headersName
    headerCount = `${headersValue.properties.length}`
  }

  lines.push(...body.lines)
  lines.push(...signal.lines)
  lines.push(...redirect.lines)

  const initName = nextCName(context, 'ccjs_fetch_init')

  lines.push(
    `ccjs_fetch_init ${initName} = { ${method.bytes}, ${method.length}, ${headersExpression}, ${headerCount}, ${body.bytes}, ${body.length}, ${signal.expression}, ${redirect.bytes}, ${redirect.length} };`
  )

  return {
    lines,
    expression: `&${initName}`
  }
}

export function emitPreparedFetchSignalOperand(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: FetchLoweringDependencies
): PreparedExpression {
  if (expression?.type === 'MemberExpression' && expression.property === 'signal') {
    const controller = dependencies.emitCValueExpression(expression.object, context)
    const signal = nextCName(context, 'ccjs_fetch_signal')

    registerOwnedValue(context, signal)

    return {
      lines: [
        ...controller.lines,
        emitRuntimeTypeCheck(
          `${controller.expression}.tag != CCJS_TAG_OBJECT || ${controller.expression}.as.ref == 0`,
          context
        ),
        ...emitPrepareOwnedValueWrite(signal),
        emitStatusCheck(`ccjs_fetch_abort_controller_signal(${controller.expression}, &${signal})`, context)
      ],
      expression: signal
    }
  }

  const signal = dependencies.emitCValueExpression(expression, context)

  return {
    lines: [
      ...signal.lines,
      emitRuntimeTypeCheck(`${signal.expression}.tag != CCJS_TAG_OBJECT || ${signal.expression}.as.ref == 0`, context)
    ],
    expression: signal.expression
  }
}

export function emitPreparedFetchBodyOperand(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: FetchLoweringDependencies
): PreparedStringBytesOperand {
  if (dependencies.inferExpressionType(expression, context) === 'bytes') {
    const value = dependencies.emitCValueExpression(expression, context)
    const bytes = nextCName(context, 'ccjs_fetch_body')

    return {
      lines: [
        ...value.lines,
        emitRuntimeValueCheck(value.expression, 'CCJS_TAG_BYTES', context),
        `ccjs_bytes* ${bytes} = (ccjs_bytes*)${value.expression}.as.ref;`
      ],
      bytes: `(const char*)${bytes}->bytes`,
      length: `${bytes}->len`
    }
  }

  return dependencies.emitPreparedStringBytesOperand(expression, context, 'ccjs_fetch_body')
}
