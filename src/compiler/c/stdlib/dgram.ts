import { diagnostic } from '../../diagnostics.ts'
import { collectIrTopLevelNodeEntries } from '../../ir.ts'
import {
  createFunctionContext,
  emitEventLoopReference,
  emitStatusCheck,
  nextCName,
  registerEventLoop,
  type CEmitContext,
  type CFunctionContext
} from '../context.ts'
import { cStringLiteral, utf8ByteLength } from '../identifiers.ts'
import type { AnyNode, IrProgram } from '../../types.ts'
import type {
  CDgramMessageHandler,
  CPreparedExpression as PreparedExpression,
  CPreparedStringBytesOperand as PreparedStringBytesOperand
} from '../types.ts'

type DgramMessageContext = {
  messageName: string | null
  rinfoName: string | null
  stringLocals: Map<string, string>
}

export type DgramLoweringDependencies = {
  emitPreparedNumberExpression: (expression: AnyNode, context: CFunctionContext) => PreparedExpression
  emitPreparedStringBytesOperand: (
    expression: AnyNode,
    context: CFunctionContext,
    tempPrefix?: string
  ) => PreparedStringBytesOperand
  emitReference: (expression: AnyNode, context: CFunctionContext) => string
  emitStatementList: (body: AnyNode[], context: CFunctionContext) => string[]
  findObjectLiteralPropertyValue: (expression: AnyNode, key: string) => AnyNode | null
  staticObjectBooleanPropertyValue: (expression: AnyNode, key: string) => boolean | null
  staticObjectStringPropertyValue: (expression: AnyNode, key: string) => string | null
}

export function emitDgramMessageHandlerHead(wrapper: CDgramMessageHandler): string {
  return `static ccjs_status ${wrapper.name}(void* user, ccjs_dgram_socket* ccjs_socket, const char* ccjs_bytes, size_t ccjs_len, const char* ccjs_host, int ccjs_port)`
}

export function emitDgramMessageHandlerDeclaration(
  wrapper: CDgramMessageHandler,
  baseContext: CEmitContext,
  deps: DgramLoweringDependencies
): string[] {
  const context = createFunctionContext(baseContext, 'void')
  const expression = wrapper.expression
  const messageName = expression.params[0]?.name ?? null
  const rinfoName = expression.params[1]?.name ?? null
  const dgramContext: DgramMessageContext = {
    messageName,
    rinfoName,
    stringLocals: new Map<string, string>()
  }
  context.statusReturn = true

  if (messageName != null) {
    context.variables.set(messageName, 'string')
  }

  if (rinfoName != null) {
    context.variables.set(rinfoName, 'dgram-address')
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
    `${emitDgramMessageHandlerHead(wrapper)} {`,
    '  (void)user;',
    ...(messageName == null ? ['  (void)ccjs_bytes;', '  (void)ccjs_len;'] : []),
    ...(rinfoName == null ? ['  (void)ccjs_host;', '  (void)ccjs_port;'] : [])
  ]

  for (const statement of body) {
    lines.push(...emitDgramMessageHandlerStatement(statement, dgramContext, context, deps).map((line) => `  ${line}`))
  }

  lines.push('  return CCJS_OK;')
  lines.push('}')

  return lines
}

export function emitDgramSocketVariableDeclaration(
  statement: AnyNode,
  context: CFunctionContext,
  deps: DgramLoweringDependencies
): string[] | null {
  if (!isDgramCreateSocketCall(statement.init, context)) {
    return null
  }

  context.variables.set(statement.name, 'dgram-socket')
  registerEventLoop(context)

  return emitDgramSocketCreateLines(statement.init, statement.name, context, deps)
}

export function emitDgramAddressVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[] | null {
  if (!isDgramAddressCall(statement.init, context)) {
    return null
  }

  const socketName = statement.init.callee.object.path[0]
  const runtime =
    statement.init.callee.property === 'remoteAddress'
      ? 'ccjs_dgram_socket_remote_address'
      : 'ccjs_dgram_socket_address'
  context.variables.set(statement.name, 'dgram-address')

  return [
    `ccjs_dgram_address ${statement.name};`,
    emitStatusCheck(`${runtime}(${socketName}, &${statement.name})`, context)
  ]
}

export function emitDgramNumberVariableDeclaration(
  statement: AnyNode,
  context: CFunctionContext,
  deps: DgramLoweringDependencies
): string[] | null {
  if (
    statement.init?.type !== 'CallExpression' ||
    statement.init.callee?.type !== 'MemberExpression' ||
    statement.init.callee.object?.type !== 'Reference' ||
    statement.init.callee.object.path.length !== 1 ||
    context.variables.get(statement.init.callee.object.path[0]) !== 'dgram-socket'
  ) {
    return null
  }

  const socketName = statement.init.callee.object.path[0]
  const method = statement.init.callee.property
  const runtime =
    method === 'getSendBufferSize'
      ? 'ccjs_dgram_get_send_buffer_size'
      : method === 'getRecvBufferSize'
        ? 'ccjs_dgram_get_recv_buffer_size'
        : null

  if (runtime == null) {
    return null
  }

  context.variables.set(statement.name, 'number')

  const size = nextCName(context, 'ccjs_dgram_buffer_size')

  return [
    `double ${statement.name} = 0;`,
    '{',
    `  int ${size} = 0;`,
    `  ${emitStatusCheck(`${runtime}(${socketName}, &${size})`, context)}`,
    `  ${statement.name} = (double)${size};`,
    '}'
  ]
}

export function emitDgramSocketCallStatement(
  expression: AnyNode,
  context: CFunctionContext,
  deps: DgramLoweringDependencies
): string[] | null {
  if (
    expression.callee?.type === 'MemberExpression' &&
    expression.callee.property === 'bind' &&
    isDgramCreateSocketCall(expression.callee.object, context)
  ) {
    const socketName = nextCName(context, 'ccjs_dgram_socket')
    registerEventLoop(context)

    return [
      `ccjs_dgram_socket* ${socketName} = 0;`,
      ...emitDgramSocketCreateLines(expression.callee.object, socketName, context, deps, {
        declare: false
      }),
      ...emitDgramBindLines(socketName, expression.args, context, deps)
    ]
  }

  if (isDgramSocketMethodCall(expression, 'bind', context)) {
    const socketName = expression.callee.object.path[0]
    registerEventLoop(context)

    return emitDgramBindLines(socketName, expression.args, context, deps)
  }

  if (isDgramSocketMethodCall(expression, 'on', context)) {
    return emitDgramOnLines(expression.callee.object.path[0], expression.args, context)
  }

  if (isDgramSocketMethodCall(expression, 'connect', context)) {
    return emitDgramConnectLines(expression.callee.object.path[0], expression.args, context, deps)
  }

  if (isDgramSocketMethodCall(expression, 'disconnect', context)) {
    return emitDgramDisconnectLines(expression.callee.object.path[0], expression.args, context)
  }

  if (isDgramSocketMethodCall(expression, 'send', context)) {
    return emitDgramSendLines(expression.callee.object.path[0], expression.args, context, deps)
  }

  const optionCall = emitDgramSocketOptionCallStatement(expression, context, deps)

  if (optionCall != null) {
    return optionCall
  }

  if (isDgramSocketMethodCall(expression, 'close', context)) {
    return emitDgramCloseLines(expression.callee.object.path[0], expression.args, context, deps)
  }

  if (isDgramSocketAnyMethodCall(expression, context)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_DGRAM_SOCKET',
        `socket.${expression.callee.property} is not supported by the current C dgram backend slice`,
        expression.callee.loc ?? expression.loc
      )
    )
    return []
  }

  return null
}

export function emitPreparedDgramAddressPortExpression(
  expression: AnyNode | null | undefined,
  context: CFunctionContext
): PreparedExpression | null {
  if (
    expression?.type !== 'MemberExpression' ||
    expression.property !== 'port' ||
    expression.object?.type !== 'Reference' ||
    expression.object.path.length !== 1 ||
    context.variables.get(expression.object.path[0]) !== 'dgram-address'
  ) {
    return null
  }

  return {
    lines: [],
    expression: expression.object.path[0] + '.port'
  }
}

export function collectDgramMessageHandlers(
  irPrograms: IrProgram[],
  context: CEmitContext
): Map<AnyNode, CDgramMessageHandler> {
  const handlers = new Map<AnyNode, CDgramMessageHandler>()
  const register = (expression: AnyNode | null | undefined) => {
    if (expression?.type !== 'ArrowFunctionExpression') {
      return
    }

    if (handlers.has(expression)) {
      return
    }

    handlers.set(expression, {
      name: `ccjs_dgram_message_handler_${handlers.size}`,
      expression
    })
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
      if (isDgramCreateSocketCall(expression, context)) {
        register(emitDgramCreateSocketMessageListener(expression))
      }

      if (
        expression.callee?.type === 'MemberExpression' &&
        expression.callee.property === 'on' &&
        expression.args[0]?.type === 'StringLiteral' &&
        expression.args[0].value === 'message'
      ) {
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

function emitDgramMessageHandlerStatement(
  statement: AnyNode | null | undefined,
  dgramContext: DgramMessageContext,
  context: CFunctionContext,
  deps: DgramLoweringDependencies
): string[] {
  if (statement == null) {
    return []
  }

  if (statement.type === 'BlockStatement') {
    return [
      '{',
      ...statement.body
        .flatMap((item) => emitDgramMessageHandlerStatement(item, dgramContext, context, deps))
        .map((line) => `  ${line}`),
      '}'
    ]
  }

  if (statement.type === 'VariableDeclaration') {
    const stringValue = emitDgramStaticStringValue(statement.init, dgramContext)

    if (stringValue == null) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_DGRAM_HANDLER',
          'dgram message listeners in the C backend currently support only static string local declarations',
          statement.loc
        )
      )
      return []
    }

    dgramContext.stringLocals.set(statement.name, stringValue)
    return []
  }

  if (statement.type === 'ExpressionStatement' && statement.expression?.type === 'CallExpression') {
    const call = emitDgramMessageHandlerSocketCallStatement(statement.expression, dgramContext, context, deps)

    if (call != null) {
      return call
    }
  }

  if (statement.type === 'ReturnStatement') {
    if (statement.argument?.type === 'CallExpression') {
      const call = emitDgramMessageHandlerSocketCallStatement(statement.argument, dgramContext, context, deps)

      if (call != null) {
        return [...call, 'return CCJS_OK;']
      }
    }

    return ['return CCJS_OK;']
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_DGRAM_HANDLER',
      'this dgram message listener statement is not supported by the current C backend slice',
      statement.loc
    )
  )
  return []
}

function emitDgramMessageHandlerSocketCallStatement(
  expression: AnyNode,
  dgramContext: DgramMessageContext,
  context: CFunctionContext,
  deps: DgramLoweringDependencies
): string[] | null {
  if (expression.callee?.type !== 'MemberExpression' || expression.callee.object?.type !== 'Reference') {
    return null
  }

  if (expression.callee.property === 'send') {
    return emitDgramSendLines('ccjs_socket', expression.args, context, deps, dgramContext)
  }

  if (expression.callee.property === 'close') {
    return ['ccjs_dgram_close(ccjs_socket);']
  }

  return null
}

function emitDgramSocketCreateLines(
  expression: AnyNode,
  socketName: string,
  context: CFunctionContext,
  deps: DgramLoweringDependencies,
  options: { declare?: boolean } = {}
): string[] {
  emitDgramSocketTypeDiagnostics(expression.args[0], context, deps)

  const listener = emitDgramCreateSocketMessageListener(expression)
  const wrapper = listener == null ? undefined : context.dgramMessageHandlers.get(listener)

  if (listener != null && (listener.type !== 'ArrowFunctionExpression' || wrapper == null)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_DGRAM_SOCKET',
        'dgram.createSocket in the C backend currently requires an inline message listener callback',
        listener.loc
      )
    )
  }

  const lines = options.declare === false ? [] : [`ccjs_dgram_socket* ${socketName} = 0;`]

  lines.push(
    emitStatusCheck(
      `ccjs_dgram_socket_new(${emitEventLoopReference(context)}, ${wrapper?.name ?? '0'}, 0, &${socketName})`,
      context
    )
  )

  if (wrapper != null) {
    context.dgramMessageSockets.add(socketName)
  }

  if (deps.staticObjectBooleanPropertyValue(expression.args[0], 'reuseAddr') === true) {
    context.dgramReuseAddrSockets.add(socketName)
  }

  return lines
}

function emitDgramBindLines(
  socketName: string,
  args: AnyNode[],
  context: CFunctionContext,
  deps: DgramLoweringDependencies
): string[] {
  const options = args[0]?.type === 'ObjectLiteral' ? args[0] : null
  const objectCallback = options == null ? null : args[1]
  const firstIsCallback = args[0]?.type === 'ArrowFunctionExpression'
  const portArg =
    options == null ? (firstIsCallback ? null : args[0]) : deps.findObjectLiteralPropertyValue(options, 'port')
  const hostArg =
    options == null
      ? args[1]?.type === 'ArrowFunctionExpression'
        ? null
        : args[1]
      : deps.findObjectLiteralPropertyValue(options, 'address')
  const callback =
    options == null
      ? firstIsCallback
        ? args[0]
        : args[1]?.type === 'ArrowFunctionExpression'
          ? args[1]
          : args[2]
      : objectCallback

  if (args.length > (options == null ? 3 : 2)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_DGRAM_SOCKET',
        'socket.bind in the C backend currently supports port, optional address and optional callback',
        args.at(-1)?.loc
      )
    )
  }

  const port = portArg == null ? { lines: [], expression: '0' } : emitDgramPortExpression(portArg, null, context, deps)
  const host = emitDgramHostExpression(hostArg, null, context, deps)
  const flags = context.dgramReuseAddrSockets.has(socketName) ? 'CCJS_DGRAM_BIND_REUSEADDR' : '0'
  const lines = [
    ...port.lines,
    emitStatusCheck(`ccjs_dgram_bind_flags(${socketName}, ${host}, (int)(${port.expression}), ${flags})`, context)
  ]

  context.dgramBoundSockets.add(socketName)
  lines.push(...emitDgramMaybeRecvStartLines(socketName, context))
  lines.push(...emitDgramZeroArgCallbackLines(callback, context, deps))

  return lines
}

function emitDgramOnLines(socketName: string, args: AnyNode[], context: CFunctionContext): string[] {
  if (args[0]?.type !== 'StringLiteral' || args[0].value !== 'message') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_DGRAM_SOCKET',
        "socket.on in the C backend currently supports only the 'message' event",
        args[0]?.loc
      )
    )
    return []
  }

  const listener = args[1]
  const wrapper = context.dgramMessageHandlers.get(listener)

  if (listener?.type !== 'ArrowFunctionExpression' || wrapper == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_DGRAM_SOCKET',
        "socket.on('message') in the C backend currently requires an inline message listener",
        listener?.loc
      )
    )
    return []
  }

  context.dgramMessageSockets.add(socketName)

  return [
    emitStatusCheck(`ccjs_dgram_socket_on_message(${socketName}, ${wrapper.name}, 0)`, context),
    ...emitDgramMaybeRecvStartLines(socketName, context)
  ]
}

function emitDgramConnectLines(
  socketName: string,
  args: AnyNode[],
  context: CFunctionContext,
  deps: DgramLoweringDependencies
): string[] {
  if (args.length < 1) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_DGRAM_SOCKET',
        'socket.connect in the C backend currently requires a port argument',
        args[0]?.loc
      )
    )
    return []
  }

  const hostArg = args[1]?.type === 'ArrowFunctionExpression' ? null : args[1]
  const callback = args[1]?.type === 'ArrowFunctionExpression' ? args[1] : args[2]
  const port = emitDgramPortExpression(args[0], null, context, deps)
  const host = emitDgramHostExpression(hostArg, null, context, deps)

  if (args.length > 3) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_DGRAM_SOCKET',
        'socket.connect in the C backend currently supports port, optional address and optional callback',
        args[3]?.loc
      )
    )
  }

  return [
    ...port.lines,
    emitStatusCheck(`ccjs_dgram_socket_connect(${socketName}, ${host}, (int)(${port.expression}))`, context),
    ...emitDgramZeroArgCallbackLines(callback, context, deps)
  ]
}

function emitDgramDisconnectLines(socketName: string, args: AnyNode[], context: CFunctionContext): string[] {
  if (args.length > 0) {
    context.diagnostics.push(
      diagnostic('CCJS_DGRAM_SOCKET', 'socket.disconnect in the C backend does not take arguments', args[0]?.loc)
    )
  }

  return [emitStatusCheck(`ccjs_dgram_socket_disconnect(${socketName})`, context)]
}

function emitDgramSocketOptionCallStatement(
  expression: AnyNode,
  context: CFunctionContext,
  deps: DgramLoweringDependencies
): string[] | null {
  if (
    expression?.type !== 'CallExpression' ||
    expression.callee?.type !== 'MemberExpression' ||
    expression.callee.object?.type !== 'Reference' ||
    expression.callee.object.path.length !== 1 ||
    context.variables.get(expression.callee.object.path[0]) !== 'dgram-socket'
  ) {
    return null
  }

  const socketName = expression.callee.object.path[0]
  const method = expression.callee.property

  if (method === 'setBroadcast') {
    const enabled = deps.emitPreparedNumberExpression(expression.args[0], context)

    return [
      ...enabled.lines,
      emitStatusCheck(`ccjs_dgram_set_broadcast(${socketName}, ${enabled.expression} ? 1 : 0)`, context)
    ]
  }

  if (method === 'setTTL') {
    const ttl = deps.emitPreparedNumberExpression(expression.args[0], context)

    return [...ttl.lines, emitStatusCheck(`ccjs_dgram_set_ttl(${socketName}, (int)(${ttl.expression}))`, context)]
  }

  if (method === 'setSendBufferSize' || method === 'setRecvBufferSize') {
    const runtime =
      method === 'setSendBufferSize' ? 'ccjs_dgram_set_send_buffer_size' : 'ccjs_dgram_set_recv_buffer_size'
    const size = deps.emitPreparedNumberExpression(expression.args[0], context)

    return [...size.lines, emitStatusCheck(`${runtime}(${socketName}, (int)(${size.expression}))`, context)]
  }

  if (method === 'ref' || method === 'unref') {
    if (expression.args.length > 0) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_DGRAM_SOCKET',
          `socket.${method} in the C backend does not take arguments`,
          expression.args[0]?.loc
        )
      )
    }

    return [emitStatusCheck(`${method === 'ref' ? 'ccjs_dgram_ref' : 'ccjs_dgram_unref'}(${socketName})`, context)]
  }

  return null
}

function emitDgramSendLines(
  socketName: string,
  args: AnyNode[],
  context: CFunctionContext,
  deps: DgramLoweringDependencies,
  dgramContext: DgramMessageContext | null = null
): string[] {
  const callback = args.at(-1)?.type === 'ArrowFunctionExpression' ? args.at(-1) : null
  const callbackOffset = callback == null ? 0 : 1

  if (args.length - callbackOffset === 1) {
    const body = emitDgramBytesOperand(args[0], dgramContext, context, deps)

    return [
      ...body.lines,
      ...emitDgramStatusCheck(
        `ccjs_dgram_send_connected(${socketName}, ${body.bytes}, ${body.length})`,
        context,
        dgramContext
      ),
      ...emitDgramZeroArgCallbackLines(callback, context, deps)
    ]
  }

  if (args.length < 3) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_DGRAM_SOCKET',
        'socket.send in the C backend currently requires message, port and address arguments, or a connected socket message form',
        args[0]?.loc
      )
    )
    return []
  }

  const hasOffsetLength = args.length - callbackOffset >= 5
  const body = emitDgramBytesOperand(args[0], dgramContext, context, deps)
  const portArg = hasOffsetLength ? args[3] : args[1]
  const hostArg = hasOffsetLength ? args[4] : args[2]

  if (hasOffsetLength) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_DGRAM_SOCKET',
        'socket.send offset/length arguments are not supported by the current C backend slice yet',
        args[1]?.loc
      )
    )
  }

  const port = emitDgramPortExpression(portArg, dgramContext, context, deps)
  const host = emitDgramHostExpression(hostArg, dgramContext, context, deps)

  return [
    ...body.lines,
    ...port.lines,
    ...emitDgramStatusCheck(
      `ccjs_dgram_send(${socketName}, ${body.bytes}, ${body.length}, ${host}, (int)(${port.expression}))`,
      context,
      dgramContext
    ),
    ...emitDgramZeroArgCallbackLines(callback, context, deps)
  ]
}

function emitDgramCloseLines(
  socketName: string,
  args: AnyNode[],
  context: CFunctionContext,
  deps: DgramLoweringDependencies
): string[] {
  if (args.length > 1) {
    context.diagnostics.push(
      diagnostic('CCJS_DGRAM_SOCKET', 'socket.close in the C backend supports only an optional callback', args[1]?.loc)
    )
  }

  return [`ccjs_dgram_close(${socketName});`, ...emitDgramZeroArgCallbackLines(args[0], context, deps)]
}

function emitDgramMaybeRecvStartLines(socketName: string, context: CFunctionContext): string[] {
  if (!context.dgramBoundSockets.has(socketName) || !context.dgramMessageSockets.has(socketName)) {
    return []
  }

  return [emitStatusCheck(`ccjs_dgram_recv_start(${socketName})`, context)]
}

function emitDgramStatusCheck(
  call: string,
  context: CFunctionContext,
  dgramContext: DgramMessageContext | null
): string[] {
  if (dgramContext == null) {
    return [emitStatusCheck(call, context)]
  }

  const status = nextCName(context, 'ccjs_dgram_status')

  return ['{', `  ccjs_status ${status} = ${call};`, `  if (${status} != CCJS_OK) return ${status};`, '}']
}

function emitDgramBytesOperand(
  expression: AnyNode,
  dgramContext: DgramMessageContext | null,
  context: CFunctionContext,
  deps: DgramLoweringDependencies
): PreparedStringBytesOperand {
  if (
    dgramContext?.messageName != null &&
    expression?.type === 'Reference' &&
    expression.path.length === 1 &&
    expression.path[0] === dgramContext.messageName
  ) {
    return {
      lines: [],
      bytes: 'ccjs_bytes',
      length: 'ccjs_len'
    }
  }

  const staticValue = emitDgramStaticStringValue(expression, dgramContext)

  if (staticValue != null) {
    return {
      lines: [],
      bytes: cStringLiteral(staticValue),
      length: `${utf8ByteLength(staticValue)}`
    }
  }

  return deps.emitPreparedStringBytesOperand(expression, context, 'ccjs_dgram_string')
}

function emitDgramPortExpression(
  expression: AnyNode,
  dgramContext: DgramMessageContext | null,
  context: CFunctionContext,
  deps: DgramLoweringDependencies
): PreparedExpression {
  const rinfo = resolveDgramRinfoMember(expression, dgramContext)

  if (rinfo === 'port') {
    return {
      lines: [],
      expression: 'ccjs_port'
    }
  }

  const addressPort = emitPreparedDgramAddressPortExpression(expression, context)

  if (addressPort != null) {
    return addressPort
  }

  return deps.emitPreparedNumberExpression(expression, context)
}

function emitDgramHostExpression(
  expression: AnyNode | null | undefined,
  dgramContext: DgramMessageContext | null,
  context: CFunctionContext,
  deps: DgramLoweringDependencies
): string {
  if (expression == null) {
    return '0'
  }

  const rinfo = resolveDgramRinfoMember(expression, dgramContext)

  if (rinfo === 'address') {
    return 'ccjs_host'
  }

  const addressMember = resolveDgramAddressStringMember(expression, context)

  if (addressMember != null) {
    return addressMember
  }

  if (expression.type === 'StringLiteral') {
    return cStringLiteral(expression.value)
  }

  if (expression.type === 'TemplateLiteral' && !expression.raw.includes('${')) {
    return cStringLiteral(expression.raw.slice(1, -1))
  }

  if (
    expression.type === 'Reference' &&
    expression.path.length === 1 &&
    context.variables.get(expression.path[0]) === 'string'
  ) {
    return deps.emitReference(expression, context)
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_DGRAM_SOCKET',
      'socket host/address arguments in the C backend currently must be static strings or rinfo.address',
      expression.loc
    )
  )
  return '0'
}

function resolveDgramAddressStringMember(expression: AnyNode, context: CFunctionContext): string | null {
  if (
    expression?.type !== 'MemberExpression' ||
    !['address', 'family'].includes(expression.property) ||
    expression.object?.type !== 'Reference' ||
    expression.object.path.length !== 1 ||
    context.variables.get(expression.object.path[0]) !== 'dgram-address'
  ) {
    return null
  }

  return expression.property === 'family'
    ? `${expression.object.path[0]}.family`
    : `${expression.object.path[0]}.address`
}

function resolveDgramRinfoMember(
  expression: AnyNode | null | undefined,
  dgramContext: DgramMessageContext | null
): string | null {
  if (
    dgramContext?.rinfoName == null ||
    expression?.type !== 'MemberExpression' ||
    expression.object?.type !== 'Reference' ||
    expression.object.path.length !== 1 ||
    expression.object.path[0] !== dgramContext.rinfoName
  ) {
    return null
  }

  return ['address', 'family', 'port', 'size'].includes(expression.property) ? expression.property : null
}

function emitDgramStaticStringValue(
  expression: AnyNode | null | undefined,
  dgramContext: DgramMessageContext | null
): string | null {
  if (expression?.type === 'StringLiteral') {
    return expression.value
  }

  if (expression?.type === 'TemplateLiteral' && !expression.raw.includes('${')) {
    return expression.raw.slice(1, -1)
  }

  if (expression?.type === 'Reference' && expression.path.length === 1) {
    return dgramContext?.stringLocals?.get(expression.path[0]) ?? null
  }

  return null
}

function emitDgramZeroArgCallbackLines(
  callback: AnyNode | null | undefined,
  context: CFunctionContext,
  deps: DgramLoweringDependencies
): string[] {
  if (callback == null) {
    return []
  }

  if (callback.type !== 'ArrowFunctionExpression' || callback.params.length !== 0 || callback.async) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_DGRAM_SOCKET',
        'dgram socket callbacks in the C backend currently require a synchronous zero-argument arrow function',
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

function isDgramSocketMethodCall(expression: AnyNode, method: string, context: CFunctionContext): boolean {
  return isDgramSocketAnyMethodCall(expression, context) && expression.callee.property === method
}

function isDgramSocketAnyMethodCall(expression: AnyNode, context: CFunctionContext): boolean {
  return (
    expression?.type === 'CallExpression' &&
    expression.callee?.type === 'MemberExpression' &&
    expression.callee.object?.type === 'Reference' &&
    expression.callee.object.path.length === 1 &&
    context.variables.get(expression.callee.object.path[0]) === 'dgram-socket'
  )
}

function isDgramAddressCall(expression: AnyNode | null | undefined, context: CFunctionContext): boolean {
  return (
    expression?.type === 'CallExpression' &&
    expression.callee?.type === 'MemberExpression' &&
    (expression.callee.property === 'address' || expression.callee.property === 'remoteAddress') &&
    expression.callee.object?.type === 'Reference' &&
    expression.callee.object.path.length === 1 &&
    context.variables.get(expression.callee.object.path[0]) === 'dgram-socket'
  )
}

function isDgramCreateSocketCall(expression: AnyNode | null | undefined, context: CEmitContext): boolean {
  if (expression?.type !== 'CallExpression') {
    return false
  }

  if (
    expression.callee?.type === 'Reference' &&
    expression.callee.path.length === 1 &&
    context.dgramCreateSocketNames.has(expression.callee.path[0])
  ) {
    return true
  }

  return (
    expression.callee?.type === 'MemberExpression' &&
    expression.callee.property === 'createSocket' &&
    expression.callee.object?.type === 'Reference' &&
    expression.callee.object.path.length === 1 &&
    context.dgramImportNames.has(expression.callee.object.path[0])
  )
}

function emitDgramCreateSocketMessageListener(expression: AnyNode): AnyNode | null {
  if (expression.args[0]?.type === 'ArrowFunctionExpression') {
    return expression.args[0]
  }

  if (expression.args[1]?.type === 'ArrowFunctionExpression') {
    return expression.args[1]
  }

  return null
}

function emitDgramSocketTypeDiagnostics(
  expression: AnyNode | null | undefined,
  context: CFunctionContext,
  deps: DgramLoweringDependencies
): void {
  const typeValue =
    expression?.type === 'StringLiteral'
      ? expression.value
      : expression?.type === 'ObjectLiteral'
        ? deps.staticObjectStringPropertyValue(expression, 'type')
        : null

  if (typeValue === 'udp4') {
    return
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_DGRAM_SOCKET',
      "dgram.createSocket in the C backend currently supports only the 'udp4' socket type",
      expression?.loc
    )
  )
}
