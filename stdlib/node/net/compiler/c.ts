import { diagnostic } from '../../../../compiler/diagnostics.ts'
import { collectIrTopLevelNodeEntries } from '../../../../compiler/ir.ts'
import type { AnyNode, IrProgram, SourceLocation } from '../../../../compiler/types.ts'
import type { CEmitContext, CFunctionContext } from '../../../../compiler/c/context.ts'
import {
  emitRuntimeTypeCheck,
  nextCName,
  registerEventLoop
} from '../../../../compiler/c/context.ts'
import {
  collectStdlibRuntimeImportNames,
  irProgramsUseStdlibRuntimeImport
} from '../../../../compiler/c/runtime-imports.ts'
import { cStringLiteral, utf8ByteLength } from '../../../../compiler/c/identifiers.ts'
import type {
  CNetHandler,
  CPreparedExpression as PreparedExpression,
  CPreparedStringBytesOperand as PreparedStringBytesOperand
} from '../../../../compiler/c/types.ts'
import { cookTemplateLiteralText } from '../../../../compiler/c/values/strings.ts'
import { isConsoleLog } from '../../../global/console/compiler/c.ts'

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

export function registerNetRuntimeImportNames(context: CEmitContext, irPrograms: IrProgram[]): void {
  context.netImportNames = collectStdlibRuntimeImportNames(irPrograms, 'net', 'module-object')
  context.netCreateServerNames = collectStdlibRuntimeImportNames(irPrograms, 'net', 'create-server')
  context.netConnectNames = collectStdlibRuntimeImportNames(irPrograms, 'net', 'connect')
}

export function irProgramsUseNetRuntimeImport(programs: IrProgram[]): boolean {
  return irProgramsUseStdlibRuntimeImport(programs, 'net')
}

export type NetLoweringDependencies = {
  createFunctionContext: (baseContext: CEmitContext, returnType: string, returnNullable: boolean) => CFunctionContext
  emitConsoleLogStatement: (method: string, args: NetAstNode[], context: CFunctionContext) => string[]
  emitPreparedNumberExpression: (expression: NetAstNode, context: CFunctionContext) => PreparedExpression
  emitPreparedStringBytesOperand: (
    expression: NetAstNode,
    context: CFunctionContext,
    tempPrefix: string
  ) => PreparedStringBytesOperand
  emitStatementList: (body: NetAstNode[], context: CFunctionContext) => string[]
  findObjectLiteralPropertyValue: (expression: NetAstNode, key: string) => NetAstNode | null
}

type NetTopLevelNodeEntry = {
  kind: string
  node: NetAstNode
}

function netNodeLoc(node: NetAstNode | null | undefined): SourceLocation | null {
  if (node === null || typeof node === 'undefined') {
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
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'Reference' ||
    expression.path.length !== 1
  ) {
    return null
  }

  return expression.path[0] ?? null
}

function netMemberObjectReferenceName(callee: NetAstNode | null | undefined): string | null {
  if (callee === null || typeof callee === 'undefined' || callee.type !== 'MemberExpression') {
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

function netHandlerUsesStatusReturn(kind: string): boolean {
  return (
    kind !== 'connection' &&
    kind !== 'event' &&
    kind !== 'error' &&
    kind !== 'socket-data' &&
    kind !== 'socket-event' &&
    kind !== 'socket-write' &&
    kind !== 'socket-error'
  )
}

function netHandlerSocketExpression(kind: string): string {
  return (
    kind === 'connection' ||
    kind === 'socket-data' ||
    kind === 'socket-event' ||
    kind === 'socket-write' ||
    kind === 'socket-error'
  )
    ? 'inox_socket'
    : 'NetSocket(inox_socket)'
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
    return `static void ${wrapper.name}(void* user, NetServer inox_server, NetSocket inox_socket)`
  }

  if (wrapper.kind === 'socket-data') {
    return `static void ${wrapper.name}(void* user, NetSocket inox_socket, inox::StringView inox_bytes)`
  }

  if (wrapper.kind === 'socket-write') {
    return `static void ${wrapper.name}(void* user, NetSocket inox_socket, inox_status inox_write_status)`
  }

  if (wrapper.kind === 'socket-event') {
    return `static void ${wrapper.name}(void* user, NetSocket inox_socket)`
  }

  if (wrapper.kind === 'socket-error') {
    return `static void ${wrapper.name}(void* user, NetSocket inox_socket, inox_status inox_error_status)`
  }

  if (wrapper.kind === 'error') {
    return `static void ${wrapper.name}(void* user, NetServer inox_server, inox_status inox_error_status)`
  }

  return `static void ${wrapper.name}(void* user, NetServer inox_server)`
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

  if (wrapper.kind === 'connection' && firstParam !== null && typeof firstParam !== 'undefined') {
    socketName = firstParam.name
  }

  if (wrapper.kind === 'socket-data' && firstParam !== null && typeof firstParam !== 'undefined') {
    dataName = firstParam.name
  }

  const netContext: NetHandlerContext = {
    kind: wrapper.kind,
    dataName: dataName,
    socketName: socketName,
    stringLocals: new Map()
  }
  const context = deps.createFunctionContext(baseContext, 'void', false)
  context.cleanupEnabled = false
  context.statusReturn = netHandlerUsesStatusReturn(wrapper.kind)

  if (socketName !== null && typeof socketName !== 'undefined') {
    context.variables.set(socketName, 'net-socket')
  }

  if (dataName !== null && typeof dataName !== 'undefined') {
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
    lines.push('  (void)inox_server;')
  }

  if (isSocketHandler && (socketName === null || typeof socketName === 'undefined')) {
    lines.push('  (void)inox_socket;')
  }

  if (wrapper.kind === 'socket-data' && (dataName === null || typeof dataName === 'undefined')) {
    lines.push('  (void)inox_bytes;')
  }

  if (wrapper.kind === 'error' || wrapper.kind === 'socket-error') {
    lines.push('  (void)inox_error_status;')
  }

  if (wrapper.kind === 'socket-write') {
    lines.push('  (void)inox_write_status;')
  }

  for (const statement of body) {
    pushIndentedNetLines(lines, emitNetHandlerStatement(statement, netContext, context, deps))
  }

  if (netHandlerUsesStatusReturn(wrapper.kind)) {
    lines.push('  return INOX_OK;')
  }
  lines.push('}')

  return lines
}

function emitNetHandlerStatement(
  statement: AnyNode | null | undefined,
  netContext: NetHandlerContext,
  context: CFunctionContext,
  deps: NetLoweringDependencies
): string[] {
  if (statement === null || typeof statement === 'undefined') {
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

    if (stringValue !== null && typeof stringValue !== 'undefined') {
      netContext.stringLocals.set(statement.name, stringValue)
      return []
    }

    context.diagnostics.push(
      diagnostic(
        'INOX_NET_HANDLER',
        'net event listeners in the C++ backend currently support only static string local declarations',
        statement.loc
      )
    )
    return []
  }

  if (
    statement.type === 'ExpressionStatement' &&
    statement.expression !== null &&
    typeof statement.expression !== 'undefined' &&
    statement.expression.type === 'CallExpression'
  ) {
    const logStatement = emitNetHandlerConsoleLogStatement(statement.expression, netContext, context, deps)

    if (logStatement !== null && typeof logStatement !== 'undefined') {
      return logStatement
    }

    const socketCall = emitNetHandlerSocketCallStatement(statement.expression, netContext, context, deps)

    if (socketCall !== null && typeof socketCall !== 'undefined') {
      return socketCall
    }

    const serverCall = emitNetHandlerServerCallStatement(statement.expression)

    if (serverCall !== null && typeof serverCall !== 'undefined') {
      return serverCall
    }
  }

  if (statement.type === 'ReturnStatement') {
    if (
      statement.argument !== null &&
      typeof statement.argument !== 'undefined' &&
      statement.argument.type === 'CallExpression'
    ) {
      const socketCall = emitNetHandlerSocketCallStatement(statement.argument, netContext, context, deps)

      if (socketCall !== null && typeof socketCall !== 'undefined') {
        const lines: string[] = []

        pushNetLines(lines, socketCall)
        lines.push(netHandlerUsesStatusReturn(netContext.kind) ? 'return INOX_OK;' : 'return;')

        return lines
      }
    }

    return [netHandlerUsesStatusReturn(netContext.kind) ? 'return INOX_OK;' : 'return;']
  }

  context.diagnostics.push(
    diagnostic(
      'INOX_NET_HANDLER',
      'this net event listener statement is not supported by the current C++ backend slice',
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
    callee === null ||
    typeof callee === 'undefined' ||
    callee.type !== 'MemberExpression' ||
    callee.object === null ||
    typeof callee.object === 'undefined' ||
    callee.object.type !== 'Reference' ||
    callee.object.path.length !== 1
  ) {
    return null
  }

  const socketName = netMemberObjectReferenceName(callee)

  if (socketName === null || typeof socketName === 'undefined') {
    return null
  }

  if (
    netContext.socketName !== null &&
    typeof netContext.socketName !== 'undefined' &&
    socketName !== netContext.socketName &&
    !isNetSocketCallbackKind(netContext.kind)
  ) {
    return null
  }

  const method = callee.property

  if (method === 'write' || method === 'end') {
    const socketExpression = netHandlerSocketExpression(netContext.kind)
    const lastArg = lastNetArgument(expression.args)
    let callback: AnyNode | null = null

    if (lastArg !== null && typeof lastArg !== 'undefined' && lastArg.type === 'ArrowFunctionExpression') {
      callback = lastArg
    }

    let bodyArg: AnyNode | null = null

    if (
      !(callback !== null && typeof callback !== 'undefined' && expression.args.length === 1) &&
      expression.args.length > 0
    ) {
      bodyArg = expression.args[0]
    }

    const body = emitNetBytesOperand(bodyArg, netContext, context, deps)
    const wrapper = findNetHandler(context, callback, 'socket-write')
    let call = `${socketExpression}.write(inox::StringView(${body.bytes}, ${body.length}))`

    if (method === 'write' && wrapper !== null && typeof wrapper !== 'undefined') {
      call = `${socketExpression}.write(inox::StringView(${body.bytes}, ${body.length}), ${wrapper.name}, 0)`
    } else if (method === 'end' && (wrapper === null || typeof wrapper === 'undefined')) {
      call = `${socketExpression}.end(inox::StringView(${body.bytes}, ${body.length}))`
    } else if (method === 'end' && wrapper !== null && typeof wrapper !== 'undefined') {
      call = `${socketExpression}.end(inox::StringView(${body.bytes}, ${body.length}), ${wrapper.name}, 0)`
    }

    const lines: string[] = []

    pushNetLines(lines, body.lines)
    pushNetLines(lines, emitNetThrownCheck(call, context))

    return lines
  }

  if (method === 'destroy') {
    return emitNetThrownCheck(`${netHandlerSocketExpression(netContext.kind)}.destroy()`, context)
  }

  if (method === 'close') {
    return [`${netHandlerSocketExpression(netContext.kind)}.close();`]
  }

  context.diagnostics.push(
    diagnostic(
      'INOX_NET_HANDLER',
      `socket.${method} is not supported inside net connection listeners by the current C++ backend slice`,
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
  let stream = 'log'

  if (callee.property === 'warn' || callee.property === 'error') {
    stream = 'error'
  }

  let firstArg: AnyNode | null = null

  if (expression.args.length > 0) {
    firstArg = expression.args[0]
  }

  if (
    expression.args.length === 1 &&
    netContext.dataName !== null &&
    typeof netContext.dataName !== 'undefined' &&
    firstArg !== null &&
    typeof firstArg !== 'undefined' &&
    firstArg.type === 'Reference' &&
    firstArg.path.length === 1 &&
    netReferenceName(firstArg) === netContext.dataName
  ) {
    return [`console.${stream}("%.*s", (int)inox_bytes.len, inox_bytes.bytes);`]
  }

  return deps.emitConsoleLogStatement(callee.property, expression.args, context)
}

function emitNetHandlerServerCallStatement(expression: AnyNode): string[] | null {
  const callee = expression.callee

  if (
    callee === null ||
    typeof callee === 'undefined' ||
    callee.type !== 'MemberExpression' ||
    callee.object === null ||
    typeof callee.object === 'undefined' ||
    callee.object.type !== 'Reference' ||
    callee.object.path.length !== 1
  ) {
    return null
  }

  if (callee.property !== 'close') {
    return null
  }

  return ['NetServer(inox_server).close();']
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

export function emitNetServerVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[] | null {
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

  if (receiverName === null || typeof receiverName === 'undefined') {
    return null
  }

  let call = `${receiverName}.address()`

  if (context.variables.get(receiverName) === 'net-socket') {
    call = `${receiverName}.address()`
  }

  context.variables.set(statement.name, 'net-address')

  return [
    `NetAddress ${statement.name} = ${call};`,
    emitRuntimeTypeCheck('inox::thrown()', context)
  ]
}

export function emitNetAddressMemberVariableDeclaration(
  statement: AnyNode,
  context: CFunctionContext
): string[] | null {
  const member = resolveNetSocketAddressMember(statement.init, context)

  if (member !== null && typeof member !== 'undefined') {
    if (member.valueType === 'string') {
      context.variables.set(statement.name, 'string')

      return [
        `NetAddress ${member.tempName} = ${member.socketName}.${member.runtime}();`,
        emitRuntimeTypeCheck('inox::thrown()', context),
        `const char *${statement.name} = ${member.tempName}.${member.field};`
      ]
    }

    context.variables.set(statement.name, 'number')

    return [
      `double ${statement.name} = 0;`,
      '{',
      `  NetAddress ${member.tempName} = ${member.socketName}.${member.runtime}();`,
      `  ${emitRuntimeTypeCheck('inox::thrown()', context)}`,
      `  ${statement.name} = (double)${member.tempName}.${member.field};`,
      '}'
    ]
  }

  return null
}

export function emitNetNumberVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[] | null {
  const counter = resolveNetSocketCounterMember(statement.init, context)

  if (counter === null || typeof counter === 'undefined') {
    return null
  }

  context.variables.set(statement.name, 'number')

  return [
    `double ${statement.name} = (double)${counter.socketName}.${counter.runtime}();`,
    emitRuntimeTypeCheck('inox::thrown()', context)
  ]
}

export function emitNetSocketCallStatement(
  expression: AnyNode,
  context: CFunctionContext,
  deps: NetLoweringDependencies
): string[] | null {
  const socketName = netMemberObjectReferenceName(expression.callee)

  if (isNetSocketMethodCall(expression, 'on', context)) {
    if (socketName === null || typeof socketName === 'undefined') {
      return null
    }

    return emitNetSocketOnLines(socketName, expression.args, context)
  }

  if (isNetSocketMethodCall(expression, 'write', context)) {
    if (socketName === null || typeof socketName === 'undefined') {
      return null
    }

    return emitNetSocketWriteLines(socketName, 'write', expression.args, context, deps)
  }

  if (isNetSocketMethodCall(expression, 'end', context)) {
    if (socketName === null || typeof socketName === 'undefined') {
      return null
    }

    return emitNetSocketWriteLines(socketName, 'end', expression.args, context, deps)
  }

  if (isNetSocketMethodCall(expression, 'destroy', context)) {
    if (socketName === null || typeof socketName === 'undefined') {
      return null
    }

    return [`${socketName}.destroy();`, emitRuntimeTypeCheck('inox::thrown()', context)]
  }

  if (isNetSocketMethodCall(expression, 'close', context)) {
    if (socketName === null || typeof socketName === 'undefined') {
      return null
    }

    return [`${socketName}.close();`]
  }

  if (isNetSocketMethodCall(expression, 'setEncoding', context)) {
    if (socketName === null || typeof socketName === 'undefined') {
      return null
    }

    return emitNetSocketSetEncodingLines(socketName, expression.args, context)
  }

  const optionCall = emitNetSocketOptionCallStatement(expression, context, deps)

  if (optionCall !== null && typeof optionCall !== 'undefined') {
    return optionCall
  }

  if (isNetSocketAnyMethodCall(expression, context)) {
    const callee = expression.callee
    let loc = netNodeLoc(expression)
    let property = 'unknown'

    if (callee !== null && typeof callee !== 'undefined') {
      property = callee.property

      if (callee.loc !== null && typeof callee.loc !== 'undefined') {
        loc = callee.loc
      }
    }

    context.diagnostics.push(
      diagnostic('INOX_NET_SOCKET', `socket.${property} is not supported by the current C net backend slice`, loc)
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
    callee !== null &&
    typeof callee !== 'undefined' &&
    callee.type === 'MemberExpression' &&
    callee.property === 'listen' &&
    isNetCreateServerCall(callee.object, context)
  ) {
    const serverName = nextCName(context, 'inox_net_server')
    const lines = [`NetServer ${serverName};`]
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

    if (serverName === null || typeof serverName === 'undefined') {
      return null
    }

    registerEventLoop(context)

    return emitNetServerListenLines(serverName, expression.args, context, deps)
  }

  if (isNetServerMethodCall(expression, 'on', context)) {
    const serverName = netMemberObjectReferenceName(expression.callee)

    if (serverName === null || typeof serverName === 'undefined') {
      return null
    }

    return emitNetServerOnLines(serverName, expression.args, context)
  }

  if (isNetServerMethodCall(expression, 'close', context)) {
    const serverName = netMemberObjectReferenceName(expression.callee)

    if (serverName === null || typeof serverName === 'undefined') {
      return null
    }

    return emitNetServerCloseLines(serverName, expression.args, context, deps)
  }

  if (isNetServerAnyMethodCall(expression, context)) {
    let loc = netNodeLoc(expression)
    let property = 'unknown'

    if (callee !== null && typeof callee !== 'undefined') {
      property = callee.property

      if (callee.loc !== null && typeof callee.loc !== 'undefined') {
        loc = callee.loc
      }
    }

    context.diagnostics.push(
      diagnostic('INOX_NET_SERVER', `server.${property} is not supported by the current C net backend slice`, loc)
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

  if (firstArg !== null && typeof firstArg !== 'undefined' && firstArg.type === 'ObjectLiteral') {
    optionsArg = firstArg
  }

  const callback = emitNetConnectCallback(expression)
  let portArg: AnyNode | null | undefined = firstArg
  let hostArg: AnyNode | null | undefined = secondArg

  if (optionsArg !== null && typeof optionsArg !== 'undefined') {
    portArg = deps.findObjectLiteralPropertyValue(optionsArg, 'port')
    hostArg = deps.findObjectLiteralPropertyValue(optionsArg, 'host')
  } else if (secondArg !== null && typeof secondArg !== 'undefined' && secondArg.type === 'ArrowFunctionExpression') {
    hostArg = null
  }

  const wrapper = findNetHandler(context, callback, 'socket-event')

  if (portArg === null || typeof portArg === 'undefined') {
    context.diagnostics.push(
      diagnostic('INOX_NET_SOCKET', 'net.connect in the C++ backend currently requires a port argument', expression.loc)
    )
  }

  if (
    callback !== null &&
    typeof callback !== 'undefined' &&
    (callback.type !== 'ArrowFunctionExpression' || wrapper === null || typeof wrapper === 'undefined')
  ) {
    context.diagnostics.push(
      diagnostic(
        'INOX_NET_SOCKET',
        'net.connect callback in the C++ backend currently requires an inline listener',
        netNodeLoc(callback)
      )
    )
  }

  let port: PreparedExpression = {
    lines: [],
    expression: '0'
  }

  if (portArg !== null && typeof portArg !== 'undefined') {
    port = deps.emitPreparedNumberExpression(portArg, context)
  }

  const host = emitNetConnectHostExpression(hostArg, context)
  const lines: string[] = []

  if (options === null || typeof options === 'undefined' || options.declare !== false) {
    lines.push(`NetSocket ${socketName};`)
  }

  pushNetLines(lines, port.lines)
  lines.push(`${socketName} = NetSocket::connect(${host}, (int)(${port.expression}), 0, 0, 0, 0);`)
  lines.push(emitRuntimeTypeCheck('inox::thrown()', context))

  if (wrapper !== null && typeof wrapper !== 'undefined') {
    lines.push(`${socketName}.onConnect(${wrapper.name}, 0);`)
    lines.push(emitRuntimeTypeCheck('inox::thrown()', context))
  }

  return lines
}

function emitNetSocketOnLines(socketName: string, args: AnyNode[], context: CFunctionContext): string[] {
  let eventArg: AnyNode | null = null

  if (args.length > 0) {
    eventArg = args[0]
  }

  let eventName: string | null = null

  if (eventArg !== null && typeof eventArg !== 'undefined' && eventArg.type === 'StringLiteral') {
    eventName = eventArg.value
  }

  let kind = ''

  if (eventName === 'data') {
    kind = 'socket-data'
  } else if (eventName !== null && typeof eventName !== 'undefined' && isNetSocketLifecycleEvent(eventName)) {
    kind = 'socket-event'
  } else if (eventName === 'error') {
    kind = 'socket-error'
  }

  if (kind === '') {
    context.diagnostics.push(
      diagnostic(
        'INOX_NET_SOCKET',
        "socket.on in the C++ backend currently supports 'connect', 'ready', 'data', 'end', 'close', 'error' and 'drain'",
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

  if (
    listener === null ||
    typeof listener === 'undefined' ||
    listener.type !== 'ArrowFunctionExpression' ||
    wrapper === null ||
    typeof wrapper === 'undefined'
  ) {
    context.diagnostics.push(
      diagnostic(
        'INOX_NET_SOCKET',
        `socket.on('${eventName}') in the C++ backend currently requires an inline listener`,
        netNodeLoc(listener)
      )
    )
    return []
  }

  let runtime = 'onDrain'

  if (eventName === 'connect') {
    runtime = 'onConnect'
  } else if (eventName === 'ready') {
    runtime = 'onReady'
  } else if (eventName === 'data') {
    runtime = 'onData'
  } else if (eventName === 'end') {
    runtime = 'onEnd'
  } else if (eventName === 'close') {
    runtime = 'onClose'
  } else if (eventName === 'error') {
    runtime = 'onError'
  }

  const lines = [`${socketName}.${runtime}(${wrapper.name}, 0);`, emitRuntimeTypeCheck('inox::thrown()', context)]

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

  if (lastArg !== null && typeof lastArg !== 'undefined' && lastArg.type === 'ArrowFunctionExpression') {
    callback = lastArg
  }

  let bodyArg: AnyNode | null = null

  if (!(callback !== null && typeof callback !== 'undefined' && args.length === 1) && args.length > 0) {
    bodyArg = args[0]
  }

  const body = emitNetBytesOperand(bodyArg, null, context, deps)
  const wrapper = findNetHandler(context, callback, 'socket-write')
  let call = `${socketName}.write(inox::StringView(${body.bytes}, ${body.length}))`

  if (method === 'write' && wrapper !== null && typeof wrapper !== 'undefined') {
    call = `${socketName}.write(inox::StringView(${body.bytes}, ${body.length}), ${wrapper.name}, 0)`
  } else if (method === 'end' && (wrapper === null || typeof wrapper === 'undefined')) {
    call = `${socketName}.end(inox::StringView(${body.bytes}, ${body.length}))`
  } else if (method === 'end' && wrapper !== null && typeof wrapper !== 'undefined') {
    call = `${socketName}.end(inox::StringView(${body.bytes}, ${body.length}), ${wrapper.name}, 0)`
  }

  if (callback !== null && typeof callback !== 'undefined' && (wrapper === null || typeof wrapper === 'undefined')) {
    context.diagnostics.push(
      diagnostic(
        'INOX_NET_SOCKET',
        `socket.${method} callback in the C++ backend currently requires an inline listener`,
        callback.loc
      )
    )
  }

  const lines: string[] = []

  pushNetLines(lines, body.lines)
  lines.push(`${call};`)
  lines.push(emitRuntimeTypeCheck('inox::thrown()', context))

  return lines
}

function emitNetSocketSetEncodingLines(socketName: string, args: AnyNode[], context: CFunctionContext): string[] {
  let firstArg: AnyNode | null = null

  if (args.length > 0) {
    firstArg = args[0]
  }

  const value = emitNetStaticStringValue(firstArg, null)

  if (value === null || typeof value === 'undefined') {
    context.diagnostics.push(
      diagnostic(
        'INOX_NET_SOCKET',
        'socket.setEncoding in the C++ backend currently requires a static string',
        netNodeLoc(firstArg)
      )
    )
    return []
  }

  return [
    `${socketName}.setEncoding(inox::StringView(${cStringLiteral(value)}, ${utf8ByteLength(value)}));`,
    emitRuntimeTypeCheck('inox::thrown()', context)
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

  if (socketName === null || typeof socketName === 'undefined') {
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
    lines.push(`${socketName}.setNoDelay(${enabled.expression} != 0);`)
    lines.push(emitRuntimeTypeCheck('inox::thrown()', context))

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
    lines.push(`${socketName}.setKeepAlive(${enabled.expression} != 0, (unsigned int)(${delay.expression}));`)
    lines.push(emitRuntimeTypeCheck('inox::thrown()', context))

    return lines
  }

  if (method === 'ref' || method === 'unref') {
    if (expression.args.length > 0) {
      context.diagnostics.push(
        diagnostic(
          'INOX_NET_SOCKET',
          `socket.${method} in the C++ backend does not take arguments`,
          netNodeLoc(expression.args[0])
        )
      )
    }

    let runtime = 'unref'

    if (method === 'ref') {
      runtime = 'ref'
    }

    return [`${socketName}.${runtime}();`, emitRuntimeTypeCheck('inox::thrown()', context)]
  }

  if (method === 'setTimeout') {
    const callee = expression.callee
    let loc = netNodeLoc(expression)

    if (callee !== null && typeof callee !== 'undefined' && callee.loc !== null && typeof callee.loc !== 'undefined') {
      loc = callee.loc
    }

    context.diagnostics.push(
      diagnostic('INOX_NET_SOCKET', 'socket.setTimeout is not supported by the current C net backend slice yet', loc)
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
  return [`${socketName}.readStart();`, emitRuntimeTypeCheck('inox::thrown()', context)]
}

function emitNetServerCreateLines(
  expression: AnyNode,
  serverName: string,
  context: CFunctionContext,
  options: NetServerCreateOptions | null
): string[] {
  const listener = emitNetCreateServerConnectionListener(expression)
  const wrapper = findNetHandler(context, listener, 'connection')

  if (
    listener !== null &&
    typeof listener !== 'undefined' &&
    (listener.type !== 'ArrowFunctionExpression' || wrapper === null || typeof wrapper === 'undefined')
  ) {
    context.diagnostics.push(
      diagnostic(
        'INOX_NET_SERVER',
        'net.createServer in the C++ backend currently requires an inline connection listener',
        netNodeLoc(listener)
      )
    )
  }

  const lines: string[] = []

  if (options === null || typeof options === 'undefined' || options.declare !== false) {
    lines.push(`NetServer ${serverName};`)
  }

  let wrapperName = '0'

  if (wrapper !== null && typeof wrapper !== 'undefined') {
    wrapperName = wrapper.name
  }

  lines.push(`${serverName} = NetServer::create(${wrapperName}, 0);`)
  lines.push(emitRuntimeTypeCheck('inox::thrown()', context))

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

  if (firstArg !== null && typeof firstArg !== 'undefined' && firstArg.type === 'ObjectLiteral') {
    options = firstArg
  }

  const callback = emitNetListenCallback(args, options)
  let portArg: AnyNode | null | undefined = emitNetListenPortArg(args)
  let hostArg: AnyNode | null | undefined = emitNetListenHostArg(args)
  let backlogArg: AnyNode | null | undefined = emitNetListenBacklogArg(args)

  if (options !== null && typeof options !== 'undefined') {
    portArg = deps.findObjectLiteralPropertyValue(options, 'port')
    hostArg = deps.findObjectLiteralPropertyValue(options, 'host')
    backlogArg = deps.findObjectLiteralPropertyValue(options, 'backlog')
  }

  if (options !== null && typeof options !== 'undefined' && deps.findObjectLiteralPropertyValue(options, 'exclusive')) {
    context.diagnostics.push(
      diagnostic(
        'INOX_NET_SERVER',
        'server.listen exclusive options are not supported by the current C net backend slice',
        options.loc
      )
    )
  }

  let port: PreparedExpression = {
    lines: [],
    expression: '0'
  }

  if (portArg !== null && typeof portArg !== 'undefined') {
    port = deps.emitPreparedNumberExpression(portArg, context)
  }

  const host = emitNetListenHostExpression(hostArg, context)
  let backlog: PreparedExpression = {
    lines: [],
    expression: '128'
  }

  if (backlogArg !== null && typeof backlogArg !== 'undefined') {
    backlog = deps.emitPreparedNumberExpression(backlogArg, context)
  }

  const lines: string[] = []

  pushNetLines(lines, port.lines)
  pushNetLines(lines, backlog.lines)
  lines.push(`${serverName}.listen(${host}, (int)(${port.expression}), (int)(${backlog.expression}));`)
  lines.push(emitRuntimeTypeCheck('inox::thrown()', context))
  pushNetLines(lines, emitNetZeroArgCallbackLines(callback, context, deps))

  return lines
}

function emitNetServerOnLines(serverName: string, args: AnyNode[], context: CFunctionContext): string[] {
  let eventArg: AnyNode | null = null

  if (args.length > 0) {
    eventArg = args[0]
  }

  let eventName: string | null = null

  if (eventArg !== null && typeof eventArg !== 'undefined' && eventArg.type === 'StringLiteral') {
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
        'INOX_NET_SERVER',
        "server.on in the C++ backend currently supports 'connection', 'listening', 'close' and 'error'",
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

  if (
    listener === null ||
    typeof listener === 'undefined' ||
    listener.type !== 'ArrowFunctionExpression' ||
    wrapper === null ||
    typeof wrapper === 'undefined'
  ) {
    context.diagnostics.push(
      diagnostic(
        'INOX_NET_SERVER',
        `server.on('${eventName}') in the C++ backend currently requires an inline listener`,
        netNodeLoc(listener)
      )
    )
    return []
  }

  let runtime = 'onError'

  if (eventName === 'connection') {
    runtime = 'onConnection'
  } else if (eventName === 'listening') {
    runtime = 'onListening'
  } else if (eventName === 'close') {
    runtime = 'onClose'
  }

  return [`${serverName}.${runtime}(${wrapper.name}, 0);`, emitRuntimeTypeCheck('inox::thrown()', context)]
}

function emitNetServerCloseLines(
  serverName: string,
  args: AnyNode[],
  context: CFunctionContext,
  deps: NetLoweringDependencies
): string[] {
  if (args.length > 1) {
    context.diagnostics.push(
      diagnostic(
        'INOX_NET_SERVER',
        'server.close in the C++ backend supports only an optional callback',
        netNodeLoc(args[1])
      )
    )
  }

  const lines = [`${serverName}.close();`]
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
  if (callback === null || typeof callback === 'undefined') {
    return []
  }

  if (callback.type !== 'ArrowFunctionExpression' || callback.params.length !== 0 || callback.async === true) {
    context.diagnostics.push(
      diagnostic(
        'INOX_NET_SERVER',
        'net server lifecycle callbacks in the C++ backend currently require a synchronous zero-argument arrow function',
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
  if (options !== null && typeof options !== 'undefined') {
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
  if (expression === null || typeof expression === 'undefined') {
    return '0'
  }

  if (expression.type === 'StringLiteral') {
    return cStringLiteral(expression.value)
  }

  if (expression.type === 'TemplateLiteral' && !expression.raw.includes('${')) {
    return cStringLiteral(cookTemplateLiteralText(expression.raw.slice(1, -1)))
  }

  context.diagnostics.push(
    diagnostic(
      'INOX_NET_SERVER',
      'server.listen host in the C++ backend currently must be a string literal',
      expression.loc
    )
  )
  return '0'
}

function emitNetConnectHostExpression(expression: AnyNode | null | undefined, context: CFunctionContext): string {
  if (expression === null || typeof expression === 'undefined') {
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
  if (expression === null || typeof expression === 'undefined') {
    return {
      lines: [],
      bytes: '""',
      length: '0'
    }
  }

  if (
    netContext !== null &&
    typeof netContext !== 'undefined' &&
    netContext.dataName !== null &&
    typeof netContext.dataName !== 'undefined' &&
    expression.type === 'Reference' &&
    expression.path.length === 1 &&
    netReferenceName(expression) === netContext.dataName
  ) {
    return {
      lines: [],
      bytes: 'inox_bytes.bytes',
      length: 'inox_bytes.len'
    }
  }

  const staticValue = emitNetStaticStringValue(expression, netContext)

  if (staticValue !== null && typeof staticValue !== 'undefined') {
    return {
      lines: [],
      bytes: cStringLiteral(staticValue),
      length: `${utf8ByteLength(staticValue)}`
    }
  }

  return deps.emitPreparedStringBytesOperand(expression, context, 'inox_net_string')
}

function emitNetStaticStringValue(
  expression: AnyNode | null | undefined,
  netContext: NetHandlerContext | null
): string | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  if (expression.type === 'StringLiteral') {
    return expression.value
  }

  if (expression.type === 'TemplateLiteral' && !expression.raw.includes('${')) {
    return cookTemplateLiteralText(expression.raw.slice(1, -1))
  }

  if (
    expression.type === 'Reference' &&
    expression.path.length === 1 &&
    netContext !== null &&
    typeof netContext !== 'undefined'
  ) {
    const name = netReferenceName(expression)

    if (name === null || typeof name === 'undefined') {
      return null
    }

    if (netContext.stringLocals.has(name)) {
      const value = netContext.stringLocals.get(name)

      if (value !== null && typeof value !== 'undefined') {
        return value
      }
    }
  }

  return null
}

function emitNetThrownCheck(call: string, context: CFunctionContext): string[] {
  return [`${call};`, emitRuntimeTypeCheck('inox::thrown()', context)]
}

export function emitPreparedNetAddressPortExpression(
  expression: AnyNode | null | undefined,
  context: CFunctionContext
): PreparedExpression | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  const name = netReferenceName(expression.object)

  if (
    expression.type !== 'MemberExpression' ||
    expression.property !== 'port' ||
    expression.object === null ||
    typeof expression.object === 'undefined' ||
    expression.object.type !== 'Reference' ||
    expression.object.path.length !== 1 ||
    name === null ||
    typeof name === 'undefined' ||
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
    expression.object === null ||
    typeof expression.object === 'undefined' ||
    expression.object.type !== 'Reference' ||
    expression.object.path.length !== 1 ||
    name === null ||
    typeof name === 'undefined' ||
    context.variables.get(name) !== 'net-address'
  ) {
    return null
  }

  if (expression.property === 'family') {
    return `${name}.family.bytes`
  }

  return `${name}.address`
}

function isNetAddressCall(expression: AnyNode | null | undefined, context: CFunctionContext): boolean {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'CallExpression') {
    return false
  }

  const callee = expression.callee

  if (
    callee === null ||
    typeof callee === 'undefined' ||
    callee.type !== 'MemberExpression' ||
    callee.property !== 'address' ||
    callee.object === null ||
    typeof callee.object === 'undefined' ||
    callee.object.type !== 'Reference' ||
    callee.object.path.length !== 1
  ) {
    return false
  }

  const receiverName = netMemberObjectReferenceName(callee)

  if (receiverName === null || typeof receiverName === 'undefined') {
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

  if (expression !== null && typeof expression !== 'undefined') {
    socketName = netReferenceName(expression.object)
  }

  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'MemberExpression' ||
    expression.object === null ||
    typeof expression.object === 'undefined' ||
    expression.object.type !== 'Reference' ||
    expression.object.path.length !== 1 ||
    socketName === null ||
    typeof socketName === 'undefined' ||
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

  let runtime = 'address'

  if (isRemote) {
    runtime = 'remoteAddress'
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
    tempName: nextCName(context, 'NetAddress'),
    field: field,
    valueType: valueType
  }
}

function resolveNetSocketCounterMember(
  expression: AnyNode | null | undefined,
  context: CFunctionContext
): NetSocketCounterMember | null {
  let socketName: string | null = null

  if (expression !== null && typeof expression !== 'undefined') {
    socketName = netReferenceName(expression.object)
  }

  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'MemberExpression' ||
    expression.object === null ||
    typeof expression.object === 'undefined' ||
    expression.object.type !== 'Reference' ||
    expression.object.path.length !== 1 ||
    socketName === null ||
    typeof socketName === 'undefined' ||
    context.variables.get(socketName) !== 'net-socket'
  ) {
    return null
  }

  if (expression.property === 'bytesRead') {
    return {
      socketName,
      runtime: 'bytesRead'
    }
  }

  if (expression.property === 'bytesWritten') {
    return {
      socketName,
      runtime: 'bytesWritten'
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
    callee === null ||
    typeof callee === 'undefined' ||
    callee.type !== 'MemberExpression' ||
    callee.object === null ||
    typeof callee.object === 'undefined' ||
    callee.object.type !== 'Reference' ||
    callee.object.path.length !== 1 ||
    socketName === null ||
    typeof socketName === 'undefined'
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
    callee === null ||
    typeof callee === 'undefined' ||
    callee.type !== 'MemberExpression' ||
    callee.object === null ||
    typeof callee.object === 'undefined' ||
    callee.object.type !== 'Reference' ||
    callee.object.path.length !== 1 ||
    serverName === null ||
    typeof serverName === 'undefined'
  ) {
    return false
  }

  return context.variables.get(serverName) === 'net-server'
}

function isNetCreateServerCall(expression: AnyNode | null | undefined, context: CEmitContext): boolean {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'CallExpression') {
    return false
  }

  const callee = expression.callee
  const calleeName = netReferenceName(callee)

  if (
    callee !== null &&
    typeof callee !== 'undefined' &&
    callee.type === 'Reference' &&
    callee.path.length === 1 &&
    calleeName !== null &&
    typeof calleeName !== 'undefined' &&
    context.netCreateServerNames.has(calleeName)
  ) {
    return true
  }

  const objectName = netMemberObjectReferenceName(callee)

  return (
    callee !== null &&
    typeof callee !== 'undefined' &&
    callee.type === 'MemberExpression' &&
    callee.property === 'createServer' &&
    callee.object !== null &&
    typeof callee.object !== 'undefined' &&
    callee.object.type === 'Reference' &&
    callee.object.path.length === 1 &&
    objectName !== null &&
    typeof objectName !== 'undefined' &&
    context.netImportNames.has(objectName)
  )
}

function isNetConnectCall(expression: AnyNode | null | undefined, context: CEmitContext): boolean {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'CallExpression') {
    return false
  }

  const callee = expression.callee
  const calleeName = netReferenceName(callee)

  if (
    callee !== null &&
    typeof callee !== 'undefined' &&
    callee.type === 'Reference' &&
    callee.path.length === 1 &&
    calleeName !== null &&
    typeof calleeName !== 'undefined' &&
    context.netConnectNames.has(calleeName)
  ) {
    return true
  }

  const objectName = netMemberObjectReferenceName(callee)

  return (
    callee !== null &&
    typeof callee !== 'undefined' &&
    callee.type === 'MemberExpression' &&
    (callee.property === 'connect' || callee.property === 'createConnection') &&
    callee.object !== null &&
    typeof callee.object !== 'undefined' &&
    callee.object.type === 'Reference' &&
    callee.object.path.length === 1 &&
    objectName !== null &&
    typeof objectName !== 'undefined' &&
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
  if (expression === null || typeof expression === 'undefined') {
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
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'ArrowFunctionExpression') {
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
    name: `inox_net_${cKind}_handler_${handlers.size}`,
    expression: expression
  })
}

function registerNetServerEventListener(
  handlers: Map<string, CNetHandler>,
  expression: AnyNode | null | undefined
): void {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'CallExpression' ||
    expression.callee === null ||
    typeof expression.callee === 'undefined' ||
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
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'CallExpression' ||
    expression.callee === null ||
    typeof expression.callee === 'undefined' ||
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
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'CallExpression' ||
    expression.callee === null ||
    typeof expression.callee === 'undefined' ||
    expression.callee.type !== 'MemberExpression' ||
    !isNetSocketWriteMethod(expression.callee.property)
  ) {
    return
  }

  const callback = lastNetArgument(expression.args)

  if (callback !== null && typeof callback !== 'undefined' && callback.type === 'ArrowFunctionExpression') {
    registerNetHandler(handlers, 'socket-write', callback)
  }
}

function visitNetHandlerStatement(
  handlers: Map<string, CNetHandler>,
  context: CEmitContext,
  statement: AnyNode | null | undefined
): void {
  if (statement === null || typeof statement === 'undefined') {
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
    if (
      statement.init !== null &&
      typeof statement.init !== 'undefined' &&
      statement.init.type === 'VariableDeclaration'
    ) {
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
    if (handler !== null && typeof handler !== 'undefined') {
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
  if (expression === null || typeof expression === 'undefined') {
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
