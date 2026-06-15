import { diagnostic } from '../../diagnostics.ts'
import { collectIrTopLevelNodeEntries } from '../../ir.ts'
import {
  emitEventLoopReference,
  emitStatusCheck,
  nextCName,
  registerEventLoop,
  type CEmitContext,
  type CFunctionContext
} from '../context.ts'
import { cStringLiteral, utf8ByteLength } from '../identifiers.ts'
import { isConsoleLog } from './console.ts'
import type { AnyNode, IrProgram } from '../../types.ts'
import type {
  CNetHandler,
  CPreparedExpression as PreparedExpression,
  CPreparedStringBytesOperand as PreparedStringBytesOperand
} from '../types.ts'

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

export type NetLoweringDependencies = {
  createFunctionContext: (
    baseContext: CEmitContext,
    returnType: string,
    returnNullable?: boolean
  ) => CFunctionContext
  emitConsoleLogStatement: (method: string, args: AnyNode[], context: CFunctionContext) => string[]
  emitPreparedNumberExpression: (expression: AnyNode, context: CFunctionContext) => PreparedExpression
  emitPreparedStringBytesOperand: (
    expression: AnyNode,
    context: CFunctionContext,
    tempPrefix?: string
  ) => PreparedStringBytesOperand
  emitStatementList: (body: AnyNode[], context: CFunctionContext) => string[]
  findObjectLiteralPropertyValue: (expression: AnyNode, key: string) => AnyNode | null
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
  const isSocketHandler = wrapper.kind === 'connection' || wrapper.kind.startsWith('socket-')
  const socketName = wrapper.kind === 'connection' ? (expression.params[0]?.name ?? null) : null
  const dataName = wrapper.kind === 'socket-data' ? (expression.params[0]?.name ?? null) : null
  const netContext: NetHandlerContext = {
    kind: wrapper.kind,
    dataName,
    socketName,
    stringLocals: new Map<string, string>()
  }
  const context = deps.createFunctionContext(baseContext, 'void')
  context.statusReturn = true

  if (socketName != null) {
    context.variables.set(socketName, 'net-socket')
  }

  if (dataName != null) {
    context.variables.set(dataName, 'string')
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
    `${emitNetHandlerHead(wrapper)} {`,
    '  (void)user;',
    ...(wrapper.kind === 'connection' || wrapper.kind === 'event' || wrapper.kind === 'error'
      ? ['  (void)ccjs_server;']
      : []),
    ...(isSocketHandler && socketName == null ? ['  (void)ccjs_socket;'] : []),
    ...(wrapper.kind === 'socket-data' && dataName == null ? ['  (void)ccjs_bytes;', '  (void)ccjs_len;'] : []),
    ...(wrapper.kind === 'error' || wrapper.kind === 'socket-error' ? ['  (void)ccjs_error_status;'] : []),
    ...(wrapper.kind === 'socket-write' ? ['  (void)ccjs_write_status;'] : [])
  ]

  for (const statement of body) {
    lines.push(...emitNetHandlerStatement(statement, netContext, context, deps).map((line) => `  ${line}`))
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
    return [
      '{',
      ...statement.body
        .flatMap((item) => emitNetHandlerStatement(item, netContext, context, deps))
        .map((line) => `  ${line}`),
      '}'
    ]
  }

  if (statement.type === 'VariableDeclaration') {
    const stringValue = emitNetStaticStringValue(statement.init, netContext)

    if (stringValue == null) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_NET_HANDLER',
          'net event listeners in the C backend currently support only static string local declarations',
          statement.loc
        )
      )
      return []
    }

    netContext.stringLocals.set(statement.name, stringValue)
    return []
  }

  if (statement.type === 'ExpressionStatement' && statement.expression?.type === 'CallExpression') {
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
    if (statement.argument?.type === 'CallExpression') {
      const socketCall = emitNetHandlerSocketCallStatement(statement.argument, netContext, context, deps)

      if (socketCall != null) {
        return [...socketCall, 'return CCJS_OK;']
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
  if (
    expression.callee?.type !== 'MemberExpression' ||
    expression.callee.object?.type !== 'Reference' ||
    expression.callee.object.path.length !== 1
  ) {
    return null
  }

  if (
    netContext.socketName != null &&
    expression.callee.object.path[0] !== netContext.socketName &&
    !String(netContext.kind).startsWith('socket-')
  ) {
    return null
  }

  const method = expression.callee.property

  if (method === 'write' || method === 'end') {
    const callback = expression.args.at(-1)?.type === 'ArrowFunctionExpression' ? expression.args.at(-1) : null
    const bodyArg = callback != null && expression.args.length === 1 ? null : expression.args[0]
    const body = emitNetBytesOperand(bodyArg, netContext, context, deps)
    const wrapper = findNetHandler(context, callback, 'socket-write')
    const runtime =
      method === 'write'
        ? wrapper == null
          ? 'ccjs_net_socket_write'
          : 'ccjs_net_socket_write_with_callback'
        : wrapper == null
          ? 'ccjs_net_socket_end'
          : 'ccjs_net_socket_end_with_callback'
    const callbackArgs = wrapper == null ? '' : `, ${wrapper.name}, 0`

    return [
      ...body.lines,
      ...emitNetStatusCheck(`${runtime}(ccjs_socket, ${body.bytes}, ${body.length}${callbackArgs})`, context)
    ]
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
      expression.callee.loc ?? expression.loc
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

  const stream =
    expression.callee.property === 'warn' || expression.callee.property === 'error'
      ? 'CCJS_CONSOLE_STDERR'
      : 'CCJS_CONSOLE_STDOUT'

  if (
    expression.args.length === 1 &&
    netContext.dataName != null &&
    expression.args[0]?.type === 'Reference' &&
    expression.args[0].path.length === 1 &&
    expression.args[0].path[0] === netContext.dataName
  ) {
    return stream === 'CCJS_CONSOLE_STDOUT'
      ? ['printf("%.*s\\n", (int)ccjs_len, ccjs_bytes);']
      : [`if (ccjs_console_printf(${stream}, "%.*s\\n", (int)ccjs_len, ccjs_bytes) < 0) return CCJS_ERR_TYPE;`]
  }

  return deps.emitConsoleLogStatement(expression.callee.property, expression.args, context)
}

function emitNetHandlerServerCallStatement(expression: AnyNode, context: CFunctionContext): string[] | null {
  if (
    expression.callee?.type !== 'MemberExpression' ||
    expression.callee.object?.type !== 'Reference' ||
    expression.callee.object.path.length !== 1
  ) {
    return null
  }

  if (expression.callee.property !== 'close') {
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

  return emitNetSocketConnectLines(statement.init, statement.name, context, deps)
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

  return emitNetServerCreateLines(statement.init, statement.name, context)
}

export function emitNetAddressVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[] | null {
  if (!isNetAddressCall(statement.init, context)) {
    return null
  }

  const receiverName = statement.init.callee.object.path[0]
  const runtime =
    context.variables.get(receiverName) === 'net-socket' ? 'ccjs_net_socket_address' : 'ccjs_net_server_address'
  context.variables.set(statement.name, 'net-address')

  return [
    `ccjs_net_address ${statement.name};`,
    emitStatusCheck(`${runtime}(${receiverName}, &${statement.name})`, context)
  ]
}

export function emitNetAddressMemberVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[] | null {
  const member = resolveNetSocketAddressMember(statement.init, context)

  if (member == null) {
    return null
  }

  if (member.valueType === 'string') {
    context.variables.set(statement.name, 'string')

    return [
      `ccjs_net_address ${member.tempName};`,
      emitStatusCheck(`${member.runtime}(${member.socketName}, &${member.tempName})`, context),
      `const char *${statement.name} = ${member.tempName}.${member.field};`
    ]
  }

  context.variables.set(statement.name, 'number')

  return [
    `double ${statement.name} = 0;`,
    '{',
    `  ccjs_net_address ${member.tempName};`,
    `  ${emitStatusCheck(`${member.runtime}(${member.socketName}, &${member.tempName})`, context)}`,
    `  ${statement.name} = (double)${member.tempName}.${member.field};`,
    '}'
  ]
}

export function emitNetNumberVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[] | null {
  const counter = resolveNetSocketCounterMember(statement.init, context)

  if (counter == null) {
    return null
  }

  context.variables.set(statement.name, 'number')

  return [
    `double ${statement.name} = 0;`,
    '{',
    `  size_t ccjs_net_counter = 0;`,
    `  ${emitStatusCheck(`${counter.runtime}(${counter.socketName}, &ccjs_net_counter)`, context)}`,
    `  ${statement.name} = (double)ccjs_net_counter;`,
    '}'
  ]
}

export function emitNetSocketCallStatement(
  expression: AnyNode,
  context: CFunctionContext,
  deps: NetLoweringDependencies
): string[] | null {
  if (isNetSocketMethodCall(expression, 'on', context)) {
    return emitNetSocketOnLines(expression.callee.object.path[0], expression.args, context)
  }

  if (isNetSocketMethodCall(expression, 'write', context)) {
    return emitNetSocketWriteLines(expression.callee.object.path[0], 'write', expression.args, context, deps)
  }

  if (isNetSocketMethodCall(expression, 'end', context)) {
    return emitNetSocketWriteLines(expression.callee.object.path[0], 'end', expression.args, context, deps)
  }

  if (isNetSocketMethodCall(expression, 'destroy', context)) {
    return [emitStatusCheck(`ccjs_net_socket_destroy(${expression.callee.object.path[0]})`, context)]
  }

  if (isNetSocketMethodCall(expression, 'close', context)) {
    return [`ccjs_net_socket_close(${expression.callee.object.path[0]});`]
  }

  if (isNetSocketMethodCall(expression, 'setEncoding', context)) {
    return emitNetSocketSetEncodingLines(expression.callee.object.path[0], expression.args, context)
  }

  const optionCall = emitNetSocketOptionCallStatement(expression, context, deps)

  if (optionCall != null) {
    return optionCall
  }

  if (isNetSocketAnyMethodCall(expression, context)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_NET_SOCKET',
        `socket.${expression.callee.property} is not supported by the current C net backend slice`,
        expression.callee.loc ?? expression.loc
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
  if (
    expression.callee?.type === 'MemberExpression' &&
    expression.callee.property === 'listen' &&
    isNetCreateServerCall(expression.callee.object, context)
  ) {
    const serverName = nextCName(context, 'ccjs_net_server')
    registerEventLoop(context)

    return [
      `ccjs_net_server* ${serverName} = 0;`,
      ...emitNetServerCreateLines(expression.callee.object, serverName, context, {
        declare: false
      }),
      ...emitNetServerListenLines(serverName, expression.args, context, deps)
    ]
  }

  if (isNetServerMethodCall(expression, 'listen', context)) {
    const serverName = expression.callee.object.path[0]
    registerEventLoop(context)

    return emitNetServerListenLines(serverName, expression.args, context, deps)
  }

  if (isNetServerMethodCall(expression, 'on', context)) {
    return emitNetServerOnLines(expression.callee.object.path[0], expression.args, context)
  }

  if (isNetServerMethodCall(expression, 'close', context)) {
    return emitNetServerCloseLines(expression.callee.object.path[0], expression.args, context, deps)
  }

  if (isNetServerAnyMethodCall(expression, context)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_NET_SERVER',
        `server.${expression.callee.property} is not supported by the current C net backend slice`,
        expression.callee.loc ?? expression.loc
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
  options: { declare?: boolean } = {}
): string[] {
  const optionsArg = expression.args[0]?.type === 'ObjectLiteral' ? expression.args[0] : null
  const callback = emitNetConnectCallback(expression)
  const portArg = optionsArg == null ? expression.args[0] : deps.findObjectLiteralPropertyValue(optionsArg, 'port')
  const hostArg =
    optionsArg == null
      ? expression.args[1]?.type === 'ArrowFunctionExpression'
        ? null
        : expression.args[1]
      : deps.findObjectLiteralPropertyValue(optionsArg, 'host')
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
        callback.loc ?? expression.loc
      )
    )
  }

  const port = portArg == null ? { lines: [], expression: '0' } : deps.emitPreparedNumberExpression(portArg, context)
  const host = emitNetConnectHostExpression(hostArg, context)
  const lines = options.declare === false ? [] : [`ccjs_net_socket* ${socketName} = 0;`]

  lines.push(
    ...port.lines,
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
  const eventName = args[0]?.type === 'StringLiteral' ? args[0].value : null
  const kind =
    eventName === 'data'
      ? 'socket-data'
      : ['connect', 'ready', 'end', 'close', 'drain'].includes(eventName ?? '')
        ? 'socket-event'
        : eventName === 'error'
          ? 'socket-error'
          : null

  if (kind == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_NET_SOCKET',
        "socket.on in the C backend currently supports 'connect', 'ready', 'data', 'end', 'close', 'error' and 'drain'",
        args[0]?.loc
      )
    )
    return []
  }

  const listener = args[1]
  const wrapper = findNetHandler(context, listener, kind)

  if (listener?.type !== 'ArrowFunctionExpression' || wrapper == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_NET_SOCKET',
        `socket.on('${eventName}') in the C backend currently requires an inline listener`,
        listener?.loc
      )
    )
    return []
  }

  const runtime =
    eventName === 'connect'
      ? 'ccjs_net_socket_on_connect'
      : eventName === 'ready'
        ? 'ccjs_net_socket_on_ready'
        : eventName === 'data'
          ? 'ccjs_net_socket_on_data'
          : eventName === 'end'
            ? 'ccjs_net_socket_on_end'
            : eventName === 'close'
              ? 'ccjs_net_socket_on_close'
              : eventName === 'error'
                ? 'ccjs_net_socket_on_error'
                : 'ccjs_net_socket_on_drain'
  const lines = [emitStatusCheck(`${runtime}(${socketName}, ${wrapper.name}, 0)`, context)]

  if (eventName === 'data' || eventName === 'end') {
    lines.push(...emitNetMaybeReadStartLines(socketName, context))
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
  const callback = args.at(-1)?.type === 'ArrowFunctionExpression' ? args.at(-1) : null
  const bodyArg = callback != null && args.length === 1 ? null : args[0]
  const body = emitNetBytesOperand(bodyArg, null, context, deps)
  const wrapper = findNetHandler(context, callback, 'socket-write')
  const runtime =
    method === 'write'
      ? wrapper == null
        ? 'ccjs_net_socket_write'
        : 'ccjs_net_socket_write_with_callback'
      : wrapper == null
        ? 'ccjs_net_socket_end'
        : 'ccjs_net_socket_end_with_callback'
  const callbackArgs = wrapper == null ? '' : `, ${wrapper.name}, 0`

  if (callback != null && wrapper == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_NET_SOCKET',
        `socket.${method} callback in the C backend currently requires an inline listener`,
        callback.loc
      )
    )
  }

  return [
    ...body.lines,
    emitStatusCheck(`${runtime}(${socketName}, ${body.bytes}, ${body.length}${callbackArgs})`, context)
  ]
}

function emitNetSocketSetEncodingLines(socketName: string, args: AnyNode[], context: CFunctionContext): string[] {
  const value = emitNetStaticStringValue(args[0], null)

  if (value == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_NET_SOCKET',
        'socket.setEncoding in the C backend currently requires a static string',
        args[0]?.loc
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

  const socketName = expression.callee.object.path[0]
  const method = expression.callee.property

  if (method === 'setNoDelay') {
    const enabled =
      expression.args[0] == null
        ? { lines: [], expression: '1' }
        : deps.emitPreparedNumberExpression(expression.args[0], context)

    return [
      ...enabled.lines,
      emitStatusCheck(`ccjs_net_socket_set_no_delay(${socketName}, ${enabled.expression} ? 1 : 0)`, context)
    ]
  }

  if (method === 'setKeepAlive') {
    const enabled =
      expression.args[0] == null
        ? { lines: [], expression: '0' }
        : deps.emitPreparedNumberExpression(expression.args[0], context)
    const delay =
      expression.args[1] == null
        ? { lines: [], expression: '0' }
        : deps.emitPreparedNumberExpression(expression.args[1], context)

    return [
      ...enabled.lines,
      ...delay.lines,
      emitStatusCheck(
        `ccjs_net_socket_set_keep_alive(${socketName}, ${enabled.expression} ? 1 : 0, (unsigned int)(${delay.expression}))`,
        context
      )
    ]
  }

  if (method === 'ref' || method === 'unref') {
    if (expression.args.length > 0) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_NET_SOCKET',
          `socket.${method} in the C backend does not take arguments`,
          expression.args[0]?.loc
        )
      )
    }

    return [
      emitStatusCheck(`${method === 'ref' ? 'ccjs_net_socket_ref' : 'ccjs_net_socket_unref'}(${socketName})`, context)
    ]
  }

  if (method === 'setTimeout') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_NET_SOCKET',
        'socket.setTimeout is not supported by the current C net backend slice yet',
        expression.callee.loc ?? expression.loc
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
  options: { declare?: boolean } = {}
): string[] {
  const listener = emitNetCreateServerConnectionListener(expression)
  const wrapper = findNetHandler(context, listener, 'connection')

  if (listener != null && (listener.type !== 'ArrowFunctionExpression' || wrapper == null)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_NET_SERVER',
        'net.createServer in the C backend currently requires an inline connection listener',
        listener.loc ?? expression.loc
      )
    )
  }

  const lines = options.declare === false ? [] : [`ccjs_net_server* ${serverName} = 0;`]

  lines.push(
    emitStatusCheck(
      `ccjs_net_server_new(${emitEventLoopReference(context)}, ${wrapper?.name ?? '0'}, 0, &${serverName})`,
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
  const options = args[0]?.type === 'ObjectLiteral' ? args[0] : null
  const callback = emitNetListenCallback(args, options)
  const portArg = options == null ? emitNetListenPortArg(args) : deps.findObjectLiteralPropertyValue(options, 'port')
  const hostArg = options == null ? emitNetListenHostArg(args) : deps.findObjectLiteralPropertyValue(options, 'host')
  const backlogArg =
    options == null ? emitNetListenBacklogArg(args) : deps.findObjectLiteralPropertyValue(options, 'backlog')

  if (options != null && deps.findObjectLiteralPropertyValue(options, 'exclusive') != null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_NET_SERVER',
        'server.listen exclusive options are not supported by the current C net backend slice',
        options.loc
      )
    )
  }

  const port = portArg == null ? { lines: [], expression: '0' } : deps.emitPreparedNumberExpression(portArg, context)
  const host = emitNetListenHostExpression(hostArg, context)
  const backlog =
    backlogArg == null ? { lines: [], expression: '128' } : deps.emitPreparedNumberExpression(backlogArg, context)

  return [
    ...port.lines,
    ...backlog.lines,
    emitStatusCheck(
      `ccjs_net_server_listen(${serverName}, ${host}, (int)(${port.expression}), (int)(${backlog.expression}))`,
      context
    ),
    ...emitNetZeroArgCallbackLines(callback, context, deps)
  ]
}

function emitNetServerOnLines(serverName: string, args: AnyNode[], context: CFunctionContext): string[] {
  const eventName = args[0]?.type === 'StringLiteral' ? args[0].value : null
  const kind =
    eventName === 'connection'
      ? 'connection'
      : eventName === 'listening' || eventName === 'close'
        ? 'event'
        : eventName === 'error'
          ? 'error'
          : null

  if (kind == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_NET_SERVER',
        "server.on in the C backend currently supports 'connection', 'listening', 'close' and 'error'",
        args[0]?.loc
      )
    )
    return []
  }

  const listener = args[1]
  const wrapper = findNetHandler(context, listener, kind)

  if (listener?.type !== 'ArrowFunctionExpression' || wrapper == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_NET_SERVER',
        `server.on('${eventName}') in the C backend currently requires an inline listener`,
        listener?.loc
      )
    )
    return []
  }

  const runtime =
    eventName === 'connection'
      ? 'ccjs_net_server_on_connection'
      : eventName === 'listening'
        ? 'ccjs_net_server_on_listening'
        : eventName === 'close'
          ? 'ccjs_net_server_on_close'
          : 'ccjs_net_server_on_error'

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
      diagnostic('CCJS_NET_SERVER', 'server.close in the C backend supports only an optional callback', args[1]?.loc)
    )
  }

  return [`ccjs_net_server_close(${serverName});`, ...emitNetZeroArgCallbackLines(args[0], context, deps)]
}

function emitNetZeroArgCallbackLines(
  callback: AnyNode | null | undefined,
  context: CFunctionContext,
  deps: NetLoweringDependencies
): string[] {
  if (callback == null) {
    return []
  }

  if (callback.type !== 'ArrowFunctionExpression' || callback.params.length !== 0 || callback.async) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_NET_SERVER',
        'net server lifecycle callbacks in the C backend currently require a synchronous zero-argument arrow function',
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

function emitNetListenCallback(args: AnyNode[], options: AnyNode | null): AnyNode | null {
  if (options != null) {
    return args[1]?.type === 'ArrowFunctionExpression' ? args[1] : null
  }

  return args.find((arg) => arg?.type === 'ArrowFunctionExpression') ?? null
}

function emitNetListenPortArg(args: AnyNode[]): AnyNode | null {
  return args[0]?.type === 'ArrowFunctionExpression' ? null : (args[0] ?? null)
}

function emitNetListenHostArg(args: AnyNode[]): AnyNode | null {
  if (args[1]?.type === 'StringLiteral' || (args[1]?.type === 'TemplateLiteral' && !args[1].raw.includes('${'))) {
    return args[1]
  }

  return null
}

function emitNetListenBacklogArg(args: AnyNode[]): AnyNode | null {
  if (args[1]?.type === 'NumberLiteral') {
    return args[1]
  }

  if (args[2]?.type === 'NumberLiteral') {
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
    netContext?.dataName != null &&
    expression?.type === 'Reference' &&
    expression.path.length === 1 &&
    expression.path[0] === netContext.dataName
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
  if (expression?.type === 'StringLiteral') {
    return expression.value
  }

  if (expression?.type === 'TemplateLiteral' && !expression.raw.includes('${')) {
    return expression.raw.slice(1, -1)
  }

  if (expression?.type === 'Reference' && expression.path.length === 1) {
    return netContext?.stringLocals?.get(expression.path[0]) ?? null
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
  if (
    expression?.type !== 'MemberExpression' ||
    expression.property !== 'port' ||
    expression.object?.type !== 'Reference' ||
    expression.object.path.length !== 1 ||
    context.variables.get(expression.object.path[0]) !== 'net-address'
  ) {
    return null
  }

  return {
    lines: [],
    expression: expression.object.path[0] + '.port'
  }
}

export function resolveNetAddressStringMember(expression: AnyNode, context: CFunctionContext): string | null {
  if (
    expression?.type !== 'MemberExpression' ||
    !['address', 'family'].includes(expression.property) ||
    expression.object?.type !== 'Reference' ||
    expression.object.path.length !== 1 ||
    context.variables.get(expression.object.path[0]) !== 'net-address'
  ) {
    return null
  }

  return expression.property === 'family'
    ? `${expression.object.path[0]}.family`
    : `${expression.object.path[0]}.address`
}

function isNetAddressCall(expression: AnyNode | null | undefined, context: CFunctionContext): boolean {
  return (
    expression?.type === 'CallExpression' &&
    expression.callee?.type === 'MemberExpression' &&
    expression.callee.property === 'address' &&
    expression.callee.object?.type === 'Reference' &&
    expression.callee.object.path.length === 1 &&
    (context.variables.get(expression.callee.object.path[0]) === 'net-server' ||
      context.variables.get(expression.callee.object.path[0]) === 'net-socket')
  )
}

function resolveNetSocketAddressMember(
  expression: AnyNode | null | undefined,
  context: CFunctionContext
): NetSocketAddressMember | null {
  if (
    expression?.type !== 'MemberExpression' ||
    expression.object?.type !== 'Reference' ||
    expression.object.path.length !== 1 ||
    context.variables.get(expression.object.path[0]) !== 'net-socket'
  ) {
    return null
  }

  const property = expression.property
  const isRemote = property === 'remoteAddress' || property === 'remotePort'
  const isLocal = property === 'localAddress' || property === 'localPort'

  if (!isRemote && !isLocal) {
    return null
  }

  return {
    socketName: expression.object.path[0],
    runtime: isRemote ? 'ccjs_net_socket_remote_address' : 'ccjs_net_socket_address',
    tempName: nextCName(context, 'ccjs_net_address'),
    field: property === 'remotePort' || property === 'localPort' ? 'port' : 'address',
    valueType: property === 'remotePort' || property === 'localPort' ? 'number' : 'string'
  }
}

function resolveNetSocketCounterMember(
  expression: AnyNode | null | undefined,
  context: CFunctionContext
): NetSocketCounterMember | null {
  if (
    expression?.type !== 'MemberExpression' ||
    expression.object?.type !== 'Reference' ||
    expression.object.path.length !== 1 ||
    context.variables.get(expression.object.path[0]) !== 'net-socket'
  ) {
    return null
  }

  if (expression.property === 'bytesRead') {
    return {
      socketName: expression.object.path[0],
      runtime: 'ccjs_net_socket_get_bytes_read'
    }
  }

  if (expression.property === 'bytesWritten') {
    return {
      socketName: expression.object.path[0],
      runtime: 'ccjs_net_socket_get_bytes_written'
    }
  }

  return null
}

function isNetSocketMethodCall(expression: AnyNode, method: string, context: CFunctionContext): boolean {
  return isNetSocketAnyMethodCall(expression, context) && expression.callee.property === method
}

function isNetSocketAnyMethodCall(expression: AnyNode, context: CFunctionContext): boolean {
  return (
    expression?.type === 'CallExpression' &&
    expression.callee?.type === 'MemberExpression' &&
    expression.callee.object?.type === 'Reference' &&
    expression.callee.object.path.length === 1 &&
    context.variables.get(expression.callee.object.path[0]) === 'net-socket'
  )
}

function isNetServerMethodCall(expression: AnyNode, method: string, context: CFunctionContext): boolean {
  return isNetServerAnyMethodCall(expression, context) && expression.callee.property === method
}

function isNetServerAnyMethodCall(expression: AnyNode, context: CFunctionContext): boolean {
  return (
    expression?.type === 'CallExpression' &&
    expression.callee?.type === 'MemberExpression' &&
    expression.callee.object?.type === 'Reference' &&
    expression.callee.object.path.length === 1 &&
    context.variables.get(expression.callee.object.path[0]) === 'net-server'
  )
}

function isNetCreateServerCall(expression: AnyNode | null | undefined, context: CEmitContext): boolean {
  if (expression?.type !== 'CallExpression') {
    return false
  }

  if (
    expression.callee?.type === 'Reference' &&
    expression.callee.path.length === 1 &&
    context.netCreateServerNames.has(expression.callee.path[0])
  ) {
    return true
  }

  return (
    expression.callee?.type === 'MemberExpression' &&
    expression.callee.property === 'createServer' &&
    expression.callee.object?.type === 'Reference' &&
    expression.callee.object.path.length === 1 &&
    context.netImportNames.has(expression.callee.object.path[0])
  )
}

function isNetConnectCall(expression: AnyNode | null | undefined, context: CEmitContext): boolean {
  if (expression?.type !== 'CallExpression') {
    return false
  }

  if (
    expression.callee?.type === 'Reference' &&
    expression.callee.path.length === 1 &&
    context.netConnectNames.has(expression.callee.path[0])
  ) {
    return true
  }

  return (
    expression.callee?.type === 'MemberExpression' &&
    (expression.callee.property === 'connect' || expression.callee.property === 'createConnection') &&
    expression.callee.object?.type === 'Reference' &&
    expression.callee.object.path.length === 1 &&
    context.netImportNames.has(expression.callee.object.path[0])
  )
}

function emitNetCreateServerConnectionListener(expression: AnyNode): AnyNode | null {
  if (expression.args[0]?.type === 'ArrowFunctionExpression') {
    return expression.args[0]
  }

  if (expression.args[1]?.type === 'ArrowFunctionExpression') {
    return expression.args[1]
  }

  return null
}

function emitNetConnectCallback(expression: AnyNode): AnyNode | null {
  if (expression.args[0]?.type === 'ObjectLiteral') {
    return expression.args[1]?.type === 'ArrowFunctionExpression' ? expression.args[1] : null
  }

  if (expression.args[1]?.type === 'ArrowFunctionExpression') {
    return expression.args[1]
  }

  if (expression.args[2]?.type === 'ArrowFunctionExpression') {
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
    if (wrapper.expression === expression && wrapper.kind === kind) {
      return wrapper
    }
  }

  return null
}

export function collectNetHandlers(irPrograms: IrProgram[], context: CEmitContext): Map<string, CNetHandler> {
  const handlers = new Map<string, CNetHandler>()
  const register = (kind: string, expression: AnyNode | null | undefined) => {
    if (expression?.type !== 'ArrowFunctionExpression') {
      return
    }

    for (const wrapper of handlers.values()) {
      if (wrapper.kind === kind && wrapper.expression === expression) {
        return
      }
    }

    const cKind = kind.replaceAll('-', '_')

    handlers.set(`${kind}:${handlers.size}`, {
      kind,
      name: `ccjs_net_${cKind}_handler_${handlers.size}`,
      expression
    })
  }
  const registerEventListener = (expression: AnyNode | null | undefined) => {
    if (
      expression?.type !== 'CallExpression' ||
      expression.callee?.type !== 'MemberExpression' ||
      expression.callee.property !== 'on' ||
      expression.args[0]?.type !== 'StringLiteral'
    ) {
      return
    }

    if (expression.args[0].value === 'connection') {
      register('connection', expression.args[1])
    } else if (expression.args[0].value === 'listening' || expression.args[0].value === 'close') {
      register('event', expression.args[1])
    } else if (expression.args[0].value === 'error') {
      register('error', expression.args[1])
    }
  }
  const registerSocketEventListener = (expression: AnyNode | null | undefined) => {
    if (
      expression?.type !== 'CallExpression' ||
      expression.callee?.type !== 'MemberExpression' ||
      expression.callee.property !== 'on' ||
      expression.args[0]?.type !== 'StringLiteral'
    ) {
      return
    }

    const eventName = expression.args[0].value

    if (eventName === 'data') {
      register('socket-data', expression.args[1])
    } else if (['connect', 'ready', 'end', 'close', 'drain'].includes(eventName)) {
      register('socket-event', expression.args[1])
    } else if (eventName === 'error') {
      register('socket-error', expression.args[1])
    }
  }
  const registerSocketWriteCallback = (expression: AnyNode | null | undefined) => {
    if (
      expression?.type !== 'CallExpression' ||
      expression.callee?.type !== 'MemberExpression' ||
      !['write', 'end'].includes(expression.callee.property)
    ) {
      return
    }

    const callback = expression.args.at(-1)

    if (callback?.type === 'ArrowFunctionExpression') {
      register('socket-write', callback)
    }
  }
  const visitStatement = (statement: AnyNode | null | undefined) => {
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
      statement.cases.forEach((item: AnyNode) => {
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
  const visitExpression = (expression: AnyNode | null | undefined) => {
    if (expression == null) {
      return
    }

    if (expression.type === 'CallExpression') {
      if (isNetCreateServerCall(expression, context)) {
        register('connection', emitNetCreateServerConnectionListener(expression))
      }

      if (isNetConnectCall(expression, context)) {
        register('socket-event', emitNetConnectCallback(expression))
      }

      registerEventListener(expression)
      registerSocketEventListener(expression)
      registerSocketWriteCallback(expression)
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
