import { diagnostic } from '../../diagnostics.ts'
import { collectIrTopLevelNodeEntries } from '../../ir.ts'
import {
  emitEventLoopReference,
  emitStatusCheck,
  nextCName,
  registerEventLoop
} from '../context.ts'
import { cStringLiteral, utf8ByteLength } from '../identifiers.ts'
import { isConsoleLog } from './console.ts'
import type { CEmitContext, CFunctionContext } from '../context.ts'
import type { AnyNode, IrProgram, SourceLocation } from '../../types.ts'
import type {
  CNetHandler,
  CPreparedExpression as PreparedExpression,
  CPreparedStringBytesOperand as PreparedStringBytesOperand
} from '../types.ts'

type NetAstNode = AnyNode

type NetHandlerContext = {
  kind: string
  dataName: string | null
  socketName: string | null
  stringLocals: Map<string, string>
}

type NetSocketAddressMember = {
  field: 'address' | 'port'
  runtime: string
  socketName: string
  tempName: string
  valueType: 'number' | 'string'
}

type NetSocketCounterMember = {
  runtime: string
  socketName: string
}

type NetSocketCreateOptions = {
  declare: boolean | undefined
}

type NetServerCreateOptions = {
  declare: boolean | undefined
}

export type NetLoweringDependencies = {
  createFunctionContext: (baseContext: CEmitContext, returnType: string, returnNullable: boolean) => CFunctionContext
  emitConsoleLogStatement: (method: string, args: NetAstNode[], context: CFunctionContext) => string[]
  emitPreparedNumberExpression: (expression: NetAstNode, context: CFunctionContext) => PreparedExpression
  emitPreparedStringBytesOperand: (expression: NetAstNode, context: CFunctionContext, tempPrefix: string) => PreparedStringBytesOperand
  emitStatementList: (body: NetAstNode[], context: CFunctionContext) => string[]
  findObjectLiteralPropertyValue: (expression: NetAstNode, key: string) => NetAstNode | null
}

type NetTopLevelNodeEntry = {
  kind: string
  node: NetAstNode
}

function netNodeLoc(node: NetAstNode | null | undefined): SourceLocation | null {
  if (node == null) {
    return null
  }

  return node.loc
}

function lastNetArgument(args: NetAstNode[]): NetAstNode | null {
  if (args.length === 0) {
    return null
  }

  return args[args.length - 1]
}

function pushNetLines(target: string[], lines: string[]): void {
  for (const line of lines) {
    target.push(line)
  }
}

function pushNetNodes(target: NetAstNode[], nodes: NetAstNode[]): void {
  for (const node of nodes) {
    target.push(node)
  }
}

function netReferenceName(expression: NetAstNode | null | undefined): string | null {
  if (expression == null || expression.type !== 'Reference' || expression.path.length !== 1) {
    return null
  }

  return expression.path[0] ?? null
}

function netMemberObjectReferenceName(callee: NetAstNode | null | undefined): string | null {
  if (callee == null || callee.type !== 'MemberExpression') {
    return null
  }

  return netReferenceName(callee.object)
}

function pushIndentedNetLines(target: string[], lines: string[]): void {
  for (const line of lines) {
    target.push('  ' + line)
  }
}

function isNetSocketWriteMethod(method: string): boolean {
  return method === 'write' || method === 'end'
}

function isNetSocketHandlerKind(kind: string): boolean {
  return (
    kind === 'connection' ||
    kind === 'socket-data' ||
    kind === 'socket-write' ||
    kind === 'socket-event' ||
    kind === 'socket-error'
  )
}

function isNetSocketCallbackKind(kind: string): boolean {
  return kind === 'socket-data' || kind === 'socket-write' || kind === 'socket-event' || kind === 'socket-error'
}

function isNetSocketLifecycleEvent(eventName: string): boolean {
  return (
    eventName === 'connect' ||
    eventName === 'ready' ||
    eventName === 'end' ||
    eventName === 'close' ||
    eventName === 'drain'
  )
}

function replaceNetKindSeparator(kind: string): string {
  let value = ''

  for (let index = 0; index < kind.length; index = index + 1) {
    const part = kind[index]

    if (part === '-') {
      value = value + '_'
    } else {
      value = value + part
    }
  }

  return value
}

export function emitNetHandlerHead(wrapper: CNetHandler): string {
  if (wrapper.kind === 'connection') {
    return `static ccjs_status ${wrapper.name}(void* user, ccjs_net_server* ccjs_server, ccjs_net_socket* ccjs_socket)`
  }

  if (wrapper.kind === 'socket-data') {
    return `static ccjs_status ${wrapper.name}(void* user, ccjs_net_socket* ccjs_socket, const char* ccjs_bytes, size_t ccjs_len)`
  }

  if (wrapper.kind === 'socket-write') {
    return `static ccjs_status ${wrapper.name}(void* user, ccjs_net_socket* ccjs_socket, ccjs_status ccjs_write_status)`
  }

  if (wrapper.kind === 'socket-event') {
    return `static ccjs_status ${wrapper.name}(void* user, ccjs_net_socket* ccjs_socket)`
  }

  if (wrapper.kind === 'socket-error') {
    return `static ccjs_status ${wrapper.name}(void* user, ccjs_net_socket* ccjs_socket, ccjs_status ccjs_error_status)`
  }

  if (wrapper.kind === 'error') {
    return `static ccjs_status ${wrapper.name}(void* user, ccjs_net_server* ccjs_server, ccjs_status ccjs_error_status)`
  }

  return `static ccjs_status ${wrapper.name}(void* user, ccjs_net_server* ccjs_server)`
}

export function emitNetHandlerDeclaration(
  wrapper: CNetHandler,
  baseContext: CEmitContext,
  deps: NetLoweringDependencies
): string[] {
  const expression = wrapper.expression
  const isSocketHandler = isNetSocketHandlerKind(wrapper.kind)
  const firstParam = expression.params[0]
  let socketName: string | null = null
  let dataName: string | null = null

  if (wrapper.kind === 'connection' && firstParam != null) {
    socketName = firstParam.name
  }

  if (wrapper.kind === 'socket-data' && firstParam != null) {
    dataName = firstParam.name
  }

  const netContext: NetHandlerContext = {
    kind: wrapper.kind,
    dataName: dataName,
    socketName: socketName,
    stringLocals: new Map()
  }
  const context = deps.createFunctionContext(baseContext, 'void', false)
  context.statusReturn = true

  if (socketName != null) {
    context.variables.set(socketName, 'net-socket')
  }

  if (dataName != null) {
    context.variables.set(dataName, 'string')
  }

  const body: NetAstNode[] = []

  if (expression.expressionBody) {
    body.push({
      type: 'ExpressionStatement',
      expression: expression.body,
      loc: expression.loc
    })
  } else {
    pushNetNodes(body, expression.body)
  }

  const lines = [`${emitNetHandlerHead(wrapper)} {`, '  (void)user;']

  if (wrapper.kind === 'connection' || wrapper.kind === 'event' || wrapper.kind === 'error') {
    lines.push('  (void)ccjs_server;')
  }

  if (isSocketHandler && socketName == null) {
    lines.push('  (void)ccjs_socket;')
  }

  if (wrapper.kind === 'socket-data' && dataName == null) {
    lines.push('  (void)ccjs_bytes;')
    lines.push('  (void)ccjs_len;')
  }

  if (wrapper.kind === 'error' || wrapper.kind === 'socket-error') {
    lines.push('  (void)ccjs_error_status;')
  }

  if (wrapper.kind === 'socket-write') {
    lines.push('  (void)ccjs_write_status;')
  }

  for (const statement of body) {
    pushIndentedNetLines(lines, emitNetHandlerStatement(statement, netContext, context, deps))
  }

  lines.push('  return CCJS_OK;')
  lines.push('}')

  return lines
}

function emitNetHandlerStatement(
  statement: AnyNode | null | undefined,
  netContext: NetHandlerContext,
  context: CFunctionContext,
  deps: NetLoweringDependencies
): string[] {
  if (statement == null) {
    return []
  }

  if (statement.type === 'BlockStatement') {
    const lines = ['{']
    const statements: NetAstNode[] = statement.body

    for (const item of statements) {
      pushIndentedNetLines(lines, emitNetHandlerStatement(item, netContext, context, deps))
    }

    lines.push('}')
    return lines
  }

  if (statement.type === 'VariableDeclaration') {
    const stringValue = emitNetStaticStringValue(statement.init, netContext)

    if (stringValue != null) {
      netContext.stringLocals.set(statement.name, stringValue)
      return []
    }

    context.diagnostics.push(
      diagnostic(
        'CCJS_NET_HANDLER',
        'net event listeners in the C backend currently support only static string local declarations',
        statement.loc
      )
    )
    return []
  }

  if (
    statement.type === 'ExpressionStatement' &&
    statement.expression != null &&
    statement.expression.type === 'CallExpression'
  ) {
    const logStatement = emitNetHandlerConsoleLogStatement(statement.expression, netContext, context, deps)

    if (logStatement != null) {
      return logStatement
    }

    const socketCall = emitNetHandlerSocketCallStatement(statement.expression, netContext, context, deps)

    if (socketCall != null) {
      return socketCall
    }

    const serverCall = emitNetHandlerServerCallStatement(statement.expression, context)

    if (serverCall != null) {
      return serverCall
    }
  }

  if (statement.type === 'ReturnStatement') {
    if (statement.argument != null && statement.argument.type === 'CallExpression') {
      const socketCall = emitNetHandlerSocketCallStatement(statement.argument, netContext, context, deps)

      if (socketCall != null) {
        const lines: string[] = []

        pushNetLines(lines, socketCall)
        lines.push('return CCJS_OK;')

        return lines
      }
    }

    return ['return CCJS_OK;']
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_NET_HANDLER',
      'this net event listener statement is not supported by the current C backend slice',
      statement.loc
    )
  )
  return []
}

function emitNetHandlerSocketCallStatement(
  expression: AnyNode,
  netContext: NetHandlerContext,
  context: CFunctionContext,
  deps: NetLoweringDependencies
): string[] | null {
  const callee = expression.callee

  if (
    callee == null ||
    callee.type !== 'MemberExpression' ||
    callee.object == null ||
    callee.object.type !== 'Reference' ||
    callee.object.path.length !== 1
  ) {
    return null
  }

  const socketName = netMemberObjectReferenceName(callee)

  if (socketName == null) {
    return null
  }

  if (
    netContext.socketName != null &&
    socketName !== netContext.socketName &&
    !isNetSocketCallbackKind(netContext.kind)
  ) {
    return null
  }

  const method = callee.property

  if (method === 'write' || method === 'end') {
    const lastArg = lastNetArgument(expression.args)
    let callback: AnyNode | null = null

    if (lastArg != null && lastArg.type === 'ArrowFunctionExpression') {
      callback = lastArg
    }

    let bodyArg: AnyNode | null = null

    if (!(callback != null && expression.args.length === 1) && expression.args.length > 0) {
      bodyArg = expression.args[0]
    }

    const body = emitNetBytesOperand(bodyArg, netContext, context, deps)
    const wrapper = findNetHandler(context, callback, 'socket-write')
    let runtime = 'ccjs_net_socket_write'

    if (method === 'write' && wrapper != null) {
      runtime = 'ccjs_net_socket_write_with_callback'
    } else if (method === 'end' && wrapper == null) {
      runtime = 'ccjs_net_socket_end'
    } else if (method === 'end') {
      runtime = 'ccjs_net_socket_end_with_callback'
    }

    let callbackArgs = ''

    if (wrapper != null) {
      callbackArgs = `, ${wrapper.name}, 0`
    }

    const lines: string[] = []

    pushNetLines(lines, body.lines)
    pushNetLines(lines, emitNetStatusCheck(`${runtime}(ccjs_socket, ${body.bytes}, ${body.length}${callbackArgs})`, context))

    return lines
  }

  if (method === 'destroy') {
    return emitNetStatusCheck('ccjs_net_socket_destroy(ccjs_socket)', context)
  }

  if (method === 'close') {
    return ['ccjs_net_socket_close(ccjs_socket);']
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_NET_HANDLER',
      `socket.${method} is not supported inside net connection listeners by the current C backend slice`,
      netNodeLoc(callee)
    )
  )
  return []
}

function emitNetHandlerConsoleLogStatement(
  expression: AnyNode,
  netContext: NetHandlerContext,
  context: CFunctionContext,
  deps: NetLoweringDependencies
): string[] | null {
  if (!isConsoleLog(expression)) {
    return null
  }

  const callee = expression.callee
  let stream = 'CCJS_CONSOLE_STDOUT'

  if (callee.property === 'warn' || callee.property === 'error') {
    stream = 'CCJS_CONSOLE_STDERR'
  }

  let firstArg: AnyNode | null = null

  if (expression.args.length > 0) {
    firstArg = expression.args[0]
  }

  if (
    expression.args.length === 1 &&
    netContext.dataName != null &&
    firstArg != null &&
    firstArg.type === 'Reference' &&
    firstArg.path.length === 1 &&
    netReferenceName(firstArg) === netContext.dataName
  ) {
    if (stream === 'CCJS_CONSOLE_STDOUT') {
      return ['printf("%.*s\\n", (int)ccjs_len, ccjs_bytes);']
    }

    return [`if (ccjs_console_printf(${stream}, "%.*s\\n", (int)ccjs_len, ccjs_bytes) < 0) return CCJS_ERR_TYPE;`]
  }

  return deps.emitConsoleLogStatement(callee.property, expression.args, context)
}

function emitNetHandlerServerCallStatement(expression: AnyNode, context: CFunctionContext): string[] | null {
  const callee = expression.callee

  if (
    callee == null ||
    callee.type !== 'MemberExpression' ||
    callee.object == null ||
    callee.object.type !== 'Reference' ||
    callee.object.path.length !== 1
  ) {
    return null
  }

  if (callee.property !== 'close') {
    return null
  }

  return ['ccjs_net_server_close(ccjs_server);']
}

export function emitNetSocketVariableDeclaration(
  statement: AnyNode,
  context: CFunctionContext,
  deps: NetLoweringDependencies
): string[] | null {
  if (!isNetConnectCall(statement.init, context)) {
    return null
  }

  context.variables.set(statement.name, 'net-socket')
  registerEventLoop(context)

  return emitNetSocketConnectLines(statement.init, statement.name, context, deps, null)
}

export function emitNetServerVariableDeclaration(
  statement: AnyNode,
  context: CFunctionContext,
  deps: NetLoweringDependencies
): string[] | null {
  if (!isNetCreateServerCall(statement.init, context)) {
    return null
  }

  context.variables.set(statement.name, 'net-server')
  registerEventLoop(context)

  return emitNetServerCreateLines(statement.init, statement.name, context, null)
}

export function emitNetAddressVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[] | null {
  if (!isNetAddressCall(statement.init, context)) {
    return null
  }

  const receiverName = netMemberObjectReferenceName(statement.init.callee)

  if (receiverName == null) {
    return null
  }

  let runtime = 'ccjs_net_server_address'

  if (context.variables.get(receiverName) === 'net-socket') {
    runtime = 'ccjs_net_socket_address'
  }

  context.variables.set(statement.name, 'net-address')

  return [
    `ccjs_net_address ${statement.name};`,
    emitStatusCheck(`${runtime}(${receiverName}, &${statement.name})`, context)
  ]
}

export function emitNetAddressMemberVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[] | null {
  const member = resolveNetSocketAddressMember(statement.init, context)

  if (member != null) {
    if (member.valueType === 'string') {
      context.variables.set(statement.name, 'string')

      return [
        `ccjs_net_address ${member.tempName};`,
        emitStatusCheck(`${member.runtime}(${member.socketName}, &${member.tempName})`, context),
        `const char *${statement.name} = ${member.tempName}.${member.field};`
      ]
    }

    context.variables.set(statement.name, 'number')

    const statusCall = `${member.runtime}(${member.socketName}, &${member.tempName})`

    return [
      `double ${statement.name} = 0;`,
      '{',
      `  ccjs_net_address ${member.tempName};`,
      `  ${emitStatusCheck(statusCall, context)}`,
      `  ${statement.name} = (double)${member.tempName}.${member.field};`,
      '}'
    ]
  }

  return null
}

export function emitNetNumberVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[] | null {
  const counter = resolveNetSocketCounterMember(statement.init, context)

  if (counter == null) {
    return null
  }

  context.variables.set(statement.name, 'number')

  const statusCall = `${counter.runtime}(${counter.socketName}, &ccjs_net_counter)`

  return [
    `double ${statement.name} = 0;`,
    '{',
    `  size_t ccjs_net_counter = 0;`,
    `  ${emitStatusCheck(statusCall, context)}`,
    `  ${statement.name} = (double)ccjs_net_counter;`,
    '}'
  ]
}

export function emitNetSocketCallStatement(
  expression: AnyNode,
  context: CFunctionContext,
  deps: NetLoweringDependencies
): string[] | null {
  const socketName = netMemberObjectReferenceName(expression.callee)

  if (isNetSocketMethodCall(expression, 'on', context)) {
    if (socketName == null) {
      return null
    }

    return emitNetSocketOnLines(socketName, expression.args, context)
  }

  if (isNetSocketMethodCall(expression, 'write', context)) {
    if (socketName == null) {
      return null
    }

    return emitNetSocketWriteLines(socketName, 'write', expression.args, context, deps)
  }

  if (isNetSocketMethodCall(expression, 'end', context)) {
    if (socketName == null) {
      return null
    }

    return emitNetSocketWriteLines(socketName, 'end', expression.args, context, deps)
  }

  if (isNetSocketMethodCall(expression, 'destroy', context)) {
    if (socketName == null) {
      return null
    }

    return [emitStatusCheck(`ccjs_net_socket_destroy(${socketName})`, context)]
  }

  if (isNetSocketMethodCall(expression, 'close', context)) {
    if (socketName == null) {
      return null
    }

    return [`ccjs_net_socket_close(${socketName});`]
  }

  if (isNetSocketMethodCall(expression, 'setEncoding', context)) {
    if (socketName == null) {
      return null
    }

    return emitNetSocketSetEncodingLines(socketName, expression.args, context)
  }

  const optionCall = emitNetSocketOptionCallStatement(expression, context, deps)

  if (optionCall != null) {
    return optionCall
  }

  if (isNetSocketAnyMethodCall(expression, context)) {
    const callee = expression.callee
    let loc = netNodeLoc(expression)
    let property = 'unknown'

    if (callee != null) {
      property = callee.property

      if (callee.loc != null) {
        loc = callee.loc
      }
    }

    context.diagnostics.push(
      diagnostic(
        'CCJS_NET_SOCKET',
        `socket.${property} is not supported by the current C net backend slice`,
        loc
      )
    )
    return []
  }

  return null
}

export function emitNetServerCallStatement(
  expression: AnyNode,
  context: CFunctionContext,
  deps: NetLoweringDependencies
): string[] | null {
  const callee = expression.callee

  if (
    callee != null &&
    callee.type === 'MemberExpression' &&
    callee.property === 'listen' &&
    isNetCreateServerCall(callee.object, context)
  ) {
    const serverName = nextCName(context, 'ccjs_net_server')
    const lines = [`ccjs_net_server* ${serverName} = 0;`]
    registerEventLoop(context)

    pushNetLines(
      lines,
      emitNetServerCreateLines(callee.object, serverName, context, {
        declare: false
      })
    )
    pushNetLines(lines, emitNetServerListenLines(serverName, expression.args, context, deps))

    return lines
  }

  if (isNetServerMethodCall(expression, 'listen', context)) {
    const serverName = netMemberObjectReferenceName(expression.callee)

    if (serverName == null) {
      return null
    }

    registerEventLoop(context)

    return emitNetServerListenLines(serverName, expression.args, context, deps)
  }

  if (isNetServerMethodCall(expression, 'on', context)) {
    const serverName = netMemberObjectReferenceName(expression.callee)

    if (serverName == null) {
      return null
    }

    return emitNetServerOnLines(serverName, expression.args, context)
  }

  if (isNetServerMethodCall(expression, 'close', context)) {
    const serverName = netMemberObjectReferenceName(expression.callee)

    if (serverName == null) {
      return null
    }

    return emitNetServerCloseLines(serverName, expression.args, context, deps)
  }

  if (isNetServerAnyMethodCall(expression, context)) {
    let loc = netNodeLoc(expression)
    let property = 'unknown'

    if (callee != null) {
      property = callee.property

      if (callee.loc != null) {
        loc = callee.loc
      }
    }

    context.diagnostics.push(
      diagnostic(
        'CCJS_NET_SERVER',
        `server.${property} is not supported by the current C net backend slice`,
        loc
      )
    )
    return []
  }

  return null
}

function emitNetSocketConnectLines(
  expression: AnyNode,
  socketName: string,
  context: CFunctionContext,
  deps: NetLoweringDependencies,
  options: NetSocketCreateOptions | null
): string[] {
  let firstArg: AnyNode | null = null
  let secondArg: AnyNode | null = null

  if (expression.args.length > 0) {
    firstArg = expression.args[0]
  }

  if (expression.args.length > 1) {
    secondArg = expression.args[1]
  }

  let optionsArg: AnyNode | null = null

  if (firstArg != null && firstArg.type === 'ObjectLiteral') {
    optionsArg = firstArg
  }

  const callback = emitNetConnectCallback(expression)
  let portArg: AnyNode | null | undefined = firstArg
  let hostArg: AnyNode | null | undefined = secondArg

  if (optionsArg != null) {
    portArg = deps.findObjectLiteralPropertyValue(optionsArg, 'port')
    hostArg = deps.findObjectLiteralPropertyValue(optionsArg, 'host')
  } else if (secondArg != null && secondArg.type === 'ArrowFunctionExpression') {
    hostArg = null
  }

  const wrapper = findNetHandler(context, callback, 'socket-event')

  if (portArg == null) {
    context.diagnostics.push(
      diagnostic('CCJS_NET_SOCKET', 'net.connect in the C backend currently requires a port argument', expression.loc)
    )
  }

  if (callback != null && (callback.type !== 'ArrowFunctionExpression' || wrapper == null)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_NET_SOCKET',
        'net.connect callback in the C backend currently requires an inline listener',
        netNodeLoc(callback)
      )
    )
  }

  let port: PreparedExpression = {
    lines: [],
    expression: '0'
  }

  if (portArg != null) {
    port = deps.emitPreparedNumberExpression(portArg, context)
  }

  const host = emitNetConnectHostExpression(hostArg, context)
  const lines: string[] = []

  if (options == null || options.declare !== false) {
    lines.push(`ccjs_net_socket* ${socketName} = 0;`)
  }

  pushNetLines(lines, port.lines)
  lines.push(
    emitStatusCheck(
      `ccjs_net_connect(${emitEventLoopReference(context)}, ${host}, (int)(${port.expression}), 0, 0, 0, 0, &${socketName})`,
      context
    )
  )

  if (wrapper != null) {
    lines.push(emitStatusCheck(`ccjs_net_socket_on_connect(${socketName}, ${wrapper.name}, 0)`, context))
  }

  return lines
}

function emitNetSocketOnLines(socketName: string, args: AnyNode[], context: CFunctionContext): string[] {
  let eventArg: AnyNode | null = null

  if (args.length > 0) {
    eventArg = args[0]
  }

  let eventName: string | null = null

  if (eventArg != null && eventArg.type === 'StringLiteral') {
    eventName = eventArg.value
  }

  let kind = ''

  if (eventName === 'data') {
    kind = 'socket-data'
  } else if (eventName != null && isNetSocketLifecycleEvent(eventName)) {
    kind = 'socket-event'
  } else if (eventName === 'error') {
    kind = 'socket-error'
  }

  if (kind === '') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_NET_SOCKET',
        "socket.on in the C backend currently supports 'connect', 'ready', 'data', 'end', 'close', 'error' and 'drain'",
        netNodeLoc(eventArg)
      )
    )
    return []
  }

  let listener: AnyNode | null = null

  if (args.length > 1) {
    listener = args[1]
  }

  const wrapper = findNetHandler(context, listener, kind)

  if (listener == null || listener.type !== 'ArrowFunctionExpression' || wrapper == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_NET_SOCKET',
        `socket.on('${eventName}') in the C backend currently requires an inline listener`,
        netNodeLoc(listener)
      )
    )
    return []
  }

  let runtime = 'ccjs_net_socket_on_drain'

  if (eventName === 'connect') {
    runtime = 'ccjs_net_socket_on_connect'
  } else if (eventName === 'ready') {
    runtime = 'ccjs_net_socket_on_ready'
  } else if (eventName === 'data') {
    runtime = 'ccjs_net_socket_on_data'
  } else if (eventName === 'end') {
    runtime = 'ccjs_net_socket_on_end'
  } else if (eventName === 'close') {
    runtime = 'ccjs_net_socket_on_close'
  } else if (eventName === 'error') {
    runtime = 'ccjs_net_socket_on_error'
  }

  const lines = [emitStatusCheck(`${runtime}(${socketName}, ${wrapper.name}, 0)`, context)]

  if (eventName === 'data' || eventName === 'end') {
    pushNetLines(lines, emitNetMaybeReadStartLines(socketName, context))
  }

  return lines
}

function emitNetSocketWriteLines(
  socketName: string,
  method: string,
  args: AnyNode[],
  context: CFunctionContext,
  deps: NetLoweringDependencies
): string[] {
  const lastArg = lastNetArgument(args)
  let callback: AnyNode | null = null

  if (lastArg != null && lastArg.type === 'ArrowFunctionExpression') {
    callback = lastArg
  }

  let bodyArg: AnyNode | null = null

  if (!(callback != null && args.length === 1) && args.length > 0) {
    bodyArg = args[0]
  }

  const body = emitNetBytesOperand(bodyArg, null, context, deps)
  const wrapper = findNetHandler(context, callback, 'socket-write')
  let runtime = 'ccjs_net_socket_write'

  if (method === 'write' && wrapper != null) {
    runtime = 'ccjs_net_socket_write_with_callback'
  } else if (method === 'end' && wrapper == null) {
    runtime = 'ccjs_net_socket_end'
  } else if (method === 'end') {
    runtime = 'ccjs_net_socket_end_with_callback'
  }

  let callbackArgs = ''

  if (wrapper != null) {
    callbackArgs = `, ${wrapper.name}, 0`
  }

  if (callback != null && wrapper == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_NET_SOCKET',
        `socket.${method} callback in the C backend currently requires an inline listener`,
        callback.loc
      )
    )
  }

  const lines: string[] = []

  pushNetLines(lines, body.lines)
  lines.push(emitStatusCheck(`${runtime}(${socketName}, ${body.bytes}, ${body.length}${callbackArgs})`, context))

  return lines
}

function emitNetSocketSetEncodingLines(socketName: string, args: AnyNode[], context: CFunctionContext): string[] {
  let firstArg: AnyNode | null = null

  if (args.length > 0) {
    firstArg = args[0]
  }

  const value = emitNetStaticStringValue(firstArg, null)

  if (value == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_NET_SOCKET',
        'socket.setEncoding in the C backend currently requires a static string',
        netNodeLoc(firstArg)
      )
    )
    return []
  }

  return [
    emitStatusCheck(
      `ccjs_net_socket_set_encoding(${socketName}, ${cStringLiteral(value)}, ${utf8ByteLength(value)})`,
      context
    )
  ]
}

function emitNetSocketOptionCallStatement(
  expression: AnyNode,
  context: CFunctionContext,
  deps: NetLoweringDependencies
): string[] | null {
  if (!isNetSocketAnyMethodCall(expression, context)) {
    return null
  }

  const socketName = netMemberObjectReferenceName(expression.callee)

  if (socketName == null) {
    return null
  }

  const method = expression.callee.property

  if (method === 'setNoDelay') {
    let enabled: PreparedExpression = {
      lines: [],
      expression: '1'
    }

    if (expression.args.length > 0) {
      enabled = deps.emitPreparedNumberExpression(expression.args[0], context)
    }

    const lines: string[] = []

    pushNetLines(lines, enabled.lines)
    lines.push(emitStatusCheck(`ccjs_net_socket_set_no_delay(${socketName}, ${enabled.expression} ? 1 : 0)`, context))

    return lines
  }

  if (method === 'setKeepAlive') {
    let enabled: PreparedExpression = {
      lines: [],
      expression: '0'
    }
    let delay: PreparedExpression = {
      lines: [],
      expression: '0'
    }

    if (expression.args.length > 0) {
      enabled = deps.emitPreparedNumberExpression(expression.args[0], context)
    }

    if (expression.args.length > 1) {
      delay = deps.emitPreparedNumberExpression(expression.args[1], context)
    }

    const lines: string[] = []

    pushNetLines(lines, enabled.lines)
    pushNetLines(lines, delay.lines)
    lines.push(
      emitStatusCheck(
        `ccjs_net_socket_set_keep_alive(${socketName}, ${enabled.expression} ? 1 : 0, (unsigned int)(${delay.expression}))`,
        context
      )
    )

    return lines
  }

  if (method === 'ref' || method === 'unref') {
    if (expression.args.length > 0) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_NET_SOCKET',
          `socket.${method} in the C backend does not take arguments`,
          netNodeLoc(expression.args[0])
        )
      )
    }

    let runtime = 'ccjs_net_socket_unref'

    if (method === 'ref') {
      runtime = 'ccjs_net_socket_ref'
    }

    return [emitStatusCheck(`${runtime}(${socketName})`, context)]
  }

  if (method === 'setTimeout') {
    const callee = expression.callee
    let loc = netNodeLoc(expression)

    if (callee != null && callee.loc != null) {
      loc = callee.loc
    }

    context.diagnostics.push(
      diagnostic(
        'CCJS_NET_SOCKET',
        'socket.setTimeout is not supported by the current C net backend slice yet',
        loc
      )
    )
    return []
  }

  return null
}

function emitNetMaybeReadStartLines(socketName: string, context: CFunctionContext): string[] {
  if (context.netReadingSockets.has(socketName)) {
    return []
  }

  context.netReadingSockets.add(socketName)
  return [emitStatusCheck(`ccjs_net_socket_read_start(${socketName})`, context)]
}

function emitNetServerCreateLines(
  expression: AnyNode,
  serverName: string,
  context: CFunctionContext,
  options: NetServerCreateOptions | null
): string[] {
  const listener = emitNetCreateServerConnectionListener(expression)
  const wrapper = findNetHandler(context, listener, 'connection')

  if (listener != null && (listener.type !== 'ArrowFunctionExpression' || wrapper == null)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_NET_SERVER',
        'net.createServer in the C backend currently requires an inline connection listener',
        netNodeLoc(listener)
      )
    )
  }

  const lines: string[] = []

  if (options == null || options.declare !== false) {
    lines.push(`ccjs_net_server* ${serverName} = 0;`)
  }

  let wrapperName = '0'

  if (wrapper != null) {
    wrapperName = wrapper.name
  }

  lines.push(
    emitStatusCheck(
      `ccjs_net_server_new(${emitEventLoopReference(context)}, ${wrapperName}, 0, &${serverName})`,
      context
    )
  )

  return lines
}

function emitNetServerListenLines(
  serverName: string,
  args: AnyNode[],
  context: CFunctionContext,
  deps: NetLoweringDependencies
): string[] {
  let firstArg: AnyNode | null = null

  if (args.length > 0) {
    firstArg = args[0]
  }

  let options: AnyNode | null = null

  if (firstArg != null && firstArg.type === 'ObjectLiteral') {
    options = firstArg
  }

  const callback = emitNetListenCallback(args, options)
  let portArg: AnyNode | null | undefined = emitNetListenPortArg(args)
  let hostArg: AnyNode | null | undefined = emitNetListenHostArg(args)
  let backlogArg: AnyNode | null | undefined = emitNetListenBacklogArg(args)

  if (options != null) {
    portArg = deps.findObjectLiteralPropertyValue(options, 'port')
    hostArg = deps.findObjectLiteralPropertyValue(options, 'host')
    backlogArg = deps.findObjectLiteralPropertyValue(options, 'backlog')
  }

  if (options != null && deps.findObjectLiteralPropertyValue(options, 'exclusive') != null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_NET_SERVER',
        'server.listen exclusive options are not supported by the current C net backend slice',
        options.loc
      )
    )
  }

  let port: PreparedExpression = {
    lines: [],
    expression: '0'
  }

  if (portArg != null) {
    port = deps.emitPreparedNumberExpression(portArg, context)
  }

  const host = emitNetListenHostExpression(hostArg, context)
  let backlog: PreparedExpression = {
    lines: [],
    expression: '128'
  }

  if (backlogArg != null) {
    backlog = deps.emitPreparedNumberExpression(backlogArg, context)
  }

  const lines: string[] = []

  pushNetLines(lines, port.lines)
  pushNetLines(lines, backlog.lines)
  lines.push(
    emitStatusCheck(
      `ccjs_net_server_listen(${serverName}, ${host}, (int)(${port.expression}), (int)(${backlog.expression}))`,
      context
    )
  )
  pushNetLines(lines, emitNetZeroArgCallbackLines(callback, context, deps))

  return lines
}

function emitNetServerOnLines(serverName: string, args: AnyNode[], context: CFunctionContext): string[] {
  let eventArg: AnyNode | null = null

  if (args.length > 0) {
    eventArg = args[0]
  }

  let eventName: string | null = null

  if (eventArg != null && eventArg.type === 'StringLiteral') {
    eventName = eventArg.value
  }

  let kind = ''

  if (eventName === 'connection') {
    kind = 'connection'
  } else if (eventName === 'listening' || eventName === 'close') {
    kind = 'event'
  } else if (eventName === 'error') {
    kind = 'error'
  }

  if (kind === '') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_NET_SERVER',
        "server.on in the C backend currently supports 'connection', 'listening', 'close' and 'error'",
        netNodeLoc(eventArg)
      )
    )
    return []
  }

  let listener: AnyNode | null = null

  if (args.length > 1) {
    listener = args[1]
  }

  const wrapper = findNetHandler(context, listener, kind)

  if (listener == null || listener.type !== 'ArrowFunctionExpression' || wrapper == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_NET_SERVER',
        `server.on('${eventName}') in the C backend currently requires an inline listener`,
        netNodeLoc(listener)
      )
    )
    return []
  }

  let runtime = 'ccjs_net_server_on_error'

  if (eventName === 'connection') {
    runtime = 'ccjs_net_server_on_connection'
  } else if (eventName === 'listening') {
    runtime = 'ccjs_net_server_on_listening'
  } else if (eventName === 'close') {
    runtime = 'ccjs_net_server_on_close'
  }

  return [emitStatusCheck(`${runtime}(${serverName}, ${wrapper.name}, 0)`, context)]
}

function emitNetServerCloseLines(
  serverName: string,
  args: AnyNode[],
  context: CFunctionContext,
  deps: NetLoweringDependencies
): string[] {
  if (args.length > 1) {
    context.diagnostics.push(
      diagnostic('CCJS_NET_SERVER', 'server.close in the C backend supports only an optional callback', netNodeLoc(args[1]))
    )
  }

  const lines = [`ccjs_net_server_close(${serverName});`]
  let callback: AnyNode | null = null

  if (args.length > 0) {
    callback = args[0]
  }

  pushNetLines(lines, emitNetZeroArgCallbackLines(callback, context, deps))

  return lines
}

function emitNetZeroArgCallbackLines(
  callback: AnyNode | null | undefined,
  context: CFunctionContext,
  deps: NetLoweringDependencies
): string[] {
  if (callback == null) {
    return []
  }

  if (callback.type !== 'ArrowFunctionExpression' || callback.params.length !== 0 || callback.async === true) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_NET_SERVER',
        'net server lifecycle callbacks in the C backend currently require a synchronous zero-argument arrow function',
        callback.loc
      )
    )
    return []
  }

  const body: NetAstNode[] = []

  if (callback.expressionBody) {
    body.push({
      type: 'ExpressionStatement',
      expression: callback.body,
      loc: callback.loc
    })
  } else {
    pushNetNodes(body, callback.body)
  }

  return deps.emitStatementList(body, context)
}

function emitNetListenCallback(args: AnyNode[], options: AnyNode | null): AnyNode | null {
  if (options != null) {
    if (args.length > 1 && args[1].type === 'ArrowFunctionExpression') {
      return args[1]
    }

    return null
  }

  for (const arg of args) {
    if (arg.type === 'ArrowFunctionExpression') {
      return arg
    }
  }

  return null
}

function emitNetListenPortArg(args: AnyNode[]): AnyNode | null {
  if (args.length === 0) {
    return null
  }

  if (args[0].type === 'ArrowFunctionExpression') {
    return null
  }

  return args[0]
}

function emitNetListenHostArg(args: AnyNode[]): AnyNode | null {
  if (args.length < 2) {
    return null
  }

  const secondArg = args[1]

  if (secondArg.type === 'StringLiteral') {
    return secondArg
  }

  if (secondArg.type === 'TemplateLiteral' && !secondArg.raw.includes('${')) {
    return secondArg
  }

  return null
}

function emitNetListenBacklogArg(args: AnyNode[]): AnyNode | null {
  if (args.length > 1 && args[1].type === 'NumberLiteral') {
    return args[1]
  }

  if (args.length > 2 && args[2].type === 'NumberLiteral') {
    return args[2]
  }

  return null
}

function emitNetListenHostExpression(expression: AnyNode | null | undefined, context: CFunctionContext): string {
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
      'CCJS_NET_SERVER',
      'server.listen host in the C backend currently must be a string literal',
      expression.loc
    )
  )
  return '0'
}

function emitNetConnectHostExpression(expression: AnyNode | null | undefined, context: CFunctionContext): string {
  if (expression == null) {
    return '"127.0.0.1"'
  }

  return emitNetListenHostExpression(expression, context)
}

function emitNetBytesOperand(
  expression: AnyNode | null | undefined,
  netContext: NetHandlerContext | null,
  context: CFunctionContext,
  deps: NetLoweringDependencies
): PreparedStringBytesOperand {
  if (expression == null) {
    return {
      lines: [],
      bytes: '""',
      length: '0'
    }
  }

  if (
    netContext != null &&
    netContext.dataName != null &&
    expression.type === 'Reference' &&
    expression.path.length === 1 &&
    netReferenceName(expression) === netContext.dataName
  ) {
    return {
      lines: [],
      bytes: 'ccjs_bytes',
      length: 'ccjs_len'
    }
  }

  const staticValue = emitNetStaticStringValue(expression, netContext)

  if (staticValue != null) {
    return {
      lines: [],
      bytes: cStringLiteral(staticValue),
      length: `${utf8ByteLength(staticValue)}`
    }
  }

  return deps.emitPreparedStringBytesOperand(expression, context, 'ccjs_net_string')
}

function emitNetStaticStringValue(
  expression: AnyNode | null | undefined,
  netContext: NetHandlerContext | null
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

  if (expression.type === 'Reference' && expression.path.length === 1 && netContext != null) {
    const name = netReferenceName(expression)

    if (name == null) {
      return null
    }

    if (netContext.stringLocals.has(name)) {
      const value = netContext.stringLocals.get(name)

      if (value != null) {
        return value
      }
    }
  }

  return null
}

function emitNetStatusCheck(call: string, context: CFunctionContext): string[] {
  const status = nextCName(context, 'ccjs_net_status')

  return ['{', `  ccjs_status ${status} = ${call};`, `  if (${status} != CCJS_OK) return ${status};`, '}']
}

export function emitPreparedNetAddressPortExpression(
  expression: AnyNode | null | undefined,
  context: CFunctionContext
): PreparedExpression | null {
  if (expression == null) {
    return null
  }

  const name = netReferenceName(expression.object)

  if (
    expression.type !== 'MemberExpression' ||
    expression.property !== 'port' ||
    expression.object == null ||
    expression.object.type !== 'Reference' ||
    expression.object.path.length !== 1 ||
    name == null ||
    context.variables.get(name) !== 'net-address'
  ) {
    return null
  }

  return {
    lines: [],
    expression: name + '.port'
  }
}

export function resolveNetAddressStringMember(expression: AnyNode, context: CFunctionContext): string | null {
  const name = netReferenceName(expression.object)

  if (
    expression.type !== 'MemberExpression' ||
    (expression.property !== 'address' && expression.property !== 'family') ||
    expression.object == null ||
    expression.object.type !== 'Reference' ||
    expression.object.path.length !== 1 ||
    name == null ||
    context.variables.get(name) !== 'net-address'
  ) {
    return null
  }

  if (expression.property === 'family') {
    return `${name}.family`
  }

  return `${name}.address`
}

function isNetAddressCall(expression: AnyNode | null | undefined, context: CFunctionContext): boolean {
  if (expression == null || expression.type !== 'CallExpression') {
    return false
  }

  const callee = expression.callee

  if (
    callee == null ||
    callee.type !== 'MemberExpression' ||
    callee.property !== 'address' ||
    callee.object == null ||
    callee.object.type !== 'Reference' ||
    callee.object.path.length !== 1
  ) {
    return false
  }

  const receiverName = netMemberObjectReferenceName(callee)

  if (receiverName == null) {
    return false
  }

  const receiverType = context.variables.get(receiverName)

  return receiverType === 'net-server' || receiverType === 'net-socket'
}

function resolveNetSocketAddressMember(
  expression: AnyNode | null | undefined,
  context: CFunctionContext
): NetSocketAddressMember | null {
  let socketName: string | null = null

  if (expression != null) {
    socketName = netReferenceName(expression.object)
  }

  if (
    expression == null ||
    expression.type !== 'MemberExpression' ||
    expression.object == null ||
    expression.object.type !== 'Reference' ||
    expression.object.path.length !== 1 ||
    socketName == null ||
    context.variables.get(socketName) !== 'net-socket'
  ) {
    return null
  }

  const property = expression.property
  const isRemote = property === 'remoteAddress' || property === 'remotePort'
  const isLocal = property === 'localAddress' || property === 'localPort'

  if (!isRemote && !isLocal) {
    return null
  }

  let runtime = 'ccjs_net_socket_address'

  if (isRemote) {
    runtime = 'ccjs_net_socket_remote_address'
  }

  let field: 'address' | 'port' = 'address'
  let valueType: 'number' | 'string' = 'string'

  if (property === 'remotePort' || property === 'localPort') {
    field = 'port'
    valueType = 'number'
  }

  return {
    socketName,
    runtime: runtime,
    tempName: nextCName(context, 'ccjs_net_address'),
    field: field,
    valueType: valueType
  }
}

function resolveNetSocketCounterMember(
  expression: AnyNode | null | undefined,
  context: CFunctionContext
): NetSocketCounterMember | null {
  let socketName: string | null = null

  if (expression != null) {
    socketName = netReferenceName(expression.object)
  }

  if (
    expression == null ||
    expression.type !== 'MemberExpression' ||
    expression.object == null ||
    expression.object.type !== 'Reference' ||
    expression.object.path.length !== 1 ||
    socketName == null ||
    context.variables.get(socketName) !== 'net-socket'
  ) {
    return null
  }

  if (expression.property === 'bytesRead') {
    return {
      socketName,
      runtime: 'ccjs_net_socket_get_bytes_read'
    }
  }

  if (expression.property === 'bytesWritten') {
    return {
      socketName,
      runtime: 'ccjs_net_socket_get_bytes_written'
    }
  }

  return null
}

function isNetSocketMethodCall(expression: AnyNode, method: string, context: CFunctionContext): boolean {
  return isNetSocketAnyMethodCall(expression, context) && expression.callee.property === method
}

function isNetSocketAnyMethodCall(expression: AnyNode, context: CFunctionContext): boolean {
  if (expression.type !== 'CallExpression') {
    return false
  }

  const callee = expression.callee
  const socketName = netMemberObjectReferenceName(callee)

  if (
    callee == null ||
    callee.type !== 'MemberExpression' ||
    callee.object == null ||
    callee.object.type !== 'Reference' ||
    callee.object.path.length !== 1 ||
    socketName == null
  ) {
    return false
  }

  return context.variables.get(socketName) === 'net-socket'
}

function isNetServerMethodCall(expression: AnyNode, method: string, context: CFunctionContext): boolean {
  return isNetServerAnyMethodCall(expression, context) && expression.callee.property === method
}

function isNetServerAnyMethodCall(expression: AnyNode, context: CFunctionContext): boolean {
  if (expression.type !== 'CallExpression') {
    return false
  }

  const callee = expression.callee
  const serverName = netMemberObjectReferenceName(callee)

  if (
    callee == null ||
    callee.type !== 'MemberExpression' ||
    callee.object == null ||
    callee.object.type !== 'Reference' ||
    callee.object.path.length !== 1 ||
    serverName == null
  ) {
    return false
  }

  return context.variables.get(serverName) === 'net-server'
}

function isNetCreateServerCall(expression: AnyNode | null | undefined, context: CEmitContext): boolean {
  if (expression == null || expression.type !== 'CallExpression') {
    return false
  }

  const callee = expression.callee
  const calleeName = netReferenceName(callee)

  if (
    callee != null &&
    callee.type === 'Reference' &&
    callee.path.length === 1 &&
    calleeName != null &&
    context.netCreateServerNames.has(calleeName)
  ) {
    return true
  }

  const objectName = netMemberObjectReferenceName(callee)

  return (
    callee != null &&
    callee.type === 'MemberExpression' &&
    callee.property === 'createServer' &&
    callee.object != null &&
    callee.object.type === 'Reference' &&
    callee.object.path.length === 1 &&
    objectName != null &&
    context.netImportNames.has(objectName)
  )
}

function isNetConnectCall(expression: AnyNode | null | undefined, context: CEmitContext): boolean {
  if (expression == null || expression.type !== 'CallExpression') {
    return false
  }

  const callee = expression.callee
  const calleeName = netReferenceName(callee)

  if (
    callee != null &&
    callee.type === 'Reference' &&
    callee.path.length === 1 &&
    calleeName != null &&
    context.netConnectNames.has(calleeName)
  ) {
    return true
  }

  const objectName = netMemberObjectReferenceName(callee)

  return (
    callee != null &&
    callee.type === 'MemberExpression' &&
    (callee.property === 'connect' || callee.property === 'createConnection') &&
    callee.object != null &&
    callee.object.type === 'Reference' &&
    callee.object.path.length === 1 &&
    objectName != null &&
    context.netImportNames.has(objectName)
  )
}

function emitNetCreateServerConnectionListener(expression: AnyNode): AnyNode | null {
  if (expression.args.length > 0 && expression.args[0].type === 'ArrowFunctionExpression') {
    return expression.args[0]
  }

  if (expression.args.length > 1 && expression.args[1].type === 'ArrowFunctionExpression') {
    return expression.args[1]
  }

  return null
}

function emitNetConnectCallback(expression: AnyNode): AnyNode | null {
  if (expression.args.length > 0 && expression.args[0].type === 'ObjectLiteral') {
    if (expression.args.length > 1 && expression.args[1].type === 'ArrowFunctionExpression') {
      return expression.args[1]
    }

    return null
  }

  if (expression.args.length > 1 && expression.args[1].type === 'ArrowFunctionExpression') {
    return expression.args[1]
  }

  if (expression.args.length > 2 && expression.args[2].type === 'ArrowFunctionExpression') {
    return expression.args[2]
  }

  return null
}

function findNetHandler(
  context: CEmitContext,
  expression: AnyNode | null | undefined,
  kind: string
): CNetHandler | null {
  if (expression == null) {
    return null
  }

  for (const wrapper of context.netHandlers.values()) {
    const wrapperExpression: AnyNode = wrapper.expression

    if (wrapperExpression === expression && wrapper.kind === kind) {
      return wrapper
    }
  }

  return null
}

export function collectNetHandlers(irPrograms: IrProgram[], context: CEmitContext): Map<string, CNetHandler> {
  const handlers: Map<string, CNetHandler> = new Map()
  const programs: IrProgram[] = irPrograms

  for (const ir of programs) {
    const items: NetTopLevelNodeEntry[] = collectIrTopLevelNodeEntries(ir)

    for (let itemIndex = 0; itemIndex < items.length; itemIndex = itemIndex + 1) {
      const item = items[itemIndex]

      if (item.kind === 'function') {
        const statements: NetAstNode[] = item.node.body

        for (const statement of statements) {
          visitNetHandlerStatement(handlers, context, statement)
        }
      } else if (item.kind === 'statement') {
        visitNetHandlerStatement(handlers, context, item.node)
      }
    }
  }

  return handlers
}

function registerNetHandler(
  handlers: Map<string, CNetHandler>,
  kind: string,
  expression: AnyNode | null | undefined
): void {
  if (expression == null || expression.type !== 'ArrowFunctionExpression') {
    return
  }

  for (const wrapper of handlers.values()) {
    const wrapperExpression: AnyNode = wrapper.expression

    if (wrapper.kind === kind && wrapperExpression === expression) {
      return
    }
  }

  const cKind = replaceNetKindSeparator(kind)

  handlers.set(`${kind}:${handlers.size}`, {
    kind: kind,
    name: `ccjs_net_${cKind}_handler_${handlers.size}`,
    expression: expression
  })
}

function registerNetServerEventListener(
  handlers: Map<string, CNetHandler>,
  expression: AnyNode | null | undefined
): void {
  if (
    expression == null ||
    expression.type !== 'CallExpression' ||
    expression.callee == null ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.property !== 'on' ||
    expression.args.length === 0 ||
    expression.args[0].type !== 'StringLiteral'
  ) {
    return
  }

  const eventName = expression.args[0].value

  if (eventName === 'connection') {
    registerNetHandler(handlers, 'connection', expression.args[1])
  } else if (eventName === 'listening' || eventName === 'close') {
    registerNetHandler(handlers, 'event', expression.args[1])
  } else if (eventName === 'error') {
    registerNetHandler(handlers, 'error', expression.args[1])
  }
}

function registerNetSocketEventListener(
  handlers: Map<string, CNetHandler>,
  expression: AnyNode | null | undefined
): void {
  if (
    expression == null ||
    expression.type !== 'CallExpression' ||
    expression.callee == null ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.property !== 'on' ||
    expression.args.length === 0 ||
    expression.args[0].type !== 'StringLiteral'
  ) {
    return
  }

  const eventName = expression.args[0].value

  if (eventName === 'data') {
    registerNetHandler(handlers, 'socket-data', expression.args[1])
  } else if (isNetSocketLifecycleEvent(eventName)) {
    registerNetHandler(handlers, 'socket-event', expression.args[1])
  } else if (eventName === 'error') {
    registerNetHandler(handlers, 'socket-error', expression.args[1])
  }
}

function registerNetSocketWriteCallback(
  handlers: Map<string, CNetHandler>,
  expression: AnyNode | null | undefined
): void {
  if (
    expression == null ||
    expression.type !== 'CallExpression' ||
    expression.callee == null ||
    expression.callee.type !== 'MemberExpression' ||
    !isNetSocketWriteMethod(expression.callee.property)
  ) {
    return
  }

  const callback = lastNetArgument(expression.args)

  if (callback != null && callback.type === 'ArrowFunctionExpression') {
    registerNetHandler(handlers, 'socket-write', callback)
  }
}

function visitNetHandlerStatement(
  handlers: Map<string, CNetHandler>,
  context: CEmitContext,
  statement: AnyNode | null | undefined
): void {
  if (statement == null) {
    return
  }

  if (statement.type === 'VariableDeclaration') {
    visitNetHandlerExpression(handlers, context, statement.init)
    return
  }

  if (statement.type === 'ExpressionStatement') {
    visitNetHandlerExpression(handlers, context, statement.expression)
    return
  }

  if (statement.type === 'ReturnStatement' || statement.type === 'ThrowStatement') {
    visitNetHandlerExpression(handlers, context, statement.argument)
    return
  }

  if (statement.type === 'BlockStatement') {
    const statements: NetAstNode[] = statement.body

    for (const item of statements) {
      visitNetHandlerStatement(handlers, context, item)
    }
    return
  }

  if (statement.type === 'IfStatement') {
    visitNetHandlerExpression(handlers, context, statement.condition)
    visitNetHandlerStatement(handlers, context, statement.consequent)
    visitNetHandlerStatement(handlers, context, statement.alternate)
    return
  }

  if (statement.type === 'WhileStatement') {
    visitNetHandlerExpression(handlers, context, statement.condition)
    visitNetHandlerStatement(handlers, context, statement.body)
    return
  }

  if (statement.type === 'ForStatement') {
    if (statement.init != null && statement.init.type === 'VariableDeclaration') {
      visitNetHandlerStatement(handlers, context, statement.init)
    } else {
      visitNetHandlerExpression(handlers, context, statement.init)
    }

    visitNetHandlerExpression(handlers, context, statement.test)
    visitNetHandlerExpression(handlers, context, statement.update)
    visitNetHandlerStatement(handlers, context, statement.body)
    return
  }

  if (statement.type === 'ForOfStatement') {
    visitNetHandlerExpression(handlers, context, statement.iterable)
    visitNetHandlerStatement(handlers, context, statement.body)
    return
  }

  if (statement.type === 'SwitchStatement') {
    visitNetHandlerExpression(handlers, context, statement.discriminant)
    const cases: NetAstNode[] = statement.cases

    for (const item of cases) {
      visitNetHandlerExpression(handlers, context, item.test)
      const consequents: NetAstNode[] = item.consequent

      for (const consequent of consequents) {
        visitNetHandlerStatement(handlers, context, consequent)
      }
    }
    return
  }

  if (statement.type === 'TryStatement') {
    const handler = statement.handler
    visitNetHandlerStatement(handlers, context, statement.block)
    if (handler != null) {
      visitNetHandlerStatement(handlers, context, handler.body)
    }
    visitNetHandlerStatement(handlers, context, statement.finalizer)
  }
}

function visitNetHandlerExpression(
  handlers: Map<string, CNetHandler>,
  context: CEmitContext,
  expression: AnyNode | null | undefined
): void {
  if (expression == null) {
    return
  }

  if (expression.type === 'CallExpression') {
    if (isNetCreateServerCall(expression, context)) {
      registerNetHandler(handlers, 'connection', emitNetCreateServerConnectionListener(expression))
    }

    if (isNetConnectCall(expression, context)) {
      registerNetHandler(handlers, 'socket-event', emitNetConnectCallback(expression))
    }

    registerNetServerEventListener(handlers, expression)
    registerNetSocketEventListener(handlers, expression)
    registerNetSocketWriteCallback(handlers, expression)
    visitNetHandlerExpression(handlers, context, expression.callee)
    const args: NetAstNode[] = expression.args

    for (const arg of args) {
      visitNetHandlerExpression(handlers, context, arg)
    }
    return
  }

  if (expression.type === 'OptionalCallExpression' || expression.type === 'NewExpression') {
    visitNetHandlerExpression(handlers, context, expression.callee)
    const args: NetAstNode[] = expression.args

    for (const arg of args) {
      visitNetHandlerExpression(handlers, context, arg)
    }
    return
  }

  if (expression.type === 'ArrowFunctionExpression') {
    if (expression.expressionBody) {
      visitNetHandlerExpression(handlers, context, expression.body)
    } else {
      const statements: NetAstNode[] = expression.body

      for (const statement of statements) {
        visitNetHandlerStatement(handlers, context, statement)
      }
    }

    return
  }

  if (expression.type === 'AssignmentExpression') {
    visitNetHandlerExpression(handlers, context, expression.target)
    visitNetHandlerExpression(handlers, context, expression.value)
    return
  }

  if (expression.type === 'BinaryExpression') {
    visitNetHandlerExpression(handlers, context, expression.left)
    visitNetHandlerExpression(handlers, context, expression.right)
    return
  }

  if (
    expression.type === 'UnaryExpression' ||
    expression.type === 'UpdateExpression' ||
    expression.type === 'AwaitExpression'
  ) {
    visitNetHandlerExpression(handlers, context, expression.argument)
    return
  }

  if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
    visitNetHandlerExpression(handlers, context, expression.object)
    return
  }

  if (expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression') {
    visitNetHandlerExpression(handlers, context, expression.object)
    visitNetHandlerExpression(handlers, context, expression.index)
    return
  }

  if (expression.type === 'ArrayLiteral') {
    const elements: NetAstNode[] = expression.elements

    for (const element of elements) {
      visitNetHandlerExpression(handlers, context, element)
    }
    return
  }

  if (expression.type === 'ObjectLiteral') {
    const properties: NetAstNode[] = expression.properties

    for (const property of properties) {
      visitNetHandlerExpression(handlers, context, property.value)
    }
  }
}
