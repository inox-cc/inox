import type { CEmitContext, CFunctionContext } from '../../c/context.ts'
import type { CPreparedExpression as PreparedExpression } from '../../c/types.ts'
import type { AnyNode, IrGlobalUsage, IrProgram } from '../../types.ts'
import type { DgramLoweringDependencies as PackageDgramLoweringDependencies } from '../../../stdlib/node/dgram/compiler/c.ts'
import {
  collectDgramMessageHandlers,
  emitDgramAddressVariableDeclaration,
  emitDgramMessageHandlerDeclaration,
  emitDgramMessageHandlerHead,
  emitDgramNumberVariableDeclaration,
  emitPreparedDgramAddressPortExpression,
  emitDgramSocketCallStatement,
  emitDgramSocketVariableDeclaration,
  irProgramsUseDgramRuntimeImport,
  registerDgramRuntimeImportNames
} from '../../../stdlib/node/dgram/compiler/c.ts'
import { isSupportedNodeDgramCGlobalUsage } from '../../../stdlib/node/dgram/compiler/descriptor.ts'
import type { HttpLoweringDependencies as PackageHttpLoweringDependencies } from '../../../stdlib/node/http/compiler/c.ts'
import {
  collectHttpHandlers,
  emitHttpHandlerDeclaration,
  emitHttpHandlerHead,
  emitHttpServerCallStatement,
  emitHttpServerVariableDeclaration,
  irProgramsUseHttpRuntimeImport,
  registerHttpRuntimeImportNames
} from '../../../stdlib/node/http/compiler/c.ts'
import { isSupportedNodeHttpCGlobalUsage } from '../../../stdlib/node/http/compiler/descriptor.ts'
import type { NetLoweringDependencies as PackageNetLoweringDependencies } from '../../../stdlib/node/net/compiler/c.ts'
import {
  collectNetHandlers,
  emitNetHandlerDeclaration,
  emitNetHandlerHead,
  emitNetAddressMemberVariableDeclaration,
  emitNetAddressVariableDeclaration,
  emitNetNumberVariableDeclaration,
  emitPreparedNetAddressPortExpression,
  emitNetServerCallStatement,
  emitNetServerVariableDeclaration,
  emitNetSocketCallStatement,
  emitNetSocketVariableDeclaration,
  irProgramsUseNetRuntimeImport,
  registerNetRuntimeImportNames,
  resolveNetAddressStringMember
} from '../../../stdlib/node/net/compiler/c.ts'
import { isSupportedNodeNetCGlobalUsage } from '../../../stdlib/node/net/compiler/descriptor.ts'
import type { TimerLoweringDependencies as PackageTimerLoweringDependencies } from '../../../stdlib/node/timers/compiler/c.ts'

export {
  emitPreparedTimerCallExpression,
  emitTimerVariableDeclaration,
  isTimerStartCallExpression,
  timerCallbackFunctionType
} from '../../../stdlib/node/timers/compiler/c.ts'

export type DgramLoweringDependencies = PackageDgramLoweringDependencies
export type HttpLoweringDependencies = PackageHttpLoweringDependencies
export type NetLoweringDependencies = PackageNetLoweringDependencies
export type TimerLoweringDependencies = PackageTimerLoweringDependencies

export type NodeNetworkLoweringDependencies = {
  dgram: DgramLoweringDependencies
  http: HttpLoweringDependencies
  net: NetLoweringDependencies
}

type NodeCGlobalNameSet = Set<string>

export type NodeStdlibCGlobalUsageContext = {
  dgramCreateSocketNames?: NodeCGlobalNameSet
  dgramImportNames?: NodeCGlobalNameSet
  httpCreateServerNames?: NodeCGlobalNameSet
  httpImportNames?: NodeCGlobalNameSet
  netConnectNames?: NodeCGlobalNameSet
  netCreateServerNames?: NodeCGlobalNameSet
  netImportNames?: NodeCGlobalNameSet
}

export type NodeStdlibRuntimeImportUsage = {
  dgram: boolean
  http: boolean
  net: boolean
}

export function registerNodeStdlibRuntimeImportNames(context: CEmitContext, irPrograms: IrProgram[]): void {
  registerDgramRuntimeImportNames(context, irPrograms)
  registerHttpRuntimeImportNames(context, irPrograms)
  registerNetRuntimeImportNames(context, irPrograms)
}

export function nodeStdlibRuntimeImportUsage(irPrograms: IrProgram[]): NodeStdlibRuntimeImportUsage {
  return {
    dgram: irProgramsUseDgramRuntimeImport(irPrograms),
    http: irProgramsUseHttpRuntimeImport(irPrograms),
    net: irProgramsUseNetRuntimeImport(irPrograms)
  }
}

export function isSupportedNodeStdlibCGlobalUsage(
  usage: IrGlobalUsage,
  context: NodeStdlibCGlobalUsageContext
): boolean {
  return (
    isSupportedNodeDgramCGlobalUsage(usage, context) ||
    isSupportedNodeHttpCGlobalUsage(usage, context) ||
    isSupportedNodeNetCGlobalUsage(usage, context)
  )
}

function pushNodeStdlibLines(target: string[], lines: string[]): void {
  for (const line of lines) {
    target.push(line)
  }
}

export function collectNodeNetworkHandlers(irPrograms: IrProgram[], context: CEmitContext): void {
  context.dgramMessageHandlers = collectDgramMessageHandlers(irPrograms, context)
  context.httpHandlers = collectHttpHandlers(irPrograms, context)
  context.netHandlers = collectNetHandlers(irPrograms, context)
}

export function hasNodeNetworkHandlers(context: CEmitContext): boolean {
  return context.dgramMessageHandlers.size > 0 || context.httpHandlers.size > 0 || context.netHandlers.size > 0
}

export function emitNodeNetworkHandlerPrototypeLines(context: CEmitContext): string[] {
  const lines: string[] = []

  for (const wrapper of context.dgramMessageHandlers.values()) {
    lines.push(`${emitDgramMessageHandlerHead(wrapper)};`)
  }

  for (const wrapper of context.httpHandlers.values()) {
    lines.push(`${emitHttpHandlerHead(wrapper)};`)
  }

  for (const wrapper of context.netHandlers.values()) {
    lines.push(`${emitNetHandlerHead(wrapper)};`)
  }

  return lines
}

export function emitNodeNetworkHandlerDeclarations(
  context: CEmitContext,
  deps: NodeNetworkLoweringDependencies
): string[] {
  const lines: string[] = []

  for (const wrapper of context.dgramMessageHandlers.values()) {
    pushNodeStdlibLines(lines, emitDgramMessageHandlerDeclaration(wrapper, context, deps.dgram))
    lines.push('')
  }

  for (const wrapper of context.httpHandlers.values()) {
    pushNodeStdlibLines(lines, emitHttpHandlerDeclaration(wrapper, context, deps.http))
    lines.push('')
  }

  for (const wrapper of context.netHandlers.values()) {
    pushNodeStdlibLines(lines, emitNetHandlerDeclaration(wrapper, context, deps.net))
    lines.push('')
  }

  return lines
}

export function emitNodeNetworkVariableDeclaration(
  statement: AnyNode,
  context: CFunctionContext,
  deps: NodeNetworkLoweringDependencies
): string[] | null {
  const dgramSocket = emitDgramSocketVariableDeclaration(statement, context, deps.dgram)

  if (dgramSocket !== null && typeof dgramSocket !== 'undefined') {
    return dgramSocket
  }

  const dgramNumber = emitDgramNumberVariableDeclaration(statement, context)

  if (dgramNumber !== null && typeof dgramNumber !== 'undefined') {
    return dgramNumber
  }

  const dgramAddress = emitDgramAddressVariableDeclaration(statement, context)

  if (dgramAddress !== null && typeof dgramAddress !== 'undefined') {
    return dgramAddress
  }

  const httpServer = emitHttpServerVariableDeclaration(statement, context)

  if (httpServer !== null && typeof httpServer !== 'undefined') {
    return httpServer
  }

  const netServer = emitNetServerVariableDeclaration(statement, context)

  if (netServer !== null && typeof netServer !== 'undefined') {
    return netServer
  }

  const netSocket = emitNetSocketVariableDeclaration(statement, context, deps.net)

  if (netSocket !== null && typeof netSocket !== 'undefined') {
    return netSocket
  }

  const netAddress = emitNetAddressVariableDeclaration(statement, context)

  if (netAddress !== null && typeof netAddress !== 'undefined') {
    return netAddress
  }

  const netAddressMember = emitNetAddressMemberVariableDeclaration(statement, context)

  if (netAddressMember !== null && typeof netAddressMember !== 'undefined') {
    return netAddressMember
  }

  const netNumber = emitNetNumberVariableDeclaration(statement, context)

  if (netNumber !== null && typeof netNumber !== 'undefined') {
    return netNumber
  }

  return null
}

export function emitNodeNetworkCallStatement(
  expression: AnyNode,
  context: CFunctionContext,
  deps: NodeNetworkLoweringDependencies
): string[] | null {
  const dgramSocketCall = emitDgramSocketCallStatement(expression, context, deps.dgram)

  if (dgramSocketCall !== null && typeof dgramSocketCall !== 'undefined') {
    return dgramSocketCall
  }

  const httpServerCall = emitHttpServerCallStatement(expression, context, deps.http)

  if (httpServerCall !== null && typeof httpServerCall !== 'undefined') {
    return httpServerCall
  }

  const netServerCall = emitNetServerCallStatement(expression, context, deps.net)

  if (netServerCall !== null && typeof netServerCall !== 'undefined') {
    return netServerCall
  }

  const netSocketCall = emitNetSocketCallStatement(expression, context, deps.net)

  if (netSocketCall !== null && typeof netSocketCall !== 'undefined') {
    return netSocketCall
  }

  return null
}

export function emitPreparedNodeNetworkAddressPortExpression(
  expression: AnyNode,
  context: CFunctionContext
): PreparedExpression | null {
  const dgramAddressPort = emitPreparedDgramAddressPortExpression(expression, context)

  if (dgramAddressPort !== null && typeof dgramAddressPort !== 'undefined') {
    return dgramAddressPort
  }

  return emitPreparedNetAddressPortExpression(expression, context)
}

export function resolveNodeNetworkAddressStringMember(expression: AnyNode, context: CFunctionContext): string | null {
  return resolveNetAddressStringMember(expression, context)
}

export function inferNodeStdlibMemberExpressionType(expression: AnyNode, context: CFunctionContext): string | null {
  if (expression.type !== 'MemberExpression' && expression.type !== 'OptionalMemberExpression') {
    return null
  }

  if (emitPreparedNodeNetworkAddressPortExpression(expression, context)) {
    return 'number'
  }

  if (resolveNodeNetworkAddressStringMember(expression, context)) {
    return 'string'
  }

  return null
}
