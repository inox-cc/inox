import { diagnostic } from '../../../../compiler/diagnostics.ts'
import { collectIrTopLevelNodeEntries } from '../../../../compiler/ir.ts'
import type { AnyNode, IrProgram, SourceLocation } from '../../../../compiler/types.ts'
import type { CEmitContext, CFunctionContext } from '../../../../compiler/c/context.ts'
import {
  collectStdlibRuntimeImportNames,
  irProgramsUseStdlibRuntimeImport
} from '../../../../compiler/c/runtime-imports.ts'
import {
  createFunctionContext,
  emitRuntimeTypeCheck,
  nextCName,
  registerEventLoop
} from '../../../../compiler/c/context.ts'
import { cStringLiteral, utf8ByteLength } from '../../../../compiler/c/identifiers.ts'
import type {
  CDgramMessageHandler,
  CPreparedExpression as PreparedExpression,
  CPreparedStringBytesOperand as PreparedStringBytesOperand
} from '../../../../compiler/c/types.ts'
import { cookTemplateLiteralText } from '../../../../compiler/c/values/strings.ts'

type DgramMessageContext = {
  messageName: string | null
  rinfoName: string | null
  stringLocals: Map<string, string>
}

type DgramFunctionContext = CFunctionContext & {
  variables: Map<string, string>
}

type DgramAstNode = AnyNode

type DgramSocketCreateOptions = {
  declare: boolean | undefined
}

export function registerDgramRuntimeImportNames(context: CEmitContext, irPrograms: IrProgram[]): void {
  context.dgramImportNames = collectStdlibRuntimeImportNames(irPrograms, 'dgram', 'module-object')
  context.dgramCreateSocketNames = collectStdlibRuntimeImportNames(irPrograms, 'dgram', 'create-socket')
}

export function irProgramsUseDgramRuntimeImport(programs: IrProgram[]): boolean {
  return irProgramsUseStdlibRuntimeImport(programs, 'dgram')
}

export type DgramLoweringDependencies = {
  emitPreparedNumberExpression: (expression: DgramAstNode, context: CFunctionContext) => PreparedExpression
  emitPreparedStringBytesOperand: (
    expression: AnyNode,
    context: CFunctionContext,
    tempPrefix: string
  ) => PreparedStringBytesOperand
  emitReference: (expression: DgramAstNode, context: CFunctionContext) => string
  emitStatementList: (body: DgramAstNode[], context: CFunctionContext) => string[]
  findObjectLiteralPropertyValue: (expression: DgramAstNode, key: string) => DgramAstNode | null
  staticObjectBooleanPropertyValue: (expression: DgramAstNode, key: string) => boolean | null
  staticObjectStringPropertyValue: (expression: DgramAstNode, key: string) => string | null
}

type DgramTopLevelNodeEntry = {
  kind: string
  node: DgramAstNode
}

function dgramNodeLoc(node: DgramAstNode | null | undefined): SourceLocation | null {
  if (node === null || typeof node === 'undefined') {
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

function pushDgramNodes(target: DgramAstNode[], nodes: DgramAstNode[]): void {
  for (const node of nodes) {
    target.push(node)
  }
}

function dgramReferenceName(expression: DgramAstNode | null | undefined): string | null {
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

function dgramMemberObjectReferenceName(callee: DgramAstNode | null | undefined): string | null {
  if (callee === null || typeof callee === 'undefined' || callee.type !== 'MemberExpression') {
    return null
  }

  return dgramReferenceName(callee.object)
}

function pushIndentedDgramLines(target: string[], lines: string[]): void {
  for (const line of lines) {
    target.push('  ' + line)
  }
}

export function emitDgramMessageHandlerHead(wrapper: CDgramMessageHandler): string {
  return `static void ${wrapper.name}(void* user, DgramSocket inox_socket, inox::StringView inox_bytes, inox::StringView inox_host, int inox_port)`
}

export function emitDgramMessageHandlerDeclaration(
  wrapper: CDgramMessageHandler,
  baseContext: CEmitContext,
  deps: DgramLoweringDependencies
): string[] {
  const context: DgramFunctionContext = createFunctionContext(baseContext, 'void', false)
  const expression = wrapper.expression
  const firstParam = expression.params[0]
  const secondParam = expression.params[1]
  let messageName: string | null = null
  let rinfoName: string | null = null

  if (firstParam !== null && typeof firstParam !== 'undefined') {
    messageName = firstParam.name
  }

  if (secondParam !== null && typeof secondParam !== 'undefined') {
    rinfoName = secondParam.name
  }

  const dgramContext: DgramMessageContext = {
    messageName: messageName,
    rinfoName: rinfoName,
    stringLocals: new Map()
  }
  if (messageName !== null && typeof messageName !== 'undefined') {
    context.variables.set(messageName, 'string')
  }

  if (rinfoName !== null && typeof rinfoName !== 'undefined') {
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

  if (messageName === null || typeof messageName === 'undefined') {
    lines.push('  (void)inox_bytes;')
  }

  if (rinfoName === null || typeof rinfoName === 'undefined') {
    lines.push('  (void)inox_host;')
    lines.push('  (void)inox_port;')
  }

  for (const statement of body) {
    pushIndentedDgramLines(lines, emitDgramMessageHandlerStatement(statement, dgramContext, context, deps))
  }

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

  const socketName = dgramMemberObjectReferenceName(statement.init.callee)

  if (socketName === null || typeof socketName === 'undefined') {
    return null
  }

  let method = 'address'

  if (statement.init.callee.property === 'remoteAddress') {
    method = 'remoteAddress'
  }

  context.variables.set(statement.name, 'dgram-address')

  return emitDgramStatementWithThrownCheck(`DgramAddress ${statement.name} = ${socketName}.${method}();`, context)
}

export function emitDgramNumberVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[] | null {
  const init = statement.init

  if (
    init === null ||
    typeof init === 'undefined' ||
    init.type !== 'CallExpression' ||
    init.callee === null ||
    typeof init.callee === 'undefined' ||
    init.callee.type !== 'MemberExpression'
  ) {
    return null
  }

  const socketName = dgramMemberObjectReferenceName(init.callee)

  if (
    socketName === null ||
    typeof socketName === 'undefined' ||
    context.variables.get(socketName) !== 'dgram-socket'
  ) {
    return null
  }

  const method = init.callee.property
  let facadeMethod: string | null = null

  if (method === 'getSendBufferSize') {
    facadeMethod = 'getSendBufferSize'
  } else if (method === 'getRecvBufferSize') {
    facadeMethod = 'getRecvBufferSize'
  }

  if (facadeMethod === null || typeof facadeMethod === 'undefined') {
    return null
  }

  context.variables.set(statement.name, 'number')

  return emitDgramStatementWithThrownCheck(`double ${statement.name} = (double)${socketName}.${facadeMethod}();`, context)
}

export function emitDgramSocketCallStatement(
  expression: AnyNode,
  context: CFunctionContext,
  deps: DgramLoweringDependencies
): string[] | null {
  const callee = expression.callee

  if (
    callee !== null &&
    typeof callee !== 'undefined' &&
    callee.type === 'MemberExpression' &&
    callee.property === 'bind' &&
    isDgramCreateSocketCall(callee.object, context)
  ) {
    const socketName = nextCName(context, 'inox_dgram_socket')
    const lines = [`DgramSocket ${socketName};`]
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
    const socketName = dgramMemberObjectReferenceName(expression.callee)

    if (socketName === null || typeof socketName === 'undefined') {
      return null
    }

    registerEventLoop(context)

    return emitDgramBindLines(socketName, expression.args, context, deps)
  }

  if (isDgramSocketMethodCall(expression, 'on', context)) {
    const socketName = dgramMemberObjectReferenceName(expression.callee)

    if (socketName === null || typeof socketName === 'undefined') {
      return null
    }

    return emitDgramOnLines(socketName, expression.args, context)
  }

  if (isDgramSocketMethodCall(expression, 'connect', context)) {
    const socketName = dgramMemberObjectReferenceName(expression.callee)

    if (socketName === null || typeof socketName === 'undefined') {
      return null
    }

    return emitDgramConnectLines(socketName, expression.args, context, deps)
  }

  if (isDgramSocketMethodCall(expression, 'disconnect', context)) {
    const socketName = dgramMemberObjectReferenceName(expression.callee)

    if (socketName === null || typeof socketName === 'undefined') {
      return null
    }

    return emitDgramDisconnectLines(socketName, expression.args, context)
  }

  if (isDgramSocketMethodCall(expression, 'send', context)) {
    const socketName = dgramMemberObjectReferenceName(expression.callee)

    if (socketName === null || typeof socketName === 'undefined') {
      return null
    }

    return emitDgramSendLines(socketName, expression.args, context, deps, null)
  }

  const optionCall = emitDgramSocketOptionCallStatement(expression, context, deps)

  if (optionCall !== null && typeof optionCall !== 'undefined') {
    return optionCall
  }

  if (isDgramSocketMethodCall(expression, 'close', context)) {
    const socketName = dgramMemberObjectReferenceName(expression.callee)

    if (socketName === null || typeof socketName === 'undefined') {
      return null
    }

    return emitDgramCloseLines(socketName, expression.args, context, deps)
  }

  if (isDgramSocketAnyMethodCall(expression, context)) {
    let loc = dgramNodeLoc(expression)
    let property = 'unknown'

    if (callee !== null && typeof callee !== 'undefined') {
      property = callee.property

      if (callee.loc !== null && typeof callee.loc !== 'undefined') {
        loc = callee.loc
      }
    }

    context.diagnostics.push(
      diagnostic('INOX_DGRAM_SOCKET', `socket.${property} is not supported by the current C dgram backend slice`, loc)
    )
    return []
  }

  return null
}

export function emitPreparedDgramAddressPortExpression(
  expression: AnyNode | null | undefined,
  context: CFunctionContext
): PreparedExpression | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  const addressName = dgramReferenceName(expression.object)

  if (
    expression.type !== 'MemberExpression' ||
    expression.property !== 'port' ||
    addressName === null ||
    typeof addressName === 'undefined' ||
    context.variables.get(addressName) !== 'dgram-address'
  ) {
    return null
  }

  return {
    lines: [],
    expression: addressName + '.port'
  }
}

export function collectDgramMessageHandlers(
  irPrograms: IrProgram[],
  context: CEmitContext
): Map<string, CDgramMessageHandler> {
  const handlers: Map<string, CDgramMessageHandler> = new Map()
  const programs: IrProgram[] = irPrograms

  for (const ir of programs) {
    const items: DgramTopLevelNodeEntry[] = collectIrTopLevelNodeEntries(ir)

    for (let itemIndex = 0; itemIndex < items.length; itemIndex = itemIndex + 1) {
      const item = items[itemIndex]

      if (item.kind === 'function') {
        const statements: DgramAstNode[] = item.node.body

        for (const statement of statements) {
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
  handlers: Map<string, CDgramMessageHandler>,
  expression: AnyNode | null | undefined
): void {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'ArrowFunctionExpression') {
    return
  }

  const existingName = dgramMessageHandlerName(expression)

  if (existingName !== null && typeof existingName !== 'undefined' && handlers.has(existingName)) {
    return
  }

  const name = `inox_dgram_message_handler_${handlers.size}`
  expression.dgramMessageHandlerName = name

  handlers.set(name, {
    name: name,
    expression: expression
  })
}

function dgramMessageHandlerName(expression: AnyNode | null | undefined): string | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  const name = expression.dgramMessageHandlerName

  if (name === null || typeof name === 'undefined') {
    return null
  }

  return name
}

function findDgramMessageHandler(
  context: CFunctionContext,
  expression: AnyNode | null | undefined
): CDgramMessageHandler | null {
  const name = dgramMessageHandlerName(expression)

  if (name === null || typeof name === 'undefined') {
    return null
  }

  const handler = context.dgramMessageHandlers.get(name)

  if (handler === null || typeof handler === 'undefined') {
    return null
  }

  return handler
}

function visitDgramMessageHandlerStatement(
  handlers: Map<string, CDgramMessageHandler>,
  context: CEmitContext,
  statement: AnyNode | null | undefined
): void {
  if (statement === null || typeof statement === 'undefined') {
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
    const statements: DgramAstNode[] = statement.body

    for (const item of statements) {
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
    if (
      statement.init !== null &&
      typeof statement.init !== 'undefined' &&
      statement.init.type === 'VariableDeclaration'
    ) {
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
    const cases: DgramAstNode[] = statement.cases

    for (const item of cases) {
      visitDgramMessageHandlerExpression(handlers, context, item.test)
      const consequents: DgramAstNode[] = item.consequent

      for (const consequent of consequents) {
        visitDgramMessageHandlerStatement(handlers, context, consequent)
      }
    }
    return
  }

  if (statement.type === 'TryStatement') {
    const handler = statement.handler
    visitDgramMessageHandlerStatement(handlers, context, statement.block)
    if (handler !== null && typeof handler !== 'undefined') {
      visitDgramMessageHandlerStatement(handlers, context, handler.body)
    }
    visitDgramMessageHandlerStatement(handlers, context, statement.finalizer)
  }
}

function visitDgramMessageHandlerExpression(
  handlers: Map<string, CDgramMessageHandler>,
  context: CEmitContext,
  expression: AnyNode | null | undefined
): void {
  if (expression === null || typeof expression === 'undefined') {
    return
  }

  if (expression.type === 'CallExpression') {
    const callee = expression.callee

    if (isDgramCreateSocketCall(expression, context)) {
      registerDgramMessageHandler(handlers, emitDgramCreateSocketMessageListener(expression))
    }

    if (
      callee !== null &&
      typeof callee !== 'undefined' &&
      callee.type === 'MemberExpression' &&
      callee.property === 'on' &&
      expression.args[0] !== null &&
      typeof expression.args[0] !== 'undefined' &&
      expression.args[0].type === 'StringLiteral' &&
      expression.args[0].value === 'message'
    ) {
      registerDgramMessageHandler(handlers, expression.args[1])
    }

    visitDgramMessageHandlerExpression(handlers, context, callee)
    const args: DgramAstNode[] = expression.args

    for (const arg of args) {
      visitDgramMessageHandlerExpression(handlers, context, arg)
    }
    return
  }

  if (expression.type === 'OptionalCallExpression' || expression.type === 'NewExpression') {
    visitDgramMessageHandlerExpression(handlers, context, expression.callee)
    const args: DgramAstNode[] = expression.args

    for (const arg of args) {
      visitDgramMessageHandlerExpression(handlers, context, arg)
    }
    return
  }

  if (expression.type === 'ArrowFunctionExpression') {
    if (expression.expressionBody) {
      visitDgramMessageHandlerExpression(handlers, context, expression.body)
    } else {
      const statements: DgramAstNode[] = expression.body

      for (const statement of statements) {
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
    const elements: DgramAstNode[] = expression.elements

    for (const element of elements) {
      visitDgramMessageHandlerExpression(handlers, context, element)
    }
    return
  }

  if (expression.type === 'ObjectLiteral') {
    const properties: DgramAstNode[] = expression.properties

    for (const property of properties) {
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
  if (statement === null || typeof statement === 'undefined') {
    return []
  }

  if (statement.type === 'BlockStatement') {
    const lines = ['{']
    const statements: DgramAstNode[] = statement.body

    for (const item of statements) {
      pushIndentedDgramLines(lines, emitDgramMessageHandlerStatement(item, dgramContext, context, deps))
    }

    lines.push('}')
    return lines
  }

  if (statement.type === 'VariableDeclaration') {
    const stringValue = emitDgramStaticStringValue(statement.init, dgramContext)

    if (stringValue !== null && typeof stringValue !== 'undefined') {
      dgramContext.stringLocals.set(statement.name, stringValue)
      return []
    }

    context.diagnostics.push(
      diagnostic(
        'INOX_DGRAM_HANDLER',
        'dgram message listeners in the C++ backend currently support only static string local declarations',
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
    const call = emitDgramMessageHandlerSocketCallStatement(statement.expression, dgramContext, context, deps)

    if (call !== null && typeof call !== 'undefined') {
      return call
    }
  }

  if (statement.type === 'ReturnStatement') {
    if (
      statement.argument !== null &&
      typeof statement.argument !== 'undefined' &&
      statement.argument.type === 'CallExpression'
    ) {
      const call = emitDgramMessageHandlerSocketCallStatement(statement.argument, dgramContext, context, deps)

      if (call !== null && typeof call !== 'undefined') {
        const lines: string[] = []

        pushDgramLines(lines, call)
        lines.push('return;')

        return lines
      }
    }

    return ['return;']
  }

  context.diagnostics.push(
    diagnostic(
      'INOX_DGRAM_HANDLER',
      'this dgram message listener statement is not supported by the current C++ backend slice',
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
    expression.callee === null ||
    typeof expression.callee === 'undefined' ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.object === null ||
    typeof expression.callee.object === 'undefined' ||
    expression.callee.object.type !== 'Reference'
  ) {
    return null
  }

  if (expression.callee.property === 'send') {
    return emitDgramSendLines('inox_socket', expression.args, context, deps, dgramContext)
  }

  if (expression.callee.property === 'close') {
    return ['inox_socket.close();']
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

  if (listener !== null && typeof listener !== 'undefined') {
    const registeredWrapper = findDgramMessageHandler(context, listener)

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
        'INOX_DGRAM_SOCKET',
        'dgram.createSocket in the C++ backend currently requires an inline message listener callback',
        listener.loc
      )
    )
  }

  const lines: string[] = []

  if (options === null || typeof options === 'undefined' || options.declare !== false) {
    lines.push(`DgramSocket ${socketName};`)
  }

  let wrapperName = '0'

  if (wrapper !== null && typeof wrapper !== 'undefined') {
    wrapperName = wrapper.name
  }

  lines.push(`${socketName} = DgramSocket::create(${wrapperName}, 0);`)
  pushDgramLines(lines, emitDgramThrownCheck(context))

  if (wrapper !== null && typeof wrapper !== 'undefined') {
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

  if (firstArg !== null && typeof firstArg !== 'undefined' && firstArg.type === 'ObjectLiteral') {
    options = firstArg
  }

  let firstIsCallback = false

  if (firstArg !== null && typeof firstArg !== 'undefined' && firstArg.type === 'ArrowFunctionExpression') {
    firstIsCallback = true
  }

  let portArg: AnyNode | null | undefined = null
  let hostArg: AnyNode | null | undefined = null
  let callback: AnyNode | null | undefined = null

  if (options === null || typeof options === 'undefined') {
    if (!firstIsCallback) {
      portArg = firstArg
    }

    if (secondArg !== null && typeof secondArg !== 'undefined' && secondArg.type === 'ArrowFunctionExpression') {
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

  if (options !== null && typeof options !== 'undefined') {
    maxArgCount = 2
  }

  if (args.length > maxArgCount) {
    context.diagnostics.push(
      diagnostic(
        'INOX_DGRAM_SOCKET',
        'socket.bind in the C++ backend currently supports port, optional address and optional callback',
        dgramNodeLoc(lastDgramArgument(args))
      )
    )
  }

  let port: PreparedExpression = {
    lines: [],
    expression: '0'
  }

  if (portArg !== null && typeof portArg !== 'undefined') {
    port = emitDgramPortExpression(portArg, null, context, deps)
  }

  const host = emitDgramHostExpression(hostArg, null, context, deps)
  let flags = '0'

  if (context.dgramReuseAddrSockets.has(socketName)) {
    flags = 'INOX_DGRAM_BIND_REUSEADDR'
  }

  const lines: string[] = []

  pushDgramLines(lines, port.lines)
  lines.push(`${socketName}.bind(${host}, (int)(${port.expression}), ${flags});`)
  pushDgramLines(lines, emitDgramThrownCheck(context))

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

  if (
    eventArg === null ||
    typeof eventArg === 'undefined' ||
    eventArg.type !== 'StringLiteral' ||
    eventArg.value !== 'message'
  ) {
    context.diagnostics.push(
      diagnostic(
        'INOX_DGRAM_SOCKET',
        "socket.on in the C++ backend currently supports only the 'message' event",
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

  if (listener !== null && typeof listener !== 'undefined') {
    const registeredWrapper = findDgramMessageHandler(context, listener)

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
        'INOX_DGRAM_SOCKET',
        "socket.on('message') in the C++ backend currently requires an inline message listener",
        dgramNodeLoc(listener)
      )
    )
    return []
  }

  context.dgramMessageSockets.add(socketName)

  const lines = [`${socketName}.onMessage(${wrapper.name}, 0);`]
  pushDgramLines(lines, emitDgramThrownCheck(context))

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
        'INOX_DGRAM_SOCKET',
        'socket.connect in the C++ backend currently requires a port argument',
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

  if (secondArg !== null && typeof secondArg !== 'undefined' && secondArg.type === 'ArrowFunctionExpression') {
    hostArg = null
    callback = secondArg
  }

  const port = emitDgramPortExpression(args[0], null, context, deps)
  const host = emitDgramHostExpression(hostArg, null, context, deps)

  if (args.length > 3) {
    context.diagnostics.push(
      diagnostic(
        'INOX_DGRAM_SOCKET',
        'socket.connect in the C++ backend currently supports port, optional address and optional callback',
        dgramNodeLoc(args[3])
      )
    )
  }

  const lines: string[] = []

  pushDgramLines(lines, port.lines)
  lines.push(`${socketName}.connect(${host}, (int)(${port.expression}));`)
  pushDgramLines(lines, emitDgramThrownCheck(context))
  pushDgramLines(lines, emitDgramZeroArgCallbackLines(callback, context, deps))

  return lines
}

function emitDgramDisconnectLines(socketName: string, args: AnyNode[], context: CFunctionContext): string[] {
  if (args.length > 0) {
    context.diagnostics.push(
      diagnostic(
        'INOX_DGRAM_SOCKET',
        'socket.disconnect in the C++ backend does not take arguments',
        dgramNodeLoc(args[0])
      )
    )
  }

  return emitDgramStatementWithThrownCheck(`${socketName}.disconnect();`, context)
}

function emitDgramSocketOptionCallStatement(
  expression: AnyNode,
  context: CFunctionContext,
  deps: DgramLoweringDependencies
): string[] | null {
  const socketName = dgramMemberObjectReferenceName(expression.callee)

  if (
    expression.type !== 'CallExpression' ||
    expression.callee === null ||
    typeof expression.callee === 'undefined' ||
    expression.callee.type !== 'MemberExpression' ||
    socketName === null ||
    typeof socketName === 'undefined' ||
    context.variables.get(socketName) !== 'dgram-socket'
  ) {
    return null
  }

  const method = expression.callee.property

  if (method === 'setBroadcast') {
    const enabled = deps.emitPreparedNumberExpression(expression.args[0], context)
    const lines: string[] = []

    pushDgramLines(lines, enabled.lines)
    lines.push(`${socketName}.setBroadcast(${enabled.expression} != 0);`)
    pushDgramLines(lines, emitDgramThrownCheck(context))

    return lines
  }

  if (method === 'setTTL') {
    const ttl = deps.emitPreparedNumberExpression(expression.args[0], context)
    const lines: string[] = []

    pushDgramLines(lines, ttl.lines)
    lines.push(`${socketName}.setTTL((int)(${ttl.expression}));`)
    pushDgramLines(lines, emitDgramThrownCheck(context))

    return lines
  }

  if (method === 'setSendBufferSize' || method === 'setRecvBufferSize') {
    let facadeMethod = 'setRecvBufferSize'

    if (method === 'setSendBufferSize') {
      facadeMethod = 'setSendBufferSize'
    }

    const size = deps.emitPreparedNumberExpression(expression.args[0], context)
    const lines: string[] = []

    pushDgramLines(lines, size.lines)
    lines.push(`${socketName}.${facadeMethod}((int)(${size.expression}));`)
    pushDgramLines(lines, emitDgramThrownCheck(context))

    return lines
  }

  if (method === 'ref' || method === 'unref') {
    if (expression.args.length > 0) {
      context.diagnostics.push(
        diagnostic(
          'INOX_DGRAM_SOCKET',
          `socket.${method} in the C++ backend does not take arguments`,
          dgramNodeLoc(expression.args[0])
        )
      )
    }

    let facadeMethod = 'unref'

    if (method === 'ref') {
      facadeMethod = 'ref'
    }

    return emitDgramStatementWithThrownCheck(`${socketName}.${facadeMethod}();`, context)
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
  const socketExpression = dgramContext === null || typeof dgramContext === 'undefined'
    ? socketName
    : socketName
  const lastArg = lastDgramArgument(args)
  let callback: AnyNode | null = null

  if (lastArg !== null && typeof lastArg !== 'undefined' && lastArg.type === 'ArrowFunctionExpression') {
    callback = lastArg
  }

  let callbackOffset = 0

  if (callback !== null && typeof callback !== 'undefined') {
    callbackOffset = 1
  }

  if (args.length - callbackOffset === 1) {
    const body = emitDgramBytesOperand(args[0], dgramContext, context, deps)
    const lines: string[] = []

    pushDgramLines(lines, body.lines)
    lines.push(`${socketExpression}.send(inox::StringView(${body.bytes}, ${body.length}));`)
    pushDgramLines(lines, emitDgramThrownCheck(context))
    pushDgramLines(lines, emitDgramZeroArgCallbackLines(callback, context, deps))

    return lines
  }

  if (args.length < 3) {
    context.diagnostics.push(
      diagnostic(
        'INOX_DGRAM_SOCKET',
        'socket.send in the C++ backend currently requires message, port and address arguments, or a connected socket message form',
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
    const offsetPortArg = args[3] ?? null
    const offsetHostArg = args[4] ?? null

    if (
      offsetPortArg !== null &&
      typeof offsetPortArg !== 'undefined' &&
      offsetHostArg !== null &&
      typeof offsetHostArg !== 'undefined'
    ) {
      portArg = offsetPortArg
      hostArg = offsetHostArg
    }
  }

  if (hasOffsetLength) {
    context.diagnostics.push(
      diagnostic(
        'INOX_DGRAM_SOCKET',
        'socket.send offset/length arguments are not supported by the current C++ backend slice yet',
        dgramNodeLoc(args[1])
      )
    )
  }

  const port = emitDgramPortExpression(portArg, dgramContext, context, deps)
  const host = emitDgramHostExpression(hostArg, dgramContext, context, deps)

  const lines: string[] = []

  pushDgramLines(lines, body.lines)
  pushDgramLines(lines, port.lines)
  lines.push(`${socketExpression}.send(inox::StringView(${body.bytes}, ${body.length}), ${host}, (int)(${port.expression}));`)
  pushDgramLines(lines, emitDgramThrownCheck(context))
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
        'INOX_DGRAM_SOCKET',
        'socket.close in the C++ backend supports only an optional callback',
        dgramNodeLoc(args[1])
      )
    )
  }

  const lines = [`${socketName}.close();`]

  pushDgramLines(lines, emitDgramZeroArgCallbackLines(args[0], context, deps))

  return lines
}

function emitDgramMaybeRecvStartLines(socketName: string, context: CFunctionContext): string[] {
  if (!context.dgramBoundSockets.has(socketName) || !context.dgramMessageSockets.has(socketName)) {
    return []
  }

  return emitDgramStatementWithThrownCheck(`${socketName}.recvStart();`, context)
}

function emitDgramStatementWithThrownCheck(statement: string, context: CFunctionContext): string[] {
  const lines = [statement]
  pushDgramLines(lines, emitDgramThrownCheck(context))
  return lines
}

function emitDgramThrownCheck(context: CFunctionContext): string[] {
  return [emitRuntimeTypeCheck('inox::thrown()', context)]
}

function emitDgramBytesOperand(
  expression: AnyNode,
  dgramContext: DgramMessageContext | null,
  context: CFunctionContext,
  deps: DgramLoweringDependencies
): PreparedStringBytesOperand {
  const expressionName = dgramReferenceName(expression)

  if (
    dgramContext !== null &&
    typeof dgramContext !== 'undefined' &&
    dgramContext.messageName !== null &&
    typeof dgramContext.messageName !== 'undefined' &&
    expressionName === dgramContext.messageName
  ) {
    return {
      lines: [],
      bytes: 'inox_bytes.bytes',
      length: 'inox_bytes.len'
    }
  }

  const staticValue = emitDgramStaticStringValue(expression, dgramContext)

  if (staticValue !== null && typeof staticValue !== 'undefined') {
    return {
      lines: [],
      bytes: cStringLiteral(staticValue),
      length: `${utf8ByteLength(staticValue)}`
    }
  }

  return deps.emitPreparedStringBytesOperand(expression, context, 'inox_dgram_string')
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
      expression: 'inox_port'
    }
  }

  const addressPort = emitPreparedDgramAddressPortExpression(expression, context)

  if (addressPort !== null && typeof addressPort !== 'undefined') {
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
  if (expression === null || typeof expression === 'undefined') {
    return '0'
  }

  const rinfo = resolveDgramRinfoMember(expression, dgramContext)

  if (rinfo === 'address') {
    return 'inox_host.bytes'
  }

  const addressMember = resolveDgramAddressStringMember(expression, context)

  if (addressMember !== null && typeof addressMember !== 'undefined') {
    return addressMember
  }

  if (expression.type === 'StringLiteral') {
    return cStringLiteral(expression.value)
  }

  if (expression.type === 'TemplateLiteral' && !expression.raw.includes('${')) {
    return cStringLiteral(cookTemplateLiteralText(expression.raw.slice(1, -1)))
  }

  const expressionName = dgramReferenceName(expression)

  if (
    expressionName !== null &&
    typeof expressionName !== 'undefined' &&
    context.variables.get(expressionName) === 'string'
  ) {
    return deps.emitReference(expression, context)
  }

  context.diagnostics.push(
    diagnostic(
      'INOX_DGRAM_SOCKET',
      'socket host/address arguments in the C++ backend currently must be static strings or rinfo.address',
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
  const addressName = dgramReferenceName(expression.object)

  if (
    expression.type !== 'MemberExpression' ||
    !isDgramAddressStringProperty(expression.property) ||
    addressName === null ||
    typeof addressName === 'undefined' ||
    context.variables.get(addressName) !== 'dgram-address'
  ) {
    return null
  }

  if (expression.property === 'family') {
    return `${addressName}.family.bytes`
  }

  return `${addressName}.address`
}

function resolveDgramRinfoMember(
  expression: AnyNode | null | undefined,
  dgramContext: DgramMessageContext | null
): string | null {
  let objectName: string | null = null

  if (expression !== null && typeof expression !== 'undefined') {
    objectName = dgramReferenceName(expression.object)
  }

  if (
    dgramContext === null ||
    typeof dgramContext === 'undefined' ||
    dgramContext.rinfoName === null ||
    typeof dgramContext.rinfoName === 'undefined' ||
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'MemberExpression' ||
    objectName !== dgramContext.rinfoName
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
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  if (expression.type === 'StringLiteral') {
    return expression.value
  }

  if (expression.type === 'TemplateLiteral' && !expression.raw.includes('${')) {
    return cookTemplateLiteralText(expression.raw.slice(1, -1))
  }

  if (expression.type === 'Reference' && expression.path.length === 1) {
    if (dgramContext !== null && typeof dgramContext !== 'undefined') {
      return emitDgramStaticStringLocalValue(expression, dgramContext)
    }
  }

  return null
}

function emitDgramStaticStringLocalValue(expression: AnyNode, dgramContext: DgramMessageContext): string | null {
  const name = dgramReferenceName(expression)

  if (name === null || typeof name === 'undefined') {
    return null
  }

  const value = dgramContext.stringLocals.get(name)

  if (value !== null && typeof value !== 'undefined') {
    return value
  }

  return null
}

function emitDgramZeroArgCallbackLines(
  callback: AnyNode | null | undefined,
  context: CFunctionContext,
  deps: DgramLoweringDependencies
): string[] {
  if (callback === null || typeof callback === 'undefined') {
    return []
  }

  if (callback.type !== 'ArrowFunctionExpression' || callback.params.length !== 0 || callback.async === true) {
    context.diagnostics.push(
      diagnostic(
        'INOX_DGRAM_SOCKET',
        'dgram socket callbacks in the C++ backend currently require a synchronous zero-argument arrow function',
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
  if (!isDgramSocketAnyMethodCall(expression, context)) {
    return false
  }

  const callee = expression.callee

  if (callee === null || typeof callee === 'undefined' || callee.type !== 'MemberExpression') {
    return false
  }

  const property: string = callee.property

  return property === method
}

function isDgramSocketAnyMethodCall(expression: AnyNode, context: CFunctionContext): boolean {
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

  const socketName = dgramMemberObjectReferenceName(expression.callee)

  return (
    socketName !== null && typeof socketName !== 'undefined' && context.variables.get(socketName) === 'dgram-socket'
  )
}

function isDgramAddressCall(expression: AnyNode | null | undefined, context: CFunctionContext): boolean {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'CallExpression') {
    return false
  }

  if (
    expression.callee === null ||
    typeof expression.callee === 'undefined' ||
    expression.callee.type !== 'MemberExpression'
  ) {
    return false
  }

  if (expression.callee.property !== 'address' && expression.callee.property !== 'remoteAddress') {
    return false
  }

  const socketName = dgramMemberObjectReferenceName(expression.callee)

  return (
    socketName !== null && typeof socketName !== 'undefined' && context.variables.get(socketName) === 'dgram-socket'
  )
}

function isDgramCreateSocketCall(expression: AnyNode | null | undefined, context: CEmitContext): boolean {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'CallExpression') {
    return false
  }

  const calleeName = dgramReferenceName(expression.callee)

  if (calleeName !== null && typeof calleeName !== 'undefined' && context.dgramCreateSocketNames.has(calleeName)) {
    return true
  }

  const importName = dgramMemberObjectReferenceName(expression.callee)

  return (
    expression.callee !== null &&
    typeof expression.callee !== 'undefined' &&
    expression.callee.type === 'MemberExpression' &&
    expression.callee.property === 'createSocket' &&
    importName !== null &&
    typeof importName !== 'undefined' &&
    context.dgramImportNames.has(importName)
  )
}

function emitDgramCreateSocketMessageListener(expression: AnyNode): AnyNode | null {
  if (
    expression.args[0] !== null &&
    typeof expression.args[0] !== 'undefined' &&
    expression.args[0].type === 'ArrowFunctionExpression'
  ) {
    return expression.args[0]
  }

  if (
    expression.args[1] !== null &&
    typeof expression.args[1] !== 'undefined' &&
    expression.args[1].type === 'ArrowFunctionExpression'
  ) {
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

  if (expression !== null && typeof expression !== 'undefined' && expression.type === 'StringLiteral') {
    typeValue = expression.value
  } else if (expression !== null && typeof expression !== 'undefined' && expression.type === 'ObjectLiteral') {
    typeValue = deps.staticObjectStringPropertyValue(expression, 'type')
  }

  if (typeValue === 'udp4') {
    return
  }

  context.diagnostics.push(
    diagnostic(
      'INOX_DGRAM_SOCKET',
      "dgram.createSocket in the C++ backend currently supports only the 'udp4' socket type",
      dgramNodeLoc(expression)
    )
  )
}
