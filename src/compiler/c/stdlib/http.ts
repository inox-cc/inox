import { diagnostic } from '../../diagnostics.ts'
import { collectIrTopLevelNodeEntries } from '../../ir.ts'
import { emitEventLoopReference, emitStatusCheck, nextCName, registerEventLoop } from '../context.ts'
import { cStringLiteral, utf8ByteLength } from '../identifiers.ts'
import { cJsonRuntimeCallName } from './json.ts'
import type { IrProgram } from '../../types.ts'
import type { CPreparedExpression as PreparedExpression } from '../types.ts'


type HttpStringBytesOperand = {
  lines: string[]
  bytes: string
  length: string
}

type HttpHeaderArray = {
  lines: string[]
  name: string
  count: string
}

type HttpHandlerContext = {
  requestName: string | null
  responseName: string | null
  stringLocals: Map<string, string>
}

export type HttpLoweringDependencies = {
  emitPreparedNumberExpression: (expression: any, context: any) => PreparedExpression
  emitStatementList: (body: any[], context: any) => string[]
}

export function emitHttpHandlerHead(wrapper: any): string {
  return `static ccjs_status ${wrapper.name}(void* user, const ccjs_http_request* ccjs_request, ccjs_http_response* ccjs_response)`
}

export function emitHttpHandlerDeclaration(wrapper: any, baseContext: any, deps: HttpLoweringDependencies): string[] {
  const expression = wrapper.expression
  const requestName = expression.params[0]?.name ?? null
  const responseName = expression.params[1]?.name ?? null
  const httpContext = {
    requestName,
    responseName,
    stringLocals: new Map()
  }
  const body = expression.expressionBody
    ? [
        {
          type: 'ExpressionStatement',
          expression: expression.body,
          loc: expression.loc
        }
      ]
    : expression.body
  const lines = [
    `${emitHttpHandlerHead(wrapper)} {`,
    '  (void)user;',
    requestName == null ? '  (void)ccjs_request;' : `  const ccjs_http_request* ${requestName} = ccjs_request;`,
    responseName == null ? '  (void)ccjs_response;' : `  ccjs_http_response* ${responseName} = ccjs_response;`
  ]

  for (const statement of body) {
    lines.push(...emitHttpHandlerStatement(statement, httpContext, baseContext, deps).map((line) => `  ${line}`))
  }

  lines.push('  return CCJS_OK;')
  lines.push('}')

  return lines
}

function emitHttpHandlerStatement(statement: any, httpContext: HttpHandlerContext, context: any, deps: HttpLoweringDependencies): string[] {
  if (statement == null) {
    return []
  }

  if (statement.type === 'BlockStatement') {
    return [
      '{',
      ...statement.body
        .flatMap((item) => emitHttpHandlerStatement(item, httpContext, context, deps))
        .map((line) => `  ${line}`),
      '}'
    ]
  }

  if (statement.type === 'IfStatement') {
    const condition = emitHttpConditionExpression(statement.condition, httpContext, context)
    const consequent = emitHttpHandlerStatement(statement.consequent, httpContext, context, deps)
    const lines = [`if (${condition}) {`, ...consequent.map((line) => `  ${line}`)]

    if (statement.alternate == null) {
      lines.push('}')
      return lines
    }

    lines.push('} else {')
    lines.push(...emitHttpHandlerStatement(statement.alternate, httpContext, context, deps).map((line) => `  ${line}`))
    lines.push('}')
    return lines
  }

  if (statement.type === 'VariableDeclaration') {
    const stringValue = emitHttpStaticStringValue(statement.init, httpContext, context)

    if (stringValue == null) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_HTTP_HANDLER',
          'HTTP request listeners in the C backend currently support only static string local declarations',
          statement.loc
        )
      )
      return []
    }

    httpContext.stringLocals.set(statement.name, stringValue)
    return []
  }

  if (statement.type === 'ExpressionStatement') {
    if (statement.expression?.type === 'CallExpression') {
      const responseCall = emitHttpResponseCallStatement(statement.expression, httpContext, context)

      if (responseCall != null) {
        return responseCall
      }
    }

    if (statement.expression?.type === 'AssignmentExpression') {
      const statusAssignment = emitHttpResponseStatusAssignment(statement.expression, httpContext, context)

      if (statusAssignment != null) {
        return statusAssignment
      }
    }

    context.diagnostics.push(
      diagnostic(
        'CCJS_HTTP_HANDLER',
        'this HTTP request listener statement is not supported by the current C backend slice',
        statement.loc
      )
    )
    return []
  }

  if (statement.type === 'ReturnStatement') {
    if (statement.argument?.type === 'CallExpression') {
      const responseCall = emitHttpResponseCallStatement(statement.argument, httpContext, context)

      if (responseCall != null) {
        return [...responseCall, 'return CCJS_OK;']
      }
    }

    return ['return CCJS_OK;']
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_HTTP_HANDLER',
      'this HTTP request listener statement is not supported by the current C backend slice',
      statement.loc
    )
  )
  return []
}

function emitHttpResponseStatusAssignment(expression: any, httpContext: HttpHandlerContext, context: any): string[] | null {
  if (
    expression.target?.type !== 'MemberExpression' ||
    expression.target.property !== 'statusCode' ||
    !isHttpResponseReference(expression.target.object, httpContext)
  ) {
    return null
  }

  const status = emitHttpStatusCodeExpression(expression.value, context)

  return emitHttpStatusCheck(`ccjs_http_response_set_status(${httpContext.responseName}, ${status})`, context)
}

function emitHttpResponseCallStatement(expression: any, httpContext: HttpHandlerContext, context: any): string[] | null {
  if (
    expression.callee?.type !== 'MemberExpression' ||
    !isHttpResponseReference(expression.callee.object, httpContext)
  ) {
    return null
  }

  const method = expression.callee.property

  if (method === 'setHeader') {
    const name = emitHttpStringBytesOperand(expression.args[0], httpContext, context)
    const value = emitHttpStringBytesOperand(expression.args[1], httpContext, context)

    return [
      ...name.lines,
      ...value.lines,
      ...emitHttpStatusCheck(
        `ccjs_http_response_set_header(${httpContext.responseName}, ${name.bytes}, ${name.length}, ${value.bytes}, ${value.length})`,
        context
      )
    ]
  }

  if (method === 'writeHead') {
    const status = emitHttpStatusCodeExpression(expression.args[0], context)
    const headers = emitHttpHeaderArray(expression.args[1], context)

    return [
      ...headers.lines,
      ...emitHttpStatusCheck(
        `ccjs_http_response_write_head(${httpContext.responseName}, ${status}, ${headers.name}, ${headers.count})`,
        context
      )
    ]
  }

  if (method === 'write' || method === 'end') {
    const body = emitHttpStringBytesOperand(expression.args[0], httpContext, context)
    const runtime = method === 'write' ? 'ccjs_http_response_write' : 'ccjs_http_response_end'

    return [
      ...body.lines,
      ...emitHttpStatusCheck(`${runtime}(${httpContext.responseName}, ${body.bytes}, ${body.length})`, context)
    ]
  }

  return null
}

function emitHttpHeaderArray(expression: any, context: any): HttpHeaderArray {
  if (expression == null) {
    return {
      lines: [],
      name: '0',
      count: '0'
    }
  }

  if (expression.type !== 'ObjectLiteral') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_HTTP_HANDLER',
        'HTTP response headers in the C backend must be an object literal',
        expression.loc
      )
    )

    return {
      lines: [],
      name: '0',
      count: '0'
    }
  }

  if (expression.properties.length === 0) {
    return {
      lines: [],
      name: '0',
      count: '0'
    }
  }

  const name = nextCName(context, 'ccjs_http_headers')
  const lines = [`ccjs_http_header ${name}[] = {`]

  for (const property of expression.properties) {
    const value = emitHttpStaticStringValue(property.value, { stringLocals: new Map() }, context)

    if (value == null) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_HTTP_HANDLER',
          'HTTP response header values in the C backend must be static strings',
          property.loc
        )
      )
      continue
    }

    lines.push(
      `  { ${cStringLiteral(property.key)}, ${utf8ByteLength(property.key)}, ${cStringLiteral(value)}, ${utf8ByteLength(value)} },`
    )
  }

  lines.push('};')

  return {
    lines,
    name,
    count: `${expression.properties.length}`
  }
}

function emitHttpConditionExpression(expression: any, httpContext: HttpHandlerContext, context: any): string {
  if (expression?.type === 'BooleanLiteral') {
    return expression.value ? '1' : '0'
  }

  if (expression?.type === 'UnaryExpression' && expression.operator === '!') {
    return `!(${emitHttpConditionExpression(expression.argument, httpContext, context)})`
  }

  if (expression?.type === 'BinaryExpression') {
    if (expression.operator === '&&' || expression.operator === '||') {
      return `(${emitHttpConditionExpression(expression.left, httpContext, context)} ${expression.operator} ${emitHttpConditionExpression(expression.right, httpContext, context)})`
    }

    const requestCompare = emitHttpRequestStringCompareExpression(expression, httpContext, context)

    if (requestCompare != null) {
      return requestCompare
    }
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_HTTP_HANDLER',
      'HTTP request listener conditions in the C backend currently support req.method/req.url string comparisons',
      expression?.loc
    )
  )
  return '0'
}

function emitHttpRequestStringCompareExpression(expression: any, httpContext: HttpHandlerContext, context: any): string | null {
  if (!['===', '==', '!==', '!='].includes(expression.operator)) {
    return null
  }

  const left = resolveHttpRequestStringMember(expression.left, httpContext)
  const right = resolveHttpRequestStringMember(expression.right, httpContext)
  const literal = emitHttpStaticStringValue(left == null ? expression.left : expression.right, httpContext, context)
  const member = left ?? right

  if (member == null || literal == null) {
    return null
  }

  const runtime =
    member === 'method'
      ? `ccjs_http_request_method_equals(${httpContext.requestName}, ${cStringLiteral(literal)}, ${utf8ByteLength(literal)})`
      : `ccjs_http_request_url_equals(${httpContext.requestName}, ${cStringLiteral(literal)}, ${utf8ByteLength(literal)})`

  return ['!==', '!='].includes(expression.operator) ? `!(${runtime})` : runtime
}

function emitHttpStringBytesOperand(expression: any, httpContext: HttpHandlerContext, context: any): HttpStringBytesOperand {
  if (expression == null) {
    return {
      lines: [],
      bytes: '""',
      length: '0'
    }
  }

  const staticValue = emitHttpStaticStringValue(expression, httpContext, context)

  if (staticValue != null) {
    return {
      lines: [],
      bytes: cStringLiteral(staticValue),
      length: `${utf8ByteLength(staticValue)}`
    }
  }

  const requestMember = resolveHttpRequestStringMember(expression, httpContext)

  if (requestMember === 'method') {
    return {
      lines: [],
      bytes: `${httpContext.requestName}->method`,
      length: `${httpContext.requestName}->method_len`
    }
  }

  if (requestMember === 'url') {
    return {
      lines: [],
      bytes: `${httpContext.requestName}->url`,
      length: `${httpContext.requestName}->url_len`
    }
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_HTTP_HANDLER',
      'HTTP response body expressions in the C backend currently support static strings, JSON.stringify(object literals), req.method and req.url',
      expression.loc
    )
  )

  return {
    lines: [],
    bytes: '""',
    length: '0'
  }
}

function emitHttpStaticStringValue(expression: any, httpContext: Partial<HttpHandlerContext>, context: any): string | null {
  if (expression?.type === 'StringLiteral') {
    return expression.value
  }

  if (expression?.type === 'TemplateLiteral' && !expression.raw.includes('${')) {
    return expression.raw.slice(1, -1)
  }

  if (expression?.type === 'NumberLiteral') {
    return expression.value
  }

  if (expression?.type === 'BooleanLiteral') {
    return expression.value ? 'true' : 'false'
  }

  if (expression?.type === 'Reference' && expression.path.length === 1) {
    return httpContext.stringLocals?.get(expression.path[0]) ?? null
  }

  return emitHttpStaticJsonStringifyValue(expression, context)
}

function emitHttpStaticJsonStringifyValue(expression: any, context: any): string | null {
  if (
    expression?.type !== 'CallExpression' ||
    cJsonRuntimeCallName(expression.callee) !== 'stringify' ||
    expression.args.length !== 1
  ) {
    return null
  }

  return emitHttpStaticJsonValue(expression.args[0], context)
}

function emitHttpStaticJsonValue(expression: any, context: any): string | null {
  if (expression?.type === 'StringLiteral') {
    return JSON.stringify(expression.value)
  }

  if (expression?.type === 'TemplateLiteral' && !expression.raw.includes('${')) {
    return JSON.stringify(expression.raw.slice(1, -1))
  }

  if (expression?.type === 'NumberLiteral') {
    return expression.value
  }

  if (expression?.type === 'BooleanLiteral') {
    return expression.value ? 'true' : 'false'
  }

  if (expression?.type === 'NullLiteral') {
    return 'null'
  }

  if (expression?.type === 'ArrayLiteral') {
    const items = expression.elements.map((item) => emitHttpStaticJsonValue(item, context))

    if (items.some((item) => item == null)) {
      return null
    }

    return `[${items.join(',')}]`
  }

  if (expression?.type === 'ObjectLiteral') {
    const fields: string[] = []

    for (const property of expression.properties) {
      const value = emitHttpStaticJsonValue(property.value, context)

      if (value == null) {
        return null
      }

      fields.push(`${JSON.stringify(property.key)}:${value}`)
    }

    return `{${fields.join(',')}}`
  }

  return null
}

function emitHttpStatusCodeExpression(expression: any, context: any): string {
  if (expression?.type === 'NumberLiteral') {
    return `(int)(${expression.value})`
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_HTTP_HANDLER',
      'HTTP status values in the C backend currently must be numeric literals',
      expression?.loc
    )
  )
  return '200'
}

function emitHttpStatusCheck(call: string, context: any): string[] {
  const status = nextCName(context, 'ccjs_http_status')

  return ['{', `  ccjs_status ${status} = ${call};`, `  if (${status} != CCJS_OK) return ${status};`, '}']
}

function isHttpResponseReference(expression: any, httpContext: HttpHandlerContext): boolean {
  return (
    httpContext.responseName != null &&
    expression?.type === 'Reference' &&
    expression.path.length === 1 &&
    expression.path[0] === httpContext.responseName
  )
}

function resolveHttpRequestStringMember(expression: any, httpContext: HttpHandlerContext): string | null {
  if (
    httpContext.requestName == null ||
    expression?.type !== 'MemberExpression' ||
    expression.object?.type !== 'Reference' ||
    expression.object.path.length !== 1 ||
    expression.object.path[0] !== httpContext.requestName
  ) {
    return null
  }

  return expression.property === 'method' || expression.property === 'url' ? expression.property : null
}

export function emitHttpServerVariableDeclaration(statement: any, context: any): string[] | null {
  if (!isHttpCreateServerCall(statement.init, context)) {
    return null
  }

  context.variables.set(statement.name, 'http-server')
  registerEventLoop(context)

  return emitHttpServerCreateLines(statement.init, statement.name, context)
}

export function emitHttpServerCallStatement(expression: any, context: any, deps: HttpLoweringDependencies): string[] | null {
  if (
    expression.callee?.type === 'MemberExpression' &&
    expression.callee.property === 'listen' &&
    isHttpCreateServerCall(expression.callee.object, context)
  ) {
    const serverName = nextCName(context, 'ccjs_http_server')
    registerEventLoop(context)

    return [
      `ccjs_http_server* ${serverName} = 0;`,
      ...emitHttpServerCreateLines(expression.callee.object, serverName, context, {
        declare: false
      }),
      ...emitHttpServerListenLines(serverName, expression.args, context, deps)
    ]
  }

  if (isHttpServerMethodCall(expression, 'listen', context)) {
    const serverName = expression.callee.object.path[0]
    registerEventLoop(context)

    return emitHttpServerListenLines(serverName, expression.args, context, deps)
  }

  if (isHttpServerMethodCall(expression, 'on', context)) {
    return emitHttpServerOnRequestLines(expression.callee.object.path[0], expression.args, context)
  }

  if (isHttpServerMethodCall(expression, 'close', context)) {
    return emitHttpServerCloseLines(expression.callee.object.path[0], expression.args, context, deps)
  }

  return null
}

function emitHttpServerCreateLines(expression: any, serverName: string, context: any, options: { declare?: boolean } = {}): string[] {
  const listener = expression.args[0]
  const wrapper = context.httpHandlers.get(listener)

  if (listener != null && (listener.type !== 'ArrowFunctionExpression' || wrapper == null)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_HTTP_SERVER',
        'http.createServer in the C backend currently requires an inline request listener',
        expression.loc
      )
    )
  }

  const lines = options.declare === false ? [] : [`ccjs_http_server* ${serverName} = 0;`]

  lines.push(
    emitStatusCheck(
      `ccjs_http_server_new(${emitEventLoopReference(context)}, ${wrapper?.name ?? '0'}, 0, &${serverName})`,
      context
    )
  )

  return lines
}

function emitHttpServerListenLines(serverName: string, args: any[], context: any, deps: HttpLoweringDependencies): string[] {
  if (args.length < 1) {
    context.diagnostics.push(
      diagnostic('CCJS_HTTP_SERVER', 'server.listen in the C backend currently requires a port argument')
    )

    return []
  }

  const hostArg = args[1]?.type === 'ArrowFunctionExpression' ? null : args[1]
  const callback = args[1]?.type === 'ArrowFunctionExpression' ? args[1] : args[2]

  if (args.length > 3) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_HTTP_SERVER',
        'server.listen in the C backend currently supports port, optional host and optional callback',
        args[3]?.loc
      )
    )
  }

  const port = deps.emitPreparedNumberExpression(args[0], context)
  const host = emitHttpListenHostExpression(hostArg, context)

  return [
    ...port.lines,
    emitStatusCheck(`ccjs_http_server_listen(${serverName}, ${host}, (int)(${port.expression}), 128)`, context),
    ...emitHttpZeroArgCallbackLines(callback, context, deps)
  ]
}

function emitHttpServerOnRequestLines(serverName: string, args: any[], context: any): string[] {
  if (args[0]?.type !== 'StringLiteral' || args[0].value !== 'request') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_HTTP_SERVER',
        "server.on in the C backend currently supports only the 'request' event",
        args[0]?.loc
      )
    )
    return []
  }

  const listener = args[1]
  const wrapper = context.httpHandlers.get(listener)

  if (listener?.type !== 'ArrowFunctionExpression' || wrapper == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_HTTP_SERVER',
        "server.on('request') in the C backend currently requires an inline request listener",
        listener?.loc
      )
    )
    return []
  }

  return [emitStatusCheck(`ccjs_http_server_on_request(${serverName}, ${wrapper.name}, 0)`, context)]
}

function emitHttpServerCloseLines(serverName: string, args: any[], context: any, deps: HttpLoweringDependencies): string[] {
  if (args.length > 1) {
    context.diagnostics.push(
      diagnostic('CCJS_HTTP_SERVER', 'server.close in the C backend supports only an optional callback', args[1]?.loc)
    )
  }

  return [`ccjs_http_server_close(${serverName});`, ...emitHttpZeroArgCallbackLines(args[0], context, deps)]
}

function emitHttpZeroArgCallbackLines(callback: any, context: any, deps: HttpLoweringDependencies): string[] {
  if (callback == null) {
    return []
  }

  if (callback.type !== 'ArrowFunctionExpression' || callback.params.length !== 0 || callback.async) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_HTTP_SERVER',
        'HTTP server lifecycle callbacks in the C backend currently require a synchronous zero-argument arrow function',
        callback.loc
      )
    )
    return []
  }

  const body = callback.expressionBody
    ? [
        {
          type: 'ExpressionStatement',
          expression: callback.body,
          loc: callback.loc
        }
      ]
    : callback.body

  return deps.emitStatementList(body, context)
}

function emitHttpListenHostExpression(expression: any, context: any): string {
  if (expression == null) {
    return '0'
  }

  if (expression.type === 'StringLiteral') {
    return cStringLiteral(expression.value)
  }

  if (expression.type === 'TemplateLiteral' && !expression.raw.includes('${')) {
    return cStringLiteral(expression.raw.slice(1, -1))
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_HTTP_SERVER',
      'server.listen host in the C backend currently must be a string literal',
      expression.loc
    )
  )
  return '0'
}

function isHttpServerMethodCall(expression: any, method: string, context: any): boolean {
  return (
    expression?.type === 'CallExpression' &&
    expression.callee?.type === 'MemberExpression' &&
    expression.callee.property === method &&
    expression.callee.object?.type === 'Reference' &&
    expression.callee.object.path.length === 1 &&
    context.variables.get(expression.callee.object.path[0]) === 'http-server'
  )
}

function isHttpCreateServerCall(expression: any, context: any): boolean {
  if (expression?.type !== 'CallExpression') {
    return false
  }

  if (
    expression.callee?.type === 'Reference' &&
    expression.callee.path.length === 1 &&
    context.httpCreateServerNames.has(expression.callee.path[0])
  ) {
    return true
  }

  return (
    expression.callee?.type === 'MemberExpression' &&
    expression.callee.property === 'createServer' &&
    expression.callee.object?.type === 'Reference' &&
    expression.callee.object.path.length === 1 &&
    context.httpImportNames.has(expression.callee.object.path[0])
  )
}

function isHttpRequestEventCall(expression: any): boolean {
  return (
    expression?.type === 'CallExpression' &&
    expression.callee?.type === 'MemberExpression' &&
    expression.callee.property === 'on' &&
    expression.args[0]?.type === 'StringLiteral' &&
    expression.args[0].value === 'request'
  )
}

export function collectHttpHandlers(irPrograms: IrProgram[], context: any): Map<any, any> {
  const handlers = new Map()
  const register = (expression) => {
    if (expression?.type !== 'ArrowFunctionExpression') {
      return
    }

    if (handlers.has(expression)) {
      return
    }

    handlers.set(expression, {
      name: `ccjs_http_handler_${handlers.size}`,
      expression
    })
  }
  const visitStatement = (statement) => {
    if (statement == null) {
      return
    }

    if (statement.type === 'VariableDeclaration') {
      visitExpression(statement.init)
      return
    }

    if (statement.type === 'ExpressionStatement') {
      visitExpression(statement.expression)
      return
    }

    if (statement.type === 'ReturnStatement' || statement.type === 'ThrowStatement') {
      visitExpression(statement.argument)
      return
    }

    if (statement.type === 'BlockStatement') {
      statement.body.forEach(visitStatement)
      return
    }

    if (statement.type === 'IfStatement') {
      visitExpression(statement.condition)
      visitStatement(statement.consequent)
      visitStatement(statement.alternate)
      return
    }

    if (statement.type === 'WhileStatement') {
      visitExpression(statement.condition)
      visitStatement(statement.body)
      return
    }

    if (statement.type === 'ForStatement') {
      if (statement.init?.type === 'VariableDeclaration') {
        visitStatement(statement.init)
      } else {
        visitExpression(statement.init)
      }

      visitExpression(statement.test)
      visitExpression(statement.update)
      visitStatement(statement.body)
      return
    }

    if (statement.type === 'ForOfStatement') {
      visitExpression(statement.iterable)
      visitStatement(statement.body)
      return
    }

    if (statement.type === 'SwitchStatement') {
      visitExpression(statement.discriminant)
      statement.cases.forEach((item) => {
        visitExpression(item.test)
        item.consequent.forEach(visitStatement)
      })
      return
    }

    if (statement.type === 'TryStatement') {
      visitStatement(statement.block)
      visitStatement(statement.handler?.body)
      visitStatement(statement.finalizer)
    }
  }
  const visitExpression = (expression) => {
    if (expression == null) {
      return
    }

    if (expression.type === 'CallExpression') {
      if (isHttpCreateServerCall(expression, context)) {
        register(expression.args[0])
      }

      if (isHttpRequestEventCall(expression) && expression.args[0]?.type === 'StringLiteral') {
        register(expression.args[1])
      }

      visitExpression(expression.callee)
      expression.args.forEach(visitExpression)
      return
    }

    if (expression.type === 'OptionalCallExpression' || expression.type === 'NewExpression') {
      visitExpression(expression.callee)
      expression.args.forEach(visitExpression)
      return
    }

    if (expression.type === 'ArrowFunctionExpression') {
      if (expression.expressionBody) {
        visitExpression(expression.body)
      } else {
        expression.body.forEach(visitStatement)
      }

      return
    }

    if (expression.type === 'AssignmentExpression') {
      visitExpression(expression.target)
      visitExpression(expression.value)
      return
    }

    if (expression.type === 'BinaryExpression') {
      visitExpression(expression.left)
      visitExpression(expression.right)
      return
    }

    if (
      expression.type === 'UnaryExpression' ||
      expression.type === 'UpdateExpression' ||
      expression.type === 'AwaitExpression'
    ) {
      visitExpression(expression.argument)
      return
    }

    if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
      visitExpression(expression.object)
      return
    }

    if (expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression') {
      visitExpression(expression.object)
      visitExpression(expression.index)
      return
    }

    if (expression.type === 'ArrayLiteral') {
      expression.elements.forEach(visitExpression)
      return
    }

    if (expression.type === 'ObjectLiteral') {
      expression.properties.forEach((property) => visitExpression(property.value))
    }
  }

  for (const ir of irPrograms) {
    for (const item of collectIrTopLevelNodeEntries(ir)) {
      if (item.kind === 'function') {
        item.node.body.forEach(visitStatement)
      } else if (item.kind === 'statement') {
        visitStatement(item.node)
      }
    }
  }

  return handlers
}
