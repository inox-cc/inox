import { diagnostic } from '../../diagnostics.ts'
import { collectIrTopLevelNodeEntries } from '../../ir.ts'
import {
  createFunctionContext,
  emitEventLoopReference,
  emitStatusCheck,
  nextCName,
  registerEventLoop
} from '../context.ts'
import { cStringLiteral, utf8ByteLength } from '../identifiers.ts'
import { cJsonRuntimeCallName } from './json.ts'
import type { CEmitContext, CFunctionContext } from '../context.ts'
import type { AnyNode, IrProgram, SourceLocation } from '../../types.ts'
import type { CHttpHandler, CPreparedExpression as PreparedExpression } from '../types.ts'

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

type HttpStaticStringContext = {
  stringLocals: Map<string, string>
}

type HttpServerCreateOptions = {
  declare: boolean | undefined
}

export type HttpLoweringDependencies = {
  emitPreparedNumberExpression: (expression: AnyNode, context: CFunctionContext) => PreparedExpression
  emitStatementList: (body: AnyNode[], context: CFunctionContext) => string[]
}

function httpNodeLoc(node: AnyNode | null | undefined): SourceLocation | null {
  if (node == null) {
    return null
  }

  return node.loc
}

function pushHttpLines(target: string[], lines: string[]): void {
  for (const line of lines) {
    target.push(line)
  }
}

function pushHttpNodes(target: AnyNode[], nodes: AnyNode[]): void {
  for (const node of nodes) {
    target.push(node)
  }
}

function pushIndentedHttpLines(target: string[], lines: string[]): void {
  for (const line of lines) {
    target.push('  ' + line)
  }
}

export function emitHttpHandlerHead(wrapper: CHttpHandler): string {
  return `static ccjs_status ${wrapper.name}(void* user, const ccjs_http_request* ccjs_request, ccjs_http_response* ccjs_response)`
}

export function emitHttpHandlerDeclaration(
  wrapper: CHttpHandler,
  baseContext: CEmitContext,
  deps: HttpLoweringDependencies
): string[] {
  const context = createFunctionContext(baseContext, 'void', false)
  const expression = wrapper.expression
  const firstParam = expression.params[0]
  const secondParam = expression.params[1]
  let requestName: string | null = null
  let responseName: string | null = null

  if (firstParam != null) {
    requestName = firstParam.name
  }

  if (secondParam != null) {
    responseName = secondParam.name
  }

  const httpContext: HttpHandlerContext = {
    requestName: requestName,
    responseName: responseName,
    stringLocals: new Map()
  }
  context.statusReturn = true

  if (requestName != null) {
    context.variables.set(requestName, 'http-request')
  }

  if (responseName != null) {
    context.variables.set(responseName, 'http-response')
  }

  const body: AnyNode[] = []

  if (expression.expressionBody) {
    body.push({
      type: 'ExpressionStatement',
      expression: expression.body,
      loc: expression.loc
    })
  } else {
    pushHttpNodes(body, expression.body)
  }

  const lines = [`${emitHttpHandlerHead(wrapper)} {`, '  (void)user;']

  if (requestName == null) {
    lines.push('  (void)ccjs_request;')
  } else {
    lines.push(`  const ccjs_http_request* ${requestName} = ccjs_request;`)
  }

  if (responseName == null) {
    lines.push('  (void)ccjs_response;')
  } else {
    lines.push(`  ccjs_http_response* ${responseName} = ccjs_response;`)
  }

  for (const statement of body) {
    pushIndentedHttpLines(lines, emitHttpHandlerStatement(statement, httpContext, context, deps))
  }

  lines.push('  return CCJS_OK;')
  lines.push('}')

  return lines
}

function emitHttpHandlerStatement(
  statement: AnyNode | null | undefined,
  httpContext: HttpHandlerContext,
  context: CFunctionContext,
  deps: HttpLoweringDependencies
): string[] {
  if (statement == null) {
    return []
  }

  if (statement.type === 'BlockStatement') {
    const lines = ['{']

    for (const item of statement.body) {
      pushIndentedHttpLines(lines, emitHttpHandlerStatement(item, httpContext, context, deps))
    }

    lines.push('}')
    return lines
  }

  if (statement.type === 'IfStatement') {
    const condition = emitHttpConditionExpression(statement.condition, httpContext, context)
    const consequent = emitHttpHandlerStatement(statement.consequent, httpContext, context, deps)
    const lines = [`if (${condition}) {`]

    pushIndentedHttpLines(lines, consequent)

    if (statement.alternate == null) {
      lines.push('}')
      return lines
    }

    lines.push('} else {')
    pushIndentedHttpLines(lines, emitHttpHandlerStatement(statement.alternate, httpContext, context, deps))
    lines.push('}')
    return lines
  }

  if (statement.type === 'VariableDeclaration') {
    const stringValue = emitHttpStaticStringValue(statement.init, httpContext, context)

    if (stringValue != null) {
      httpContext.stringLocals.set(statement.name, stringValue)
      return []
    }

    context.diagnostics.push(
      diagnostic(
        'CCJS_HTTP_HANDLER',
        'HTTP request listeners in the C backend currently support only static string local declarations',
        statement.loc
      )
    )
    return []
  }

  if (statement.type === 'ExpressionStatement') {
    if (statement.expression != null && statement.expression.type === 'CallExpression') {
      const responseCall = emitHttpResponseCallStatement(statement.expression, httpContext, context)

      if (responseCall != null) {
        return responseCall
      }
    }

    if (statement.expression != null && statement.expression.type === 'AssignmentExpression') {
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
    if (statement.argument != null && statement.argument.type === 'CallExpression') {
      const responseCall = emitHttpResponseCallStatement(statement.argument, httpContext, context)

      if (responseCall != null) {
        const lines: string[] = []

        pushHttpLines(lines, responseCall)
        lines.push('return CCJS_OK;')

        return lines
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

function emitHttpResponseStatusAssignment(
  expression: AnyNode,
  httpContext: HttpHandlerContext,
  context: CFunctionContext
): string[] | null {
  if (
    expression.target == null ||
    expression.target.type !== 'MemberExpression' ||
    expression.target.property !== 'statusCode' ||
    !isHttpResponseReference(expression.target.object, httpContext)
  ) {
    return null
  }

  const status = emitHttpStatusCodeExpression(expression.value, context)

  return emitHttpStatusCheck(`ccjs_http_response_set_status(${httpContext.responseName}, ${status})`, context)
}

function emitHttpResponseCallStatement(
  expression: AnyNode,
  httpContext: HttpHandlerContext,
  context: CFunctionContext
): string[] | null {
  if (
    expression.callee == null ||
    expression.callee.type !== 'MemberExpression' ||
    !isHttpResponseReference(expression.callee.object, httpContext)
  ) {
    return null
  }

  const method = expression.callee.property

  if (method === 'setHeader') {
    const name = emitHttpStringBytesOperand(expression.args[0], httpContext, context)
    const value = emitHttpStringBytesOperand(expression.args[1], httpContext, context)
    const lines: string[] = []

    pushHttpLines(lines, name.lines)
    pushHttpLines(lines, value.lines)
    pushHttpLines(
      lines,
      emitHttpStatusCheck(
        `ccjs_http_response_set_header(${httpContext.responseName}, ${name.bytes}, ${name.length}, ${value.bytes}, ${value.length})`,
        context
      )
    )

    return lines
  }

  if (method === 'writeHead') {
    const status = emitHttpStatusCodeExpression(expression.args[0], context)
    const headers = emitHttpHeaderArray(expression.args[1], context)
    const lines: string[] = []

    pushHttpLines(lines, headers.lines)
    pushHttpLines(
      lines,
      emitHttpStatusCheck(
        `ccjs_http_response_write_head(${httpContext.responseName}, ${status}, ${headers.name}, ${headers.count})`,
        context
      )
    )

    return lines
  }

  if (method === 'write' || method === 'end') {
    const body = emitHttpStringBytesOperand(expression.args[0], httpContext, context)
    let runtime = 'ccjs_http_response_end'
    const lines: string[] = []

    if (method === 'write') {
      runtime = 'ccjs_http_response_write'
    }

    pushHttpLines(lines, body.lines)
    pushHttpLines(lines, emitHttpStatusCheck(`${runtime}(${httpContext.responseName}, ${body.bytes}, ${body.length})`, context))

    return lines
  }

  return null
}

function emitHttpHeaderArray(expression: AnyNode | null | undefined, context: CFunctionContext): HttpHeaderArray {
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
  const staticContext: HttpStaticStringContext = {
    stringLocals: new Map()
  }

  for (const property of expression.properties) {
    const value = emitHttpStaticStringValue(property.value, staticContext, context)

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
    lines: lines,
    name: name,
    count: `${expression.properties.length}`
  }
}

function emitHttpConditionExpression(
  expression: AnyNode | null | undefined,
  httpContext: HttpHandlerContext,
  context: CFunctionContext
): string {
  if (expression == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_HTTP_HANDLER',
        'HTTP request listener conditions in the C backend currently support req.method/req.url string comparisons',
        null
      )
    )
    return '0'
  }

  if (expression.type === 'BooleanLiteral') {
    if (expression.value) {
      return '1'
    }

    return '0'
  }

  if (expression.type === 'UnaryExpression' && expression.operator === '!') {
    return `!(${emitHttpConditionExpression(expression.argument, httpContext, context)})`
  }

  if (expression.type === 'BinaryExpression') {
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
      expression.loc
    )
  )
  return '0'
}

function isHttpEqualityOperator(operator: string): boolean {
  return operator === '===' || operator === '==' || operator === '!==' || operator === '!='
}

function isHttpNegativeEqualityOperator(operator: string): boolean {
  return operator === '!==' || operator === '!='
}

function emitHttpRequestStringCompareExpression(
  expression: AnyNode,
  httpContext: HttpHandlerContext,
  context: CFunctionContext
): string | null {
  if (!isHttpEqualityOperator(expression.operator)) {
    return null
  }

  const left = resolveHttpRequestStringMember(expression.left, httpContext)
  const right = resolveHttpRequestStringMember(expression.right, httpContext)
  let literalExpression = expression.left
  let member = right

  if (left != null) {
    literalExpression = expression.right
    member = left
  }

  const literal = emitHttpStaticStringValue(literalExpression, httpContext, context)

  if (member == null || literal == null) {
    return null
  }

  let runtime = `ccjs_http_request_url_equals(${httpContext.requestName}, ${cStringLiteral(literal)}, ${utf8ByteLength(literal)})`

  if (member === 'method') {
    runtime = `ccjs_http_request_method_equals(${httpContext.requestName}, ${cStringLiteral(literal)}, ${utf8ByteLength(literal)})`
  }

  if (isHttpNegativeEqualityOperator(expression.operator)) {
    return `!(${runtime})`
  }

  return runtime
}

function emitHttpStringBytesOperand(
  expression: AnyNode | null | undefined,
  httpContext: HttpHandlerContext,
  context: CFunctionContext
): HttpStringBytesOperand {
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

function emitHttpStaticStringValue(
  expression: AnyNode | null | undefined,
  httpContext: HttpStaticStringContext,
  context: CFunctionContext
): string | null {
  if (expression == null) {
    return null
  }

  if (expression.type === 'StringLiteral') {
    return expression.value
  }

  if (expression.type === 'TemplateLiteral' && !expression.raw.includes('${')) {
    return expression.raw.slice(1, -1)
  }

  if (expression.type === 'NumberLiteral') {
    return expression.value
  }

  if (expression.type === 'BooleanLiteral') {
    if (expression.value) {
      return 'true'
    }

    return 'false'
  }

  if (expression.type === 'Reference' && expression.path.length === 1) {
    return emitHttpStaticStringLocalValue(expression, httpContext)
  }

  return emitHttpStaticJsonStringifyValue(expression, context)
}

function emitHttpStaticStringLocalValue(expression: AnyNode, httpContext: HttpStaticStringContext): string | null {
  const value = httpContext.stringLocals.get(expression.path[0])

  if (value != null) {
    return value
  }

  return null
}

function emitHttpStaticJsonStringifyValue(
  expression: AnyNode | null | undefined,
  context: CFunctionContext
): string | null {
  if (
    expression == null ||
    expression.type !== 'CallExpression' ||
    cJsonRuntimeCallName(expression.callee) !== 'stringify' ||
    expression.args.length !== 1
  ) {
    return null
  }

  return emitHttpStaticJsonValue(expression.args[0], context)
}

function emitHttpStaticJsonValue(expression: AnyNode | null | undefined, context: CFunctionContext): string | null {
  if (expression == null) {
    return null
  }

  if (expression.type === 'StringLiteral') {
    return JSON.stringify(expression.value)
  }

  if (expression.type === 'TemplateLiteral' && !expression.raw.includes('${')) {
    return JSON.stringify(expression.raw.slice(1, -1))
  }

  if (expression.type === 'NumberLiteral') {
    return expression.value
  }

  if (expression.type === 'BooleanLiteral') {
    if (expression.value) {
      return 'true'
    }

    return 'false'
  }

  if (expression.type === 'NullLiteral') {
    return 'null'
  }

  if (expression.type === 'ArrayLiteral') {
    const items: string[] = []

    for (const item of expression.elements) {
      const value = emitHttpStaticJsonValue(item, context)

      if (value != null) {
        items.push(value)
      } else {
        return null
      }
    }

    return `[${items.join(',')}]`
  }

  if (expression.type === 'ObjectLiteral') {
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

function emitHttpStatusCodeExpression(expression: AnyNode | null | undefined, context: CFunctionContext): string {
  if (expression != null && expression.type === 'NumberLiteral') {
    return `(int)(${expression.value})`
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_HTTP_HANDLER',
      'HTTP status values in the C backend currently must be numeric literals',
      httpNodeLoc(expression)
    )
  )
  return '200'
}

function emitHttpStatusCheck(call: string, context: CFunctionContext): string[] {
  const status = nextCName(context, 'ccjs_http_status')

  return ['{', `  ccjs_status ${status} = ${call};`, `  if (${status} != CCJS_OK) return ${status};`, '}']
}

function isHttpResponseReference(expression: AnyNode, httpContext: HttpHandlerContext): boolean {
  if (httpContext.responseName == null) {
    return false
  }

  if (expression.type !== 'Reference') {
    return false
  }

  return expression.path.length === 1 && expression.path[0] === httpContext.responseName
}

function resolveHttpRequestStringMember(expression: AnyNode, httpContext: HttpHandlerContext): string | null {
  if (
    httpContext.requestName == null ||
    expression.type !== 'MemberExpression' ||
    expression.object == null ||
    expression.object.type !== 'Reference' ||
    expression.object.path.length !== 1 ||
    expression.object.path[0] !== httpContext.requestName
  ) {
    return null
  }

  if (expression.property === 'method' || expression.property === 'url') {
    return expression.property
  }

  return null
}

export function emitHttpServerVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[] | null {
  if (!isHttpCreateServerCall(statement.init, context)) {
    return null
  }

  context.variables.set(statement.name, 'http-server')
  registerEventLoop(context)

  return emitHttpServerCreateLines(statement.init, statement.name, context, null)
}

export function emitHttpServerCallStatement(
  expression: AnyNode,
  context: CFunctionContext,
  deps: HttpLoweringDependencies
): string[] | null {
  const callee = expression.callee

  if (
    callee != null &&
    callee.type === 'MemberExpression' &&
    callee.property === 'listen' &&
    isHttpCreateServerCall(callee.object, context)
  ) {
    const serverName = nextCName(context, 'ccjs_http_server')
    const lines = [`ccjs_http_server* ${serverName} = 0;`]
    registerEventLoop(context)

    pushHttpLines(
      lines,
      emitHttpServerCreateLines(callee.object, serverName, context, {
        declare: false
      })
    )
    pushHttpLines(lines, emitHttpServerListenLines(serverName, expression.args, context, deps))

    return lines
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

function emitHttpServerCreateLines(
  expression: AnyNode,
  serverName: string,
  context: CFunctionContext,
  options: HttpServerCreateOptions | null
): string[] {
  const listener = expression.args[0]
  let wrapper: CHttpHandler | null = null

  if (context.httpHandlers.has(listener)) {
    const registeredWrapper = context.httpHandlers.get(listener)

    if (registeredWrapper != null) {
      wrapper = registeredWrapper
    }
  }

  if (listener != null && (listener.type !== 'ArrowFunctionExpression' || wrapper == null)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_HTTP_SERVER',
        'http.createServer in the C backend currently requires an inline request listener',
        expression.loc
      )
    )
  }

  const lines: string[] = []

  if (options == null || options.declare !== false) {
    lines.push(`ccjs_http_server* ${serverName} = 0;`)
  }

  let wrapperName = '0'

  if (wrapper != null) {
    wrapperName = wrapper.name
  }

  lines.push(
    emitStatusCheck(
      `ccjs_http_server_new(${emitEventLoopReference(context)}, ${wrapperName}, 0, &${serverName})`,
      context
    )
  )

  return lines
}

function emitHttpServerListenLines(
  serverName: string,
  args: AnyNode[],
  context: CFunctionContext,
  deps: HttpLoweringDependencies
): string[] {
  if (args.length < 1) {
    context.diagnostics.push(
      diagnostic('CCJS_HTTP_SERVER', 'server.listen in the C backend currently requires a port argument')
    )

    return []
  }

  let secondArg: AnyNode | null = null

  if (args.length > 1) {
    secondArg = args[1]
  }

  let hostArg: AnyNode | null | undefined = secondArg
  let callback: AnyNode | null | undefined = args[2]

  if (secondArg != null && secondArg.type === 'ArrowFunctionExpression') {
    hostArg = null
    callback = secondArg
  }

  if (args.length > 3) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_HTTP_SERVER',
        'server.listen in the C backend currently supports port, optional host and optional callback',
        httpNodeLoc(args[3])
      )
    )
  }

  const port = deps.emitPreparedNumberExpression(args[0], context)
  const host = emitHttpListenHostExpression(hostArg, context)
  const lines: string[] = []

  pushHttpLines(lines, port.lines)
  lines.push(emitStatusCheck(`ccjs_http_server_listen(${serverName}, ${host}, (int)(${port.expression}), 128)`, context))
  pushHttpLines(lines, emitHttpZeroArgCallbackLines(callback, context, deps))

  return lines
}

function emitHttpServerOnRequestLines(serverName: string, args: AnyNode[], context: CFunctionContext): string[] {
  let eventArg: AnyNode | null = null

  if (args.length > 0) {
    eventArg = args[0]
  }

  if (eventArg == null || eventArg.type !== 'StringLiteral' || eventArg.value !== 'request') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_HTTP_SERVER',
        "server.on in the C backend currently supports only the 'request' event",
        httpNodeLoc(eventArg)
      )
    )
    return []
  }

  let listener: AnyNode | null = null
  let wrapper: CHttpHandler | null = null

  if (args.length > 1) {
    listener = args[1]
  }

  if (listener != null && context.httpHandlers.has(listener)) {
    const registeredWrapper = context.httpHandlers.get(listener)

    if (registeredWrapper != null) {
      wrapper = registeredWrapper
    }
  }

  if (listener == null || listener.type !== 'ArrowFunctionExpression' || wrapper == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_HTTP_SERVER',
        "server.on('request') in the C backend currently requires an inline request listener",
        httpNodeLoc(listener)
      )
    )
    return []
  }

  return [emitStatusCheck(`ccjs_http_server_on_request(${serverName}, ${wrapper.name}, 0)`, context)]
}

function emitHttpServerCloseLines(
  serverName: string,
  args: AnyNode[],
  context: CFunctionContext,
  deps: HttpLoweringDependencies
): string[] {
  if (args.length > 1) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_HTTP_SERVER',
        'server.close in the C backend supports only an optional callback',
        httpNodeLoc(args[1])
      )
    )
  }

  const lines = [`ccjs_http_server_close(${serverName});`]

  pushHttpLines(lines, emitHttpZeroArgCallbackLines(args[0], context, deps))

  return lines
}

function emitHttpZeroArgCallbackLines(
  callback: AnyNode | null | undefined,
  context: CFunctionContext,
  deps: HttpLoweringDependencies
): string[] {
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

  const body: AnyNode[] = []

  if (callback.expressionBody) {
    body.push({
      type: 'ExpressionStatement',
      expression: callback.body,
      loc: callback.loc
    })
  } else {
    pushHttpNodes(body, callback.body)
  }

  return deps.emitStatementList(body, context)
}

function emitHttpListenHostExpression(expression: AnyNode | null | undefined, context: CFunctionContext): string {
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

function isHttpServerMethodCall(expression: AnyNode, method: string, context: CFunctionContext): boolean {
  if (expression.type !== 'CallExpression') {
    return false
  }

  if (expression.callee == null || expression.callee.type !== 'MemberExpression') {
    return false
  }

  if (expression.callee.property !== method) {
    return false
  }

  if (expression.callee.object == null || expression.callee.object.type !== 'Reference') {
    return false
  }

  return (
    expression.callee.object.path.length === 1 &&
    context.variables.get(expression.callee.object.path[0]) === 'http-server'
  )
}

function isHttpCreateServerCall(expression: AnyNode | null | undefined, context: CEmitContext): boolean {
  if (expression == null || expression.type !== 'CallExpression') {
    return false
  }

  if (
    expression.callee != null &&
    expression.callee.type === 'Reference' &&
    expression.callee.path.length === 1 &&
    context.httpCreateServerNames.has(expression.callee.path[0])
  ) {
    return true
  }

  return (
    expression.callee != null &&
    expression.callee.type === 'MemberExpression' &&
    expression.callee.property === 'createServer' &&
    expression.callee.object != null &&
    expression.callee.object.type === 'Reference' &&
    expression.callee.object.path.length === 1 &&
    context.httpImportNames.has(expression.callee.object.path[0])
  )
}

function isHttpRequestEventCall(expression: AnyNode): boolean {
  if (expression.type !== 'CallExpression') {
    return false
  }

  if (expression.callee == null || expression.callee.type !== 'MemberExpression') {
    return false
  }

  if (expression.callee.property !== 'on') {
    return false
  }

  if (expression.args.length === 0 || expression.args[0].type !== 'StringLiteral') {
    return false
  }

  return expression.args[0].value === 'request'
}

export function collectHttpHandlers(irPrograms: IrProgram[], context: CEmitContext): Map<AnyNode, CHttpHandler> {
  const handlers: Map<AnyNode, CHttpHandler> = new Map()

  for (const ir of irPrograms) {
    for (const item of collectIrTopLevelNodeEntries(ir)) {
      if (item.kind === 'function') {
        for (const statement of item.node.body) {
          visitHttpHandlerStatement(handlers, context, statement)
        }
      } else if (item.kind === 'statement') {
        visitHttpHandlerStatement(handlers, context, item.node)
      }
    }
  }

  return handlers
}

function registerHttpHandler(handlers: Map<AnyNode, CHttpHandler>, expression: AnyNode | null | undefined): void {
  if (expression == null || expression.type !== 'ArrowFunctionExpression') {
    return
  }

  if (handlers.has(expression)) {
    return
  }

  handlers.set(expression, {
    name: `ccjs_http_handler_${handlers.size}`,
    expression: expression
  })
}

function visitHttpHandlerStatement(
  handlers: Map<AnyNode, CHttpHandler>,
  context: CEmitContext,
  statement: AnyNode | null | undefined
): void {
  if (statement == null) {
    return
  }

  if (statement.type === 'VariableDeclaration') {
    visitHttpHandlerExpression(handlers, context, statement.init)
    return
  }

  if (statement.type === 'ExpressionStatement') {
    visitHttpHandlerExpression(handlers, context, statement.expression)
    return
  }

  if (statement.type === 'ReturnStatement' || statement.type === 'ThrowStatement') {
    visitHttpHandlerExpression(handlers, context, statement.argument)
    return
  }

  if (statement.type === 'BlockStatement') {
    for (const item of statement.body) {
      visitHttpHandlerStatement(handlers, context, item)
    }
    return
  }

  if (statement.type === 'IfStatement') {
    visitHttpHandlerExpression(handlers, context, statement.condition)
    visitHttpHandlerStatement(handlers, context, statement.consequent)
    visitHttpHandlerStatement(handlers, context, statement.alternate)
    return
  }

  if (statement.type === 'WhileStatement') {
    visitHttpHandlerExpression(handlers, context, statement.condition)
    visitHttpHandlerStatement(handlers, context, statement.body)
    return
  }

  if (statement.type === 'ForStatement') {
    if (statement.init != null && statement.init.type === 'VariableDeclaration') {
      visitHttpHandlerStatement(handlers, context, statement.init)
    } else {
      visitHttpHandlerExpression(handlers, context, statement.init)
    }

    visitHttpHandlerExpression(handlers, context, statement.test)
    visitHttpHandlerExpression(handlers, context, statement.update)
    visitHttpHandlerStatement(handlers, context, statement.body)
    return
  }

  if (statement.type === 'ForOfStatement') {
    visitHttpHandlerExpression(handlers, context, statement.iterable)
    visitHttpHandlerStatement(handlers, context, statement.body)
    return
  }

  if (statement.type === 'SwitchStatement') {
    visitHttpHandlerExpression(handlers, context, statement.discriminant)
    for (const item of statement.cases) {
      visitHttpHandlerExpression(handlers, context, item.test)
      for (const consequent of item.consequent) {
        visitHttpHandlerStatement(handlers, context, consequent)
      }
    }
    return
  }

  if (statement.type === 'TryStatement') {
    const handler = statement.handler
    visitHttpHandlerStatement(handlers, context, statement.block)
    if (handler != null) {
      visitHttpHandlerStatement(handlers, context, handler.body)
    }
    visitHttpHandlerStatement(handlers, context, statement.finalizer)
  }
}

function visitHttpHandlerExpression(
  handlers: Map<AnyNode, CHttpHandler>,
  context: CEmitContext,
  expression: AnyNode | null | undefined
): void {
  if (expression == null) {
    return
  }

  if (expression.type === 'CallExpression') {
    if (isHttpCreateServerCall(expression, context)) {
      registerHttpHandler(handlers, expression.args[0])
    }

    if (isHttpRequestEventCall(expression)) {
      registerHttpHandler(handlers, expression.args[1])
    }

    visitHttpHandlerExpression(handlers, context, expression.callee)
    for (const arg of expression.args) {
      visitHttpHandlerExpression(handlers, context, arg)
    }
    return
  }

  if (expression.type === 'OptionalCallExpression' || expression.type === 'NewExpression') {
    visitHttpHandlerExpression(handlers, context, expression.callee)
    for (const arg of expression.args) {
      visitHttpHandlerExpression(handlers, context, arg)
    }
    return
  }

  if (expression.type === 'ArrowFunctionExpression') {
    if (expression.expressionBody) {
      visitHttpHandlerExpression(handlers, context, expression.body)
    } else {
      for (const statement of expression.body) {
        visitHttpHandlerStatement(handlers, context, statement)
      }
    }

    return
  }

  if (expression.type === 'AssignmentExpression') {
    visitHttpHandlerExpression(handlers, context, expression.target)
    visitHttpHandlerExpression(handlers, context, expression.value)
    return
  }

  if (expression.type === 'BinaryExpression') {
    visitHttpHandlerExpression(handlers, context, expression.left)
    visitHttpHandlerExpression(handlers, context, expression.right)
    return
  }

  if (
    expression.type === 'UnaryExpression' ||
    expression.type === 'UpdateExpression' ||
    expression.type === 'AwaitExpression'
  ) {
    visitHttpHandlerExpression(handlers, context, expression.argument)
    return
  }

  if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
    visitHttpHandlerExpression(handlers, context, expression.object)
    return
  }

  if (expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression') {
    visitHttpHandlerExpression(handlers, context, expression.object)
    visitHttpHandlerExpression(handlers, context, expression.index)
    return
  }

  if (expression.type === 'ArrayLiteral') {
    for (const element of expression.elements) {
      visitHttpHandlerExpression(handlers, context, element)
    }
    return
  }

  if (expression.type === 'ObjectLiteral') {
    for (const property of expression.properties) {
      visitHttpHandlerExpression(handlers, context, property.value)
    }
  }
}
