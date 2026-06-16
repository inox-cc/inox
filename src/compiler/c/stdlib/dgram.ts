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
import type { CEmitContext, CFunctionContext } from '../context.ts'
import type { AnyNode, IrProgram, SourceLocation } from '../../types.ts'
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

type DgramSocketCreateOptions = {
  declare: boolean | undefined
}

export type DgramLoweringDependencies = {
  emitPreparedNumberExpression: (expression: AnyNode, context: CFunctionContext) => PreparedExpression
  emitPreparedStringBytesOperand: (expression: AnyNode, context: CFunctionContext, tempPrefix: string) => PreparedStringBytesOperand
  emitReference: (expression: AnyNode, context: CFunctionContext) => string
  emitStatementList: (body: AnyNode[], context: CFunctionContext) => string[]
  findObjectLiteralPropertyValue: (expression: AnyNode, key: string) => AnyNode | null
  staticObjectBooleanPropertyValue: (expression: AnyNode, key: string) => boolean | null
  staticObjectStringPropertyValue: (expression: AnyNode, key: string) => string | null
}

function dgramNodeLoc(node: AnyNode | null | undefined): SourceLocation | null {
  if (node == null) {
    return null
  }

  return node.loc
}

function lastDgramArgument(args: AnyNode[]): AnyNode | null {
  if (args.length === 0) {
    return null
  }

  return args[args.length - 1]
}

function pushDgramLines(target: string[], lines: string[]): void {
  for (const line of lines) {
    target.push(line)
  }
}

function pushDgramNodes(target: AnyNode[], nodes: AnyNode[]): void {
  for (const node of nodes) {
    target.push(node)
  }
}

function pushIndentedDgramLines(target: string[], lines: string[]): void {
  for (const line of lines) {
    target.push('  ' + line)
  }
}

export function emitDgramMessageHandlerHead(wrapper: CDgramMessageHandler): string {
  return `static ccjs_status ${wrapper.name}(void* user, ccjs_dgram_socket* ccjs_socket, const char* ccjs_bytes, size_t ccjs_len, const char* ccjs_host, int ccjs_port)`
}

export function emitDgramMessageHandlerDeclaration(
  wrapper: CDgramMessageHandler,
  baseContext: CEmitContext,
  deps: DgramLoweringDependencies
): string[] {
  const context = createFunctionContext(baseContext, 'void', false)
  const expression = wrapper.expression
  const firstParam = expression.params[0]
  const secondParam = expression.params[1]
  let messageName: string | null = null
  let rinfoName: string | null = null

  if (firstParam != null) {
    messageName = firstParam.name
  }

  if (secondParam != null) {
    rinfoName = secondParam.name
  }

  const dgramContext: DgramMessageContext = {
    messageName: messageName,
    rinfoName: rinfoName,
    stringLocals: new Map()
  }
  context.statusReturn = true

  if (messageName != null) {
    context.variables.set(messageName, 'string')
  }

  if (rinfoName != null) {
    context.variables.set(rinfoName, 'dgram-address')
  }

  const body: AnyNode[] = []

  if (expression.expressionBody) {
    body.push({
      type: 'ExpressionStatement',
      expression: expression.body,
      loc: expression.loc
    })
  } else {
    pushDgramNodes(body, expression.body)
  }

  const lines = [`${emitDgramMessageHandlerHead(wrapper)} {`, '  (void)user;']

  if (messageName == null) {
    lines.push('  (void)ccjs_bytes;')
    lines.push('  (void)ccjs_len;')
  }

  if (rinfoName == null) {
    lines.push('  (void)ccjs_host;')
    lines.push('  (void)ccjs_port;')
  }

  for (const statement of body) {
    pushIndentedDgramLines(lines, emitDgramMessageHandlerStatement(statement, dgramContext, context, deps))
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

  return emitDgramSocketCreateLines(statement.init, statement.name, context, deps, null)
}

export function emitDgramAddressVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[] | null {
  if (!isDgramAddressCall(statement.init, context)) {
    return null
  }

  const socketName = statement.init.callee.object.path[0]
  let runtime = 'ccjs_dgram_socket_address'

  if (statement.init.callee.property === 'remoteAddress') {
    runtime = 'ccjs_dgram_socket_remote_address'
  }

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
  const init = statement.init

  if (
    init == null ||
    init.type !== 'CallExpression' ||
    init.callee == null ||
    init.callee.type !== 'MemberExpression' ||
    init.callee.object == null ||
    init.callee.object.type !== 'Reference' ||
    init.callee.object.path.length !== 1 ||
    context.variables.get(init.callee.object.path[0]) !== 'dgram-socket'
  ) {
    return null
  }

  const socketName = init.callee.object.path[0]
  const method = init.callee.property
  let runtime: string | null = null

  if (method === 'getSendBufferSize') {
    runtime = 'ccjs_dgram_get_send_buffer_size'
  } else if (method === 'getRecvBufferSize') {
    runtime = 'ccjs_dgram_get_recv_buffer_size'
  }

  if (runtime == null) {
    return null
  }

  context.variables.set(statement.name, 'number')

  const size = nextCName(context, 'ccjs_dgram_buffer_size')
  const statusCall = `${runtime}(${socketName}, &${size})`

  return [
    `double ${statement.name} = 0;`,
    '{',
    `  int ${size} = 0;`,
    `  ${emitStatusCheck(statusCall, context)}`,
    `  ${statement.name} = (double)${size};`,
    '}'
  ]
}

export function emitDgramSocketCallStatement(
  expression: AnyNode,
  context: CFunctionContext,
  deps: DgramLoweringDependencies
): string[] | null {
  const callee = expression.callee

  if (
    callee != null &&
    callee.type === 'MemberExpression' &&
    callee.property === 'bind' &&
    isDgramCreateSocketCall(callee.object, context)
  ) {
    const socketName = nextCName(context, 'ccjs_dgram_socket')
    const lines = [`ccjs_dgram_socket* ${socketName} = 0;`]
    registerEventLoop(context)

    pushDgramLines(
      lines,
      emitDgramSocketCreateLines(callee.object, socketName, context, deps, {
        declare: false
      })
    )
    pushDgramLines(lines, emitDgramBindLines(socketName, expression.args, context, deps))

    return lines
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
    return emitDgramSendLines(expression.callee.object.path[0], expression.args, context, deps, null)
  }

  const optionCall = emitDgramSocketOptionCallStatement(expression, context, deps)

  if (optionCall != null) {
    return optionCall
  }

  if (isDgramSocketMethodCall(expression, 'close', context)) {
    return emitDgramCloseLines(expression.callee.object.path[0], expression.args, context, deps)
  }

  if (isDgramSocketAnyMethodCall(expression, context)) {
    let loc = dgramNodeLoc(expression)
    let property = 'unknown'

    if (callee != null) {
      property = callee.property

      if (callee.loc != null) {
        loc = callee.loc
      }
    }

    context.diagnostics.push(
      diagnostic(
        'CCJS_DGRAM_SOCKET',
        `socket.${property} is not supported by the current C dgram backend slice`,
        loc
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
  if (expression == null) {
    return null
  }

  if (
    expression.type !== 'MemberExpression' ||
    expression.property !== 'port' ||
    expression.object == null ||
    expression.object.type !== 'Reference' ||
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
  const handlers: Map<AnyNode, CDgramMessageHandler> = new Map()

  for (const ir of irPrograms) {
    for (const item of collectIrTopLevelNodeEntries(ir)) {
      if (item.kind === 'function') {
        for (const statement of item.node.body) {
          visitDgramMessageHandlerStatement(handlers, context, statement)
        }
      } else if (item.kind === 'statement') {
        visitDgramMessageHandlerStatement(handlers, context, item.node)
      }
    }
  }

  return handlers
}

function registerDgramMessageHandler(
  handlers: Map<AnyNode, CDgramMessageHandler>,
  expression: AnyNode | null | undefined
): void {
  if (expression == null || expression.type !== 'ArrowFunctionExpression') {
    return
  }

  if (handlers.has(expression)) {
    return
  }

  handlers.set(expression, {
    name: `ccjs_dgram_message_handler_${handlers.size}`,
    expression: expression
  })
}

function visitDgramMessageHandlerStatement(
  handlers: Map<AnyNode, CDgramMessageHandler>,
  context: CEmitContext,
  statement: AnyNode | null | undefined
): void {
  if (statement == null) {
    return
  }

  if (statement.type === 'VariableDeclaration') {
    visitDgramMessageHandlerExpression(handlers, context, statement.init)
    return
  }

  if (statement.type === 'ExpressionStatement') {
    visitDgramMessageHandlerExpression(handlers, context, statement.expression)
    return
  }

  if (statement.type === 'ReturnStatement' || statement.type === 'ThrowStatement') {
    visitDgramMessageHandlerExpression(handlers, context, statement.argument)
    return
  }

  if (statement.type === 'BlockStatement') {
    for (const item of statement.body) {
      visitDgramMessageHandlerStatement(handlers, context, item)
    }
    return
  }

  if (statement.type === 'IfStatement') {
    visitDgramMessageHandlerExpression(handlers, context, statement.condition)
    visitDgramMessageHandlerStatement(handlers, context, statement.consequent)
    visitDgramMessageHandlerStatement(handlers, context, statement.alternate)
    return
  }

  if (statement.type === 'WhileStatement') {
    visitDgramMessageHandlerExpression(handlers, context, statement.condition)
    visitDgramMessageHandlerStatement(handlers, context, statement.body)
    return
  }

  if (statement.type === 'ForStatement') {
    if (statement.init != null && statement.init.type === 'VariableDeclaration') {
      visitDgramMessageHandlerStatement(handlers, context, statement.init)
    } else {
      visitDgramMessageHandlerExpression(handlers, context, statement.init)
    }

    visitDgramMessageHandlerExpression(handlers, context, statement.test)
    visitDgramMessageHandlerExpression(handlers, context, statement.update)
    visitDgramMessageHandlerStatement(handlers, context, statement.body)
    return
  }

  if (statement.type === 'ForOfStatement') {
    visitDgramMessageHandlerExpression(handlers, context, statement.iterable)
    visitDgramMessageHandlerStatement(handlers, context, statement.body)
    return
  }

  if (statement.type === 'SwitchStatement') {
    visitDgramMessageHandlerExpression(handlers, context, statement.discriminant)
    for (const item of statement.cases) {
      visitDgramMessageHandlerExpression(handlers, context, item.test)
      for (const consequent of item.consequent) {
        visitDgramMessageHandlerStatement(handlers, context, consequent)
      }
    }
    return
  }

  if (statement.type === 'TryStatement') {
    const handler = statement.handler
    visitDgramMessageHandlerStatement(handlers, context, statement.block)
    if (handler != null) {
      visitDgramMessageHandlerStatement(handlers, context, handler.body)
    }
    visitDgramMessageHandlerStatement(handlers, context, statement.finalizer)
  }
}

function visitDgramMessageHandlerExpression(
  handlers: Map<AnyNode, CDgramMessageHandler>,
  context: CEmitContext,
  expression: AnyNode | null | undefined
): void {
  if (expression == null) {
    return
  }

  if (expression.type === 'CallExpression') {
    const callee = expression.callee

    if (isDgramCreateSocketCall(expression, context)) {
      registerDgramMessageHandler(handlers, emitDgramCreateSocketMessageListener(expression))
    }

    if (
      callee != null &&
      callee.type === 'MemberExpression' &&
      callee.property === 'on' &&
      expression.args[0] != null &&
      expression.args[0].type === 'StringLiteral' &&
      expression.args[0].value === 'message'
    ) {
      registerDgramMessageHandler(handlers, expression.args[1])
    }

    visitDgramMessageHandlerExpression(handlers, context, callee)
    for (const arg of expression.args) {
      visitDgramMessageHandlerExpression(handlers, context, arg)
    }
    return
  }

  if (expression.type === 'OptionalCallExpression' || expression.type === 'NewExpression') {
    visitDgramMessageHandlerExpression(handlers, context, expression.callee)
    for (const arg of expression.args) {
      visitDgramMessageHandlerExpression(handlers, context, arg)
    }
    return
  }

  if (expression.type === 'ArrowFunctionExpression') {
    if (expression.expressionBody) {
      visitDgramMessageHandlerExpression(handlers, context, expression.body)
    } else {
      for (const statement of expression.body) {
        visitDgramMessageHandlerStatement(handlers, context, statement)
      }
    }

    return
  }

  if (expression.type === 'AssignmentExpression') {
    visitDgramMessageHandlerExpression(handlers, context, expression.target)
    visitDgramMessageHandlerExpression(handlers, context, expression.value)
    return
  }

  if (expression.type === 'BinaryExpression') {
    visitDgramMessageHandlerExpression(handlers, context, expression.left)
    visitDgramMessageHandlerExpression(handlers, context, expression.right)
    return
  }

  if (
    expression.type === 'UnaryExpression' ||
    expression.type === 'UpdateExpression' ||
    expression.type === 'AwaitExpression'
  ) {
    visitDgramMessageHandlerExpression(handlers, context, expression.argument)
    return
  }

  if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
    visitDgramMessageHandlerExpression(handlers, context, expression.object)
    return
  }

  if (expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression') {
    visitDgramMessageHandlerExpression(handlers, context, expression.object)
    visitDgramMessageHandlerExpression(handlers, context, expression.index)
    return
  }

  if (expression.type === 'ArrayLiteral') {
    for (const element of expression.elements) {
      visitDgramMessageHandlerExpression(handlers, context, element)
    }
    return
  }

  if (expression.type === 'ObjectLiteral') {
    for (const property of expression.properties) {
      visitDgramMessageHandlerExpression(handlers, context, property.value)
    }
  }
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
    const lines = ['{']

    for (const item of statement.body) {
      pushIndentedDgramLines(lines, emitDgramMessageHandlerStatement(item, dgramContext, context, deps))
    }

    lines.push('}')
    return lines
  }

  if (statement.type === 'VariableDeclaration') {
    const stringValue = emitDgramStaticStringValue(statement.init, dgramContext)

    if (stringValue != null) {
      dgramContext.stringLocals.set(statement.name, stringValue)
      return []
    }

    context.diagnostics.push(
      diagnostic(
        'CCJS_DGRAM_HANDLER',
        'dgram message listeners in the C backend currently support only static string local declarations',
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
    const call = emitDgramMessageHandlerSocketCallStatement(statement.expression, dgramContext, context, deps)

    if (call != null) {
      return call
    }
  }

  if (statement.type === 'ReturnStatement') {
    if (statement.argument != null && statement.argument.type === 'CallExpression') {
      const call = emitDgramMessageHandlerSocketCallStatement(statement.argument, dgramContext, context, deps)

      if (call != null) {
        const lines: string[] = []

        pushDgramLines(lines, call)
        lines.push('return CCJS_OK;')

        return lines
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
  if (
    expression.callee == null ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.object == null ||
    expression.callee.object.type !== 'Reference'
  ) {
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
  options: DgramSocketCreateOptions | null
): string[] {
  emitDgramSocketTypeDiagnostics(expression.args[0], context, deps)

  const listener = emitDgramCreateSocketMessageListener(expression)
  let wrapper: CDgramMessageHandler | null = null

  if (listener != null) {
    const registeredWrapper = context.dgramMessageHandlers.get(listener)

    if (registeredWrapper != null) {
      wrapper = registeredWrapper
    }
  }

  if (listener != null && (listener.type !== 'ArrowFunctionExpression' || wrapper == null)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_DGRAM_SOCKET',
        'dgram.createSocket in the C backend currently requires an inline message listener callback',
        listener.loc
      )
    )
  }

  const lines: string[] = []

  if (options == null || options.declare !== false) {
    lines.push(`ccjs_dgram_socket* ${socketName} = 0;`)
  }

  let wrapperName = '0'

  if (wrapper != null) {
    wrapperName = wrapper.name
  }

  lines.push(
    emitStatusCheck(
      `ccjs_dgram_socket_new(${emitEventLoopReference(context)}, ${wrapperName}, 0, &${socketName})`,
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
  let firstArg: AnyNode | null = null
  let secondArg: AnyNode | null = null

  if (args.length > 0) {
    firstArg = args[0]
  }

  if (args.length > 1) {
    secondArg = args[1]
  }

  let options: AnyNode | null = null

  if (firstArg != null && firstArg.type === 'ObjectLiteral') {
    options = firstArg
  }

  let firstIsCallback = false

  if (firstArg != null && firstArg.type === 'ArrowFunctionExpression') {
    firstIsCallback = true
  }

  let portArg: AnyNode | null | undefined = null
  let hostArg: AnyNode | null | undefined = null
  let callback: AnyNode | null | undefined = null

  if (options == null) {
    if (!firstIsCallback) {
      portArg = firstArg
    }

    if (secondArg != null && secondArg.type === 'ArrowFunctionExpression') {
      callback = secondArg
    } else {
      hostArg = secondArg
      callback = args[2]
    }

    if (firstIsCallback) {
      callback = firstArg
    }
  } else {
    portArg = deps.findObjectLiteralPropertyValue(options, 'port')
    hostArg = deps.findObjectLiteralPropertyValue(options, 'address')
    callback = secondArg
  }

  let maxArgCount = 3

  if (options != null) {
    maxArgCount = 2
  }

  if (args.length > maxArgCount) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_DGRAM_SOCKET',
        'socket.bind in the C backend currently supports port, optional address and optional callback',
        dgramNodeLoc(lastDgramArgument(args))
      )
    )
  }

  let port: PreparedExpression = {
    lines: [],
    expression: '0'
  }

  if (portArg != null) {
    port = emitDgramPortExpression(portArg, null, context, deps)
  }

  const host = emitDgramHostExpression(hostArg, null, context, deps)
  let flags = '0'

  if (context.dgramReuseAddrSockets.has(socketName)) {
    flags = 'CCJS_DGRAM_BIND_REUSEADDR'
  }

  const lines: string[] = []

  pushDgramLines(lines, port.lines)
  lines.push(emitStatusCheck(`ccjs_dgram_bind_flags(${socketName}, ${host}, (int)(${port.expression}), ${flags})`, context))

  context.dgramBoundSockets.add(socketName)
  pushDgramLines(lines, emitDgramMaybeRecvStartLines(socketName, context))
  pushDgramLines(lines, emitDgramZeroArgCallbackLines(callback, context, deps))

  return lines
}

function emitDgramOnLines(socketName: string, args: AnyNode[], context: CFunctionContext): string[] {
  let eventArg: AnyNode | null = null

  if (args.length > 0) {
    eventArg = args[0]
  }

  if (eventArg == null || eventArg.type !== 'StringLiteral' || eventArg.value !== 'message') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_DGRAM_SOCKET',
        "socket.on in the C backend currently supports only the 'message' event",
        dgramNodeLoc(eventArg)
      )
    )
    return []
  }

  let listener: AnyNode | null = null
  let wrapper: CDgramMessageHandler | null = null

  if (args.length > 1) {
    listener = args[1]
  }

  if (listener != null && context.dgramMessageHandlers.has(listener)) {
    const registeredWrapper = context.dgramMessageHandlers.get(listener)

    if (registeredWrapper != null) {
      wrapper = registeredWrapper
    }
  }

  if (listener == null || listener.type !== 'ArrowFunctionExpression' || wrapper == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_DGRAM_SOCKET',
        "socket.on('message') in the C backend currently requires an inline message listener",
        dgramNodeLoc(listener)
      )
    )
    return []
  }

  context.dgramMessageSockets.add(socketName)

  const lines = [emitStatusCheck(`ccjs_dgram_socket_on_message(${socketName}, ${wrapper.name}, 0)`, context)]

  pushDgramLines(lines, emitDgramMaybeRecvStartLines(socketName, context))

  return lines
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
        dgramNodeLoc(args[0])
      )
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

  const port = emitDgramPortExpression(args[0], null, context, deps)
  const host = emitDgramHostExpression(hostArg, null, context, deps)

  if (args.length > 3) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_DGRAM_SOCKET',
        'socket.connect in the C backend currently supports port, optional address and optional callback',
        dgramNodeLoc(args[3])
      )
    )
  }

  const lines: string[] = []

  pushDgramLines(lines, port.lines)
  lines.push(emitStatusCheck(`ccjs_dgram_socket_connect(${socketName}, ${host}, (int)(${port.expression}))`, context))
  pushDgramLines(lines, emitDgramZeroArgCallbackLines(callback, context, deps))

  return lines
}

function emitDgramDisconnectLines(socketName: string, args: AnyNode[], context: CFunctionContext): string[] {
  if (args.length > 0) {
    context.diagnostics.push(
      diagnostic('CCJS_DGRAM_SOCKET', 'socket.disconnect in the C backend does not take arguments', dgramNodeLoc(args[0]))
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
    expression.type !== 'CallExpression' ||
    expression.callee == null ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.object == null ||
    expression.callee.object.type !== 'Reference' ||
    expression.callee.object.path.length !== 1 ||
    context.variables.get(expression.callee.object.path[0]) !== 'dgram-socket'
  ) {
    return null
  }

  const socketName = expression.callee.object.path[0]
  const method = expression.callee.property

  if (method === 'setBroadcast') {
    const enabled = deps.emitPreparedNumberExpression(expression.args[0], context)
    const lines: string[] = []

    pushDgramLines(lines, enabled.lines)
    lines.push(emitStatusCheck(`ccjs_dgram_set_broadcast(${socketName}, ${enabled.expression} ? 1 : 0)`, context))

    return lines
  }

  if (method === 'setTTL') {
    const ttl = deps.emitPreparedNumberExpression(expression.args[0], context)
    const lines: string[] = []

    pushDgramLines(lines, ttl.lines)
    lines.push(emitStatusCheck(`ccjs_dgram_set_ttl(${socketName}, (int)(${ttl.expression}))`, context))

    return lines
  }

  if (method === 'setSendBufferSize' || method === 'setRecvBufferSize') {
    let runtime = 'ccjs_dgram_set_recv_buffer_size'

    if (method === 'setSendBufferSize') {
      runtime = 'ccjs_dgram_set_send_buffer_size'
    }

    const size = deps.emitPreparedNumberExpression(expression.args[0], context)
    const lines: string[] = []

    pushDgramLines(lines, size.lines)
    lines.push(emitStatusCheck(`${runtime}(${socketName}, (int)(${size.expression}))`, context))

    return lines
  }

  if (method === 'ref' || method === 'unref') {
    if (expression.args.length > 0) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_DGRAM_SOCKET',
          `socket.${method} in the C backend does not take arguments`,
          dgramNodeLoc(expression.args[0])
        )
      )
    }

    let runtime = 'ccjs_dgram_unref'

    if (method === 'ref') {
      runtime = 'ccjs_dgram_ref'
    }

    return [emitStatusCheck(`${runtime}(${socketName})`, context)]
  }

  return null
}

function emitDgramSendLines(
  socketName: string,
  args: AnyNode[],
  context: CFunctionContext,
  deps: DgramLoweringDependencies,
  dgramContext: DgramMessageContext | null
): string[] {
  const lastArg = lastDgramArgument(args)
  let callback: AnyNode | null = null

  if (lastArg != null && lastArg.type === 'ArrowFunctionExpression') {
    callback = lastArg
  }

  let callbackOffset = 0

  if (callback != null) {
    callbackOffset = 1
  }

  if (args.length - callbackOffset === 1) {
    const body = emitDgramBytesOperand(args[0], dgramContext, context, deps)
    const lines: string[] = []

    pushDgramLines(lines, body.lines)
    pushDgramLines(
      lines,
      emitDgramStatusCheck(`ccjs_dgram_send_connected(${socketName}, ${body.bytes}, ${body.length})`, context, dgramContext)
    )
    pushDgramLines(lines, emitDgramZeroArgCallbackLines(callback, context, deps))

    return lines
  }

  if (args.length < 3) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_DGRAM_SOCKET',
        'socket.send in the C backend currently requires message, port and address arguments, or a connected socket message form',
        dgramNodeLoc(args[0])
      )
    )
    return []
  }

  const hasOffsetLength = args.length - callbackOffset >= 5
  const body = emitDgramBytesOperand(args[0], dgramContext, context, deps)
  let portArg = args[1]
  let hostArg = args[2]

  if (hasOffsetLength) {
    portArg = args[3]
    hostArg = args[4]
  }

  if (hasOffsetLength) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_DGRAM_SOCKET',
        'socket.send offset/length arguments are not supported by the current C backend slice yet',
        dgramNodeLoc(args[1])
      )
    )
  }

  const port = emitDgramPortExpression(portArg, dgramContext, context, deps)
  const host = emitDgramHostExpression(hostArg, dgramContext, context, deps)

  const lines: string[] = []

  pushDgramLines(lines, body.lines)
  pushDgramLines(lines, port.lines)
  pushDgramLines(
    lines,
    emitDgramStatusCheck(
      `ccjs_dgram_send(${socketName}, ${body.bytes}, ${body.length}, ${host}, (int)(${port.expression}))`,
      context,
      dgramContext
    )
  )
  pushDgramLines(lines, emitDgramZeroArgCallbackLines(callback, context, deps))

  return lines
}

function emitDgramCloseLines(
  socketName: string,
  args: AnyNode[],
  context: CFunctionContext,
  deps: DgramLoweringDependencies
): string[] {
  if (args.length > 1) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_DGRAM_SOCKET',
        'socket.close in the C backend supports only an optional callback',
        dgramNodeLoc(args[1])
      )
    )
  }

  const lines = [`ccjs_dgram_close(${socketName});`]

  pushDgramLines(lines, emitDgramZeroArgCallbackLines(args[0], context, deps))

  return lines
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
    dgramContext != null &&
    dgramContext.messageName != null &&
    expression.type === 'Reference' &&
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

function isDgramAddressStringProperty(property: string): boolean {
  return property === 'address' || property === 'family'
}

function isDgramRinfoProperty(property: string): boolean {
  return property === 'address' || property === 'family' || property === 'port' || property === 'size'
}

function resolveDgramAddressStringMember(expression: AnyNode, context: CFunctionContext): string | null {
  if (
    expression.type !== 'MemberExpression' ||
    !isDgramAddressStringProperty(expression.property) ||
    expression.object == null ||
    expression.object.type !== 'Reference' ||
    expression.object.path.length !== 1 ||
    context.variables.get(expression.object.path[0]) !== 'dgram-address'
  ) {
    return null
  }

  if (expression.property === 'family') {
    return `${expression.object.path[0]}.family`
  }

  return `${expression.object.path[0]}.address`
}

function resolveDgramRinfoMember(
  expression: AnyNode | null | undefined,
  dgramContext: DgramMessageContext | null
): string | null {
  if (
    dgramContext == null ||
    dgramContext.rinfoName == null ||
    expression == null ||
    expression.type !== 'MemberExpression' ||
    expression.object == null ||
    expression.object.type !== 'Reference' ||
    expression.object.path.length !== 1 ||
    expression.object.path[0] !== dgramContext.rinfoName
  ) {
    return null
  }

  if (isDgramRinfoProperty(expression.property)) {
    return expression.property
  }

  return null
}

function emitDgramStaticStringValue(
  expression: AnyNode | null | undefined,
  dgramContext: DgramMessageContext | null
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

  if (expression.type === 'Reference' && expression.path.length === 1) {
    if (dgramContext != null) {
      return emitDgramStaticStringLocalValue(expression, dgramContext)
    }
  }

  return null
}

function emitDgramStaticStringLocalValue(expression: AnyNode, dgramContext: DgramMessageContext): string | null {
  const value = dgramContext.stringLocals.get(expression.path[0])

  if (value != null) {
    return value
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

  const body: AnyNode[] = []

  if (callback.expressionBody) {
    body.push({
      type: 'ExpressionStatement',
      expression: callback.body,
      loc: callback.loc
    })
  } else {
    pushDgramNodes(body, callback.body)
  }

  return deps.emitStatementList(body, context)
}

function isDgramSocketMethodCall(expression: AnyNode, method: string, context: CFunctionContext): boolean {
  return isDgramSocketAnyMethodCall(expression, context) && expression.callee.property === method
}

function isDgramSocketAnyMethodCall(expression: AnyNode, context: CFunctionContext): boolean {
  if (expression.type !== 'CallExpression') {
    return false
  }

  if (expression.callee == null || expression.callee.type !== 'MemberExpression') {
    return false
  }

  if (expression.callee.object == null || expression.callee.object.type !== 'Reference') {
    return false
  }

  return (
    expression.callee.object.path.length === 1 &&
    context.variables.get(expression.callee.object.path[0]) === 'dgram-socket'
  )
}

function isDgramAddressCall(expression: AnyNode | null | undefined, context: CFunctionContext): boolean {
  if (expression == null || expression.type !== 'CallExpression') {
    return false
  }

  if (expression.callee == null || expression.callee.type !== 'MemberExpression') {
    return false
  }

  if (expression.callee.property !== 'address' && expression.callee.property !== 'remoteAddress') {
    return false
  }

  if (expression.callee.object == null || expression.callee.object.type !== 'Reference') {
    return false
  }

  return (
    expression.callee.object.path.length === 1 &&
    context.variables.get(expression.callee.object.path[0]) === 'dgram-socket'
  )
}

function isDgramCreateSocketCall(expression: AnyNode | null | undefined, context: CEmitContext): boolean {
  if (expression == null || expression.type !== 'CallExpression') {
    return false
  }

  if (
    expression.callee != null &&
    expression.callee.type === 'Reference' &&
    expression.callee.path.length === 1 &&
    context.dgramCreateSocketNames.has(expression.callee.path[0])
  ) {
    return true
  }

  return (
    expression.callee != null &&
    expression.callee.type === 'MemberExpression' &&
    expression.callee.property === 'createSocket' &&
    expression.callee.object != null &&
    expression.callee.object.type === 'Reference' &&
    expression.callee.object.path.length === 1 &&
    context.dgramImportNames.has(expression.callee.object.path[0])
  )
}

function emitDgramCreateSocketMessageListener(expression: AnyNode): AnyNode | null {
  if (expression.args[0] != null && expression.args[0].type === 'ArrowFunctionExpression') {
    return expression.args[0]
  }

  if (expression.args[1] != null && expression.args[1].type === 'ArrowFunctionExpression') {
    return expression.args[1]
  }

  return null
}

function emitDgramSocketTypeDiagnostics(
  expression: AnyNode | null | undefined,
  context: CFunctionContext,
  deps: DgramLoweringDependencies
): void {
  let typeValue: string | null = null

  if (expression != null && expression.type === 'StringLiteral') {
    typeValue = expression.value
  } else if (expression != null && expression.type === 'ObjectLiteral') {
    typeValue = deps.staticObjectStringPropertyValue(expression, 'type')
  }

  if (typeValue === 'udp4') {
    return
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_DGRAM_SOCKET',
      "dgram.createSocket in the C backend currently supports only the 'udp4' socket type",
      dgramNodeLoc(expression)
    )
  )
}
