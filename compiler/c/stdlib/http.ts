import { diagnostic } from '../../diagnostics.ts'
import { collectIrTopLevelNodeEntries } from '../../ir.ts'
import type { AnyNode, IrProgram, SourceLocation } from '../../types.ts'
import type { CEmitContext, CFunctionContext } from '../context.ts'
import {
  createFunctionContext,
  emitEventLoopReference,
  emitStatusCheck,
  nextCName,
  registerEventLoop
} from '../context.ts'
import { cStringLiteral, utf8ByteLength } from '../identifiers.ts'
import type { CHttpHandler, CPreparedExpression as PreparedExpression } from '../types.ts'
import { cJsonRuntimeCallName } from './json.ts'

type HttpAstNode = AnyNode

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

type HttpFunctionContext = CFunctionContext & {
  variables: Map<string, string>
}

type HttpStaticStringContext = {
  stringLocals: Map<string, string>
}

type HttpServerCreateOptions = {
  declare: boolean | undefined
}

type HttpTopLevelNodeEntry = {
  kind: string
  node: HttpAstNode
}

export type HttpLoweringDependencies = {
  emitPreparedNumberExpression: (expression: HttpAstNode, context: CFunctionContext) => PreparedExpression
  emitStatementList: (body: HttpAstNode[], context: CFunctionContext) => string[]
}

function httpNodeLoc(node: HttpAstNode | null | undefined): SourceLocation | null {
  if (node === null || typeof node === 'undefined') {
    return null
  }

  return node.loc
}

function pushHttpLines(target: string[], lines: string[]): void {
  for (const line of lines) {
    target.push(line)
  }
}

function pushHttpNodes(target: HttpAstNode[], nodes: HttpAstNode[]): void {
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
  return `static inox_status ${wrapper.name}(void* user, const inox_http_request* inox_request, inox_http_response* inox_response)`
}

export function emitHttpHandlerDeclaration(
  wrapper: CHttpHandler,
  baseContext: CEmitContext,
  deps: HttpLoweringDependencies
): string[] {
  const context: HttpFunctionContext = createFunctionContext(baseContext, 'void', false)
  const expression = wrapper.expression
  const firstParam = expression.params[0]
  const secondParam = expression.params[1]
  let requestName: string | null = null
  let responseName: string | null = null

  if (firstParam !== null && typeof firstParam !== 'undefined') {
    requestName = firstParam.name
  }

  if (secondParam !== null && typeof secondParam !== 'undefined') {
    responseName = secondParam.name
  }

  const httpContext: HttpHandlerContext = {
    requestName: requestName,
    responseName: responseName,
    stringLocals: new Map()
  }
  context.statusReturn = true

  if (requestName !== null && typeof requestName !== 'undefined') {
    context.variables.set(requestName, 'http-request')
  }

  if (responseName !== null && typeof responseName !== 'undefined') {
    context.variables.set(responseName, 'http-response')
  }

  const body: HttpAstNode[] = []

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

  if (requestName === null || typeof requestName === 'undefined') {
    lines.push('  (void)inox_request;')
  } else {
    lines.push(`  const inox_http_request* ${requestName} = inox_request;`)
  }

  if (responseName === null || typeof responseName === 'undefined') {
    lines.push('  (void)inox_response;')
  } else {
    lines.push(`  inox_http_response* ${responseName} = inox_response;`)
  }

  for (const statement of body) {
    pushIndentedHttpLines(lines, emitHttpHandlerStatement(statement, httpContext, context, deps))
  }

  lines.push('  return INOX_OK;')
  lines.push('}')

  return lines
}

function emitHttpHandlerStatement(
  statement: AnyNode | null | undefined,
  httpContext: HttpHandlerContext,
  context: CFunctionContext,
  deps: HttpLoweringDependencies
): string[] {
  if (statement === null || typeof statement === 'undefined') {
    return []
  }

  if (statement.type === 'BlockStatement') {
    const lines = ['{']
    const statements: HttpAstNode[] = statement.body

    for (const item of statements) {
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

    if (statement.alternate === null || typeof statement.alternate === 'undefined') {
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

    if (stringValue !== null && typeof stringValue !== 'undefined') {
      httpContext.stringLocals.set(statement.name, stringValue)
      return []
    }

    context.diagnostics.push(
      diagnostic(
        'INOX_HTTP_HANDLER',
        'HTTP request listeners in the C backend currently support only static string local declarations',
        statement.loc
      )
    )
    return []
  }

  if (statement.type === 'ExpressionStatement') {
    if (
      statement.expression !== null &&
      typeof statement.expression !== 'undefined' &&
      statement.expression.type === 'CallExpression'
    ) {
      const responseCall = emitHttpResponseCallStatement(statement.expression, httpContext, context)

      if (responseCall !== null && typeof responseCall !== 'undefined') {
        return responseCall
      }
    }

    if (
      statement.expression !== null &&
      typeof statement.expression !== 'undefined' &&
      statement.expression.type === 'AssignmentExpression'
    ) {
      const statusAssignment = emitHttpResponseStatusAssignment(statement.expression, httpContext, context)

      if (statusAssignment !== null && typeof statusAssignment !== 'undefined') {
        return statusAssignment
      }
    }

    context.diagnostics.push(
      diagnostic(
        'INOX_HTTP_HANDLER',
        'this HTTP request listener statement is not supported by the current C backend slice',
        statement.loc
      )
    )
    return []
  }

  if (statement.type === 'ReturnStatement') {
    if (
      statement.argument !== null &&
      typeof statement.argument !== 'undefined' &&
      statement.argument.type === 'CallExpression'
    ) {
      const responseCall = emitHttpResponseCallStatement(statement.argument, httpContext, context)

      if (responseCall !== null && typeof responseCall !== 'undefined') {
        const lines: string[] = []

        pushHttpLines(lines, responseCall)
        lines.push('return INOX_OK;')

        return lines
      }
    }

    return ['return INOX_OK;']
  }

  context.diagnostics.push(
    diagnostic(
      'INOX_HTTP_HANDLER',
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
    expression.target === null ||
    typeof expression.target === 'undefined' ||
    expression.target.type !== 'MemberExpression' ||
    expression.target.property !== 'statusCode' ||
    !isHttpResponseReference(expression.target.object, httpContext)
  ) {
    return null
  }

  const status = emitHttpStatusCodeExpression(expression.value, context)

  return emitHttpStatusCheck(`inox_http_response_set_status(${httpContext.responseName}, ${status})`, context)
}

function emitHttpResponseCallStatement(
  expression: AnyNode,
  httpContext: HttpHandlerContext,
  context: CFunctionContext
): string[] | null {
  if (
    expression.callee === null ||
    typeof expression.callee === 'undefined' ||
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
        `inox_http_response_set_header(${httpContext.responseName}, ${name.bytes}, ${name.length}, ${value.bytes}, ${value.length})`,
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
        `inox_http_response_write_head(${httpContext.responseName}, ${status}, ${headers.name}, ${headers.count})`,
        context
      )
    )

    return lines
  }

  if (method === 'write' || method === 'end') {
    const body = emitHttpStringBytesOperand(expression.args[0], httpContext, context)
    let runtime = 'inox_http_response_end'
    const lines: string[] = []

    if (method === 'write') {
      runtime = 'inox_http_response_write'
    }

    pushHttpLines(lines, body.lines)
    pushHttpLines(
      lines,
      emitHttpStatusCheck(`${runtime}(${httpContext.responseName}, ${body.bytes}, ${body.length})`, context)
    )

    return lines
  }

  return null
}

function emitHttpHeaderArray(expression: AnyNode | null | undefined, context: CFunctionContext): HttpHeaderArray {
  if (expression === null || typeof expression === 'undefined') {
    return {
      lines: [],
      name: '0',
      count: '0'
    }
  }

  if (expression.type !== 'ObjectLiteral') {
    context.diagnostics.push(
      diagnostic(
        'INOX_HTTP_HANDLER',
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

  const name = nextCName(context, 'inox_http_headers')
  const properties: HttpAstNode[] = expression.properties
  const lines = [`inox_http_header ${name}[] = {`]
  const staticContext: HttpStaticStringContext = {
    stringLocals: new Map()
  }

  for (const property of properties) {
    const value = emitHttpStaticStringValue(property.value, staticContext, context)

    if (value === null || typeof value === 'undefined') {
      context.diagnostics.push(
        diagnostic(
          'INOX_HTTP_HANDLER',
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
  if (expression === null || typeof expression === 'undefined') {
    context.diagnostics.push(
      diagnostic(
        'INOX_HTTP_HANDLER',
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

    if (requestCompare !== null && typeof requestCompare !== 'undefined') {
      return requestCompare
    }
  }

  context.diagnostics.push(
    diagnostic(
      'INOX_HTTP_HANDLER',
      'HTTP request listener conditions in the C backend currently support req.method/req.url string comparisons',
      expression.loc
    )
  )
  return '0'
}

function isHttpEqualityOperator(operator: string): boolean {
  return operator === '===' || operator === '!=='
}

function isHttpNegativeEqualityOperator(operator: string): boolean {
  return operator === '!=='
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
  let literalExpression: AnyNode = expression.left
  let member: string | null = right

  if (left !== null && typeof left !== 'undefined') {
    literalExpression = expression.right
    member = left
  }

  const literal = emitHttpStaticStringValue(literalExpression, httpContext, context)

  if (member === null || typeof member === 'undefined' || literal === null || typeof literal === 'undefined') {
    return null
  }

  let runtime = `inox_http_request_url_equals(${httpContext.requestName}, ${cStringLiteral(literal)}, ${utf8ByteLength(literal)})`

  if (member === 'method') {
    runtime = `inox_http_request_method_equals(${httpContext.requestName}, ${cStringLiteral(literal)}, ${utf8ByteLength(literal)})`
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
  if (expression === null || typeof expression === 'undefined') {
    return {
      lines: [],
      bytes: '""',
      length: '0'
    }
  }

  const staticValue = emitHttpStaticStringValue(expression, httpContext, context)

  if (staticValue !== null && typeof staticValue !== 'undefined') {
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
      'INOX_HTTP_HANDLER',
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
  if (expression === null || typeof expression === 'undefined') {
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

  if (value !== null && typeof value !== 'undefined') {
    return value
  }

  return null
}

function emitHttpStaticJsonStringifyValue(
  expression: AnyNode | null | undefined,
  context: CFunctionContext
): string | null {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'CallExpression' ||
    cJsonRuntimeCallName(expression.callee) !== 'stringify' ||
    expression.args.length !== 1
  ) {
    return null
  }

  return emitHttpStaticJsonValue(expression.args[0], context)
}

function emitHttpStaticJsonValue(expression: AnyNode | null | undefined, context: CFunctionContext): string | null {
  if (expression === null || typeof expression === 'undefined') {
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
    const elements: HttpAstNode[] = expression.elements

    for (const item of elements) {
      const value = emitHttpStaticJsonValue(item, context)

      if (value !== null && typeof value !== 'undefined') {
        items.push(value)
      } else {
        return null
      }
    }

    return `[${joinStrings(items, ',')}]`
  }

  if (expression.type === 'ObjectLiteral') {
    const fields: string[] = []
    const properties: HttpAstNode[] = expression.properties

    for (const property of properties) {
      const value = emitHttpStaticJsonValue(property.value, context)

      if (value === null || typeof value === 'undefined') {
        return null
      }

      fields.push(`${JSON.stringify(property.key)}:${value}`)
    }

    return `{${joinStrings(fields, ',')}}`
  }

  return null
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

function emitHttpStatusCodeExpression(expression: AnyNode | null | undefined, context: CFunctionContext): string {
  if (expression !== null && typeof expression !== 'undefined' && expression.type === 'NumberLiteral') {
    return `(int)(${expression.value})`
  }

  context.diagnostics.push(
    diagnostic(
      'INOX_HTTP_HANDLER',
      'HTTP status values in the C backend currently must be numeric literals',
      httpNodeLoc(expression)
    )
  )
  return '200'
}

function emitHttpStatusCheck(call: string, context: CFunctionContext): string[] {
  const status = nextCName(context, 'inox_http_status')

  return ['{', `  inox_status ${status} = ${call};`, `  if (${status} != INOX_OK) return ${status};`, '}']
}

function isHttpResponseReference(expression: AnyNode, httpContext: HttpHandlerContext): boolean {
  const responseName = httpContext.responseName

  if (responseName === null || typeof responseName === 'undefined') {
    return false
  }

  if (expression.type !== 'Reference') {
    return false
  }

  const path: string[] = expression.path

  return path.length === 1 && path[0] === responseName
}

function resolveHttpRequestStringMember(expression: AnyNode, httpContext: HttpHandlerContext): string | null {
  const requestName = httpContext.requestName

  if (
    requestName === null ||
    typeof requestName === 'undefined' ||
    expression.type !== 'MemberExpression' ||
    expression.object === null ||
    typeof expression.object === 'undefined' ||
    expression.object.type !== 'Reference' ||
    expression.object.path.length !== 1
  ) {
    return null
  }

  const path: string[] = expression.object.path

  if (path[0] !== requestName) {
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
    callee !== null &&
    typeof callee !== 'undefined' &&
    callee.type === 'MemberExpression' &&
    callee.property === 'listen' &&
    isHttpCreateServerCall(callee.object, context)
  ) {
    const serverName = nextCName(context, 'inox_http_server')
    const lines = [`inox_http_server* ${serverName} = 0;`]
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
    const path: string[] = expression.callee.object.path
    const serverName = path[0]
    registerEventLoop(context)

    return emitHttpServerListenLines(serverName, expression.args, context, deps)
  }

  if (isHttpServerMethodCall(expression, 'on', context)) {
    const path: string[] = expression.callee.object.path
    const serverName = path[0]

    return emitHttpServerOnRequestLines(serverName, expression.args, context)
  }

  if (isHttpServerMethodCall(expression, 'close', context)) {
    const path: string[] = expression.callee.object.path
    const serverName = path[0]

    return emitHttpServerCloseLines(serverName, expression.args, context, deps)
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

  if (listener !== null && typeof listener !== 'undefined') {
    const registeredWrapper = findHttpHandler(context, listener)

    if (registeredWrapper !== null && typeof registeredWrapper !== 'undefined') {
      wrapper = registeredWrapper
    }
  }

  if (
    listener !== null &&
    typeof listener !== 'undefined' &&
    (listener.type !== 'ArrowFunctionExpression' || wrapper === null || typeof wrapper === 'undefined')
  ) {
    context.diagnostics.push(
      diagnostic(
        'INOX_HTTP_SERVER',
        'http.createServer in the C backend currently requires an inline request listener',
        expression.loc
      )
    )
  }

  const lines: string[] = []

  if (options === null || typeof options === 'undefined' || options.declare !== false) {
    lines.push(`inox_http_server* ${serverName} = 0;`)
  }

  let wrapperName = '0'

  if (wrapper !== null && typeof wrapper !== 'undefined') {
    wrapperName = wrapper.name
  }

  lines.push(
    emitStatusCheck(
      `inox_http_server_new(${emitEventLoopReference(context)}, ${wrapperName}, 0, &${serverName})`,
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
      diagnostic('INOX_HTTP_SERVER', 'server.listen in the C backend currently requires a port argument')
    )

    return []
  }

  let secondArg: AnyNode | null = null

  if (args.length > 1) {
    secondArg = args[1]
  }

  let hostArg: AnyNode | null | undefined = secondArg
  let callback: AnyNode | null | undefined = args[2]

  if (secondArg !== null && typeof secondArg !== 'undefined' && secondArg.type === 'ArrowFunctionExpression') {
    hostArg = null
    callback = secondArg
  }

  if (args.length > 3) {
    context.diagnostics.push(
      diagnostic(
        'INOX_HTTP_SERVER',
        'server.listen in the C backend currently supports port, optional host and optional callback',
        httpNodeLoc(args[3])
      )
    )
  }

  const portArg = args[0]
  const port = deps.emitPreparedNumberExpression(portArg, context)
  const host = emitHttpListenHostExpression(hostArg, context)
  const lines: string[] = []

  pushHttpLines(lines, port.lines)
  lines.push(
    emitStatusCheck(`inox_http_server_listen(${serverName}, ${host}, (int)(${port.expression}), 128)`, context)
  )
  pushHttpLines(lines, emitHttpZeroArgCallbackLines(callback, context, deps))

  return lines
}

function emitHttpServerOnRequestLines(serverName: string, args: AnyNode[], context: CFunctionContext): string[] {
  let eventArg: AnyNode | null = null

  if (args.length > 0) {
    eventArg = args[0]
  }

  if (
    eventArg === null ||
    typeof eventArg === 'undefined' ||
    eventArg.type !== 'StringLiteral' ||
    eventArg.value !== 'request'
  ) {
    context.diagnostics.push(
      diagnostic(
        'INOX_HTTP_SERVER',
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

  if (listener !== null && typeof listener !== 'undefined') {
    const registeredWrapper = findHttpHandler(context, listener)

    if (registeredWrapper !== null && typeof registeredWrapper !== 'undefined') {
      wrapper = registeredWrapper
    }
  }

  if (
    listener === null ||
    typeof listener === 'undefined' ||
    listener.type !== 'ArrowFunctionExpression' ||
    wrapper === null ||
    typeof wrapper === 'undefined'
  ) {
    context.diagnostics.push(
      diagnostic(
        'INOX_HTTP_SERVER',
        "server.on('request') in the C backend currently requires an inline request listener",
        httpNodeLoc(listener)
      )
    )
    return []
  }

  return [emitStatusCheck(`inox_http_server_on_request(${serverName}, ${wrapper.name}, 0)`, context)]
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
        'INOX_HTTP_SERVER',
        'server.close in the C backend supports only an optional callback',
        httpNodeLoc(args[1])
      )
    )
  }

  const lines = [`inox_http_server_close(${serverName});`]

  pushHttpLines(lines, emitHttpZeroArgCallbackLines(args[0], context, deps))

  return lines
}

function emitHttpZeroArgCallbackLines(
  callback: AnyNode | null | undefined,
  context: CFunctionContext,
  deps: HttpLoweringDependencies
): string[] {
  if (callback === null || typeof callback === 'undefined') {
    return []
  }

  if (callback.type !== 'ArrowFunctionExpression' || callback.params.length !== 0 || callback.async === true) {
    context.diagnostics.push(
      diagnostic(
        'INOX_HTTP_SERVER',
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
  if (expression === null || typeof expression === 'undefined') {
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
      'INOX_HTTP_SERVER',
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

  if (
    expression.callee === null ||
    typeof expression.callee === 'undefined' ||
    expression.callee.type !== 'MemberExpression'
  ) {
    return false
  }

  if (expression.callee.property !== method) {
    return false
  }

  if (
    expression.callee.object === null ||
    typeof expression.callee.object === 'undefined' ||
    expression.callee.object.type !== 'Reference'
  ) {
    return false
  }

  if (expression.callee.object.path.length !== 1) {
    return false
  }

  const path: string[] = expression.callee.object.path
  const serverName = path[0]

  return context.variables.get(serverName) === 'http-server'
}

function isHttpCreateServerCall(expression: AnyNode | null | undefined, context: CEmitContext): boolean {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'CallExpression') {
    return false
  }

  if (
    expression.callee !== null &&
    typeof expression.callee !== 'undefined' &&
    expression.callee.type === 'Reference'
  ) {
    const path: string[] = expression.callee.path

    if (path.length === 1 && context.httpCreateServerNames.has(path[0])) {
      return true
    }
  }

  if (
    expression.callee === null ||
    typeof expression.callee === 'undefined' ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.property !== 'createServer' ||
    expression.callee.object === null ||
    typeof expression.callee.object === 'undefined' ||
    expression.callee.object.type !== 'Reference'
  ) {
    return false
  }

  const path: string[] = expression.callee.object.path

  return path.length === 1 && context.httpImportNames.has(path[0])
}

function isHttpRequestEventCall(expression: AnyNode): boolean {
  if (expression.type !== 'CallExpression') {
    return false
  }

  if (
    expression.callee === null ||
    typeof expression.callee === 'undefined' ||
    expression.callee.type !== 'MemberExpression'
  ) {
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

export function collectHttpHandlers(irPrograms: IrProgram[], context: CEmitContext): Map<string, CHttpHandler> {
  const handlers: Map<string, CHttpHandler> = new Map()
  const programs: IrProgram[] = irPrograms

  for (const ir of programs) {
    const items: HttpTopLevelNodeEntry[] = collectIrTopLevelNodeEntries(ir)

    for (let itemIndex = 0; itemIndex < items.length; itemIndex = itemIndex + 1) {
      const item = items[itemIndex]

      if (item.kind === 'function') {
        const statements: HttpAstNode[] = item.node.body

        for (const statement of statements) {
          visitHttpHandlerStatement(handlers, context, statement)
        }
      } else if (item.kind === 'statement') {
        visitHttpHandlerStatement(handlers, context, item.node)
      }
    }
  }

  return handlers
}

function registerHttpHandler(handlers: Map<string, CHttpHandler>, expression: AnyNode | null | undefined): void {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'ArrowFunctionExpression') {
    return
  }

  const existingName = httpHandlerName(expression)

  if (existingName !== null && typeof existingName !== 'undefined' && handlers.has(existingName)) {
    return
  }

  const name = `inox_http_handler_${handlers.size}`
  expression.httpHandlerName = name

  handlers.set(name, {
    name: name,
    expression: expression
  })
}

function httpHandlerName(expression: AnyNode | null | undefined): string | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  const name = expression.httpHandlerName

  if (name === null || typeof name === 'undefined') {
    return null
  }

  return name
}

function findHttpHandler(context: CFunctionContext, expression: AnyNode | null | undefined): CHttpHandler | null {
  const name = httpHandlerName(expression)

  if (name === null || typeof name === 'undefined') {
    return null
  }

  const handler = context.httpHandlers.get(name)

  if (handler === null || typeof handler === 'undefined') {
    return null
  }

  return handler
}

function visitHttpHandlerStatement(
  handlers: Map<string, CHttpHandler>,
  context: CEmitContext,
  statement: AnyNode | null | undefined
): void {
  if (statement === null || typeof statement === 'undefined') {
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
    const statements: HttpAstNode[] = statement.body

    for (const item of statements) {
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
    if (
      statement.init !== null &&
      typeof statement.init !== 'undefined' &&
      statement.init.type === 'VariableDeclaration'
    ) {
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
    const cases: HttpAstNode[] = statement.cases

    for (const item of cases) {
      visitHttpHandlerExpression(handlers, context, item.test)
      const consequents: HttpAstNode[] = item.consequent

      for (const consequent of consequents) {
        visitHttpHandlerStatement(handlers, context, consequent)
      }
    }
    return
  }

  if (statement.type === 'TryStatement') {
    const handler = statement.handler
    visitHttpHandlerStatement(handlers, context, statement.block)
    if (handler !== null && typeof handler !== 'undefined') {
      visitHttpHandlerStatement(handlers, context, handler.body)
    }
    visitHttpHandlerStatement(handlers, context, statement.finalizer)
  }
}

function visitHttpHandlerExpression(
  handlers: Map<string, CHttpHandler>,
  context: CEmitContext,
  expression: AnyNode | null | undefined
): void {
  if (expression === null || typeof expression === 'undefined') {
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
    const args: HttpAstNode[] = expression.args

    for (const arg of args) {
      visitHttpHandlerExpression(handlers, context, arg)
    }
    return
  }

  if (expression.type === 'OptionalCallExpression' || expression.type === 'NewExpression') {
    visitHttpHandlerExpression(handlers, context, expression.callee)
    const args: HttpAstNode[] = expression.args

    for (const arg of args) {
      visitHttpHandlerExpression(handlers, context, arg)
    }
    return
  }

  if (expression.type === 'ArrowFunctionExpression') {
    if (expression.expressionBody) {
      visitHttpHandlerExpression(handlers, context, expression.body)
    } else {
      const statements: HttpAstNode[] = expression.body

      for (const statement of statements) {
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
    const elements: HttpAstNode[] = expression.elements

    for (const element of elements) {
      visitHttpHandlerExpression(handlers, context, element)
    }
    return
  }

  if (expression.type === 'ObjectLiteral') {
    const properties: HttpAstNode[] = expression.properties

    for (const property of properties) {
      visitHttpHandlerExpression(handlers, context, property.value)
    }
  }
}
