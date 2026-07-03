import type { CEmitContext, CFunctionContext } from '../../c/context.ts'
import type { CPreparedExpression as PreparedExpression } from '../../c/types.ts'
import type { AnyNode, IrGlobalUsage, IrProgram } from '../../types.ts'
import type { BinaryLoweringDependencies as PackageBinaryLoweringDependencies } from '../../../stdlib/node/buffer/compiler/c.ts'
import type { ChildProcessLoweringDependencies as PackageChildProcessLoweringDependencies } from '../../../stdlib/node/child_process/compiler/c.ts'
import type { CryptoLoweringDependencies as PackageCryptoLoweringDependencies } from '../../../stdlib/node/crypto/compiler/c.ts'
import { cChildProcessRuntimeMethodName } from '../../../stdlib/node/child_process/compiler/c.ts'
import { isSupportedNodeCryptoCGlobalUsage } from '../../../stdlib/node/crypto/compiler/descriptor.ts'
import { cryptoRuntimeMethodName, registerCryptoRuntimeImportNames } from '../../../stdlib/node/crypto/compiler/c.ts'
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
import type {
  FsAsyncTaskSourceExpression,
  FsLoweringDependencies as PackageFsLoweringDependencies
} from '../../../stdlib/node/fs/compiler/c.ts'
import {
  cFsRuntimeExpressionMethod,
  emitPreparedFsAsyncTaskSourceExpression,
  isAsyncFsRuntimeCallExpression
} from '../../../stdlib/node/fs/compiler/c.ts'
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
import { cOsRuntimeConstantName, cOsRuntimeConstantValue, cOsRuntimeMethodName } from '../../../stdlib/node/os/compiler/c.ts'
import type { PathLoweringDependencies as PackagePathLoweringDependencies } from '../../../stdlib/node/path/compiler/c.ts'
import { cPathRuntimeConstantName, cPathRuntimeConstantValue, cPathRuntimeMethodName } from '../../../stdlib/node/path/compiler/c.ts'
import type {
  ProcessLoweringDependencies as PackageProcessLoweringDependencies,
  ProcessRuntimeObjectReferenceEmitterDescriptor as PackageProcessRuntimeObjectReferenceEmitterDescriptor
} from '../../../stdlib/node/process/compiler/c.ts'
import {
  cProcessRuntimeEnvName,
  cProcessRuntimeMethodName,
  cProcessRuntimePropertyName,
  cProcessRuntimePropertyValueType,
  cProcessRuntimeStringPropertyName,
  emitPreparedProcessRuntimeObjectRootReferenceExpression,
  emitPreparedProcessRuntimeObjectReferenceExpression,
  processRuntimeObjectReferenceEmitterDescriptors
} from '../../../stdlib/node/process/compiler/c.ts'
import type { TimerLoweringDependencies as PackageTimerLoweringDependencies } from '../../../stdlib/node/timers/compiler/c.ts'
import type { UrlLoweringDependencies as PackageUrlLoweringDependencies } from '../../../stdlib/node/url/compiler/c.ts'
import { cUrlRuntimeMethodName } from '../../../stdlib/node/url/compiler/c.ts'

export {
  binaryRuntimeExpressionReturnType,
  emitPreparedBinaryNumberCallExpression,
  emitPreparedBinaryValueExpression,
  emitPreparedBytesIndexAssignment,
  emitPreparedBytesIndexExpression,
  emitPreparedBytesLengthExpression,
  isBinaryConstructorExpression,
  isBinaryRuntimeCall,
  resolveBinaryExpressionKind
} from '../../../stdlib/node/buffer/compiler/c.ts'
export { emitPreparedChildProcessCallExpression } from '../../../stdlib/node/child_process/compiler/c.ts'
export {
  emitCryptoHandleVariableDeclaration,
  emitCryptoHashVariableDeclaration,
  emitPreparedCryptoCallExpression,
  emitPreparedCryptoHashCallExpression,
  emitPreparedCryptoHmacCallExpression,
  emitPreparedCryptoNumberCallExpression
} from '../../../stdlib/node/crypto/compiler/c.ts'
export {
  cFsRuntimeConstantExpression,
  cFsRuntimeExpressionMethod,
  emitPreparedFsCallExpression,
  emitPreparedFsStatsMethodExpression,
  emitPreparedFsSyncStatementExpression,
  emitPreparedFsSyncValueExpression
} from '../../../stdlib/node/fs/compiler/c.ts'
export { emitPreparedOsConstantExpression, emitPreparedOsStringCallExpression } from '../../../stdlib/node/os/compiler/c.ts'
export {
  emitPreparedPathBooleanCallExpression,
  emitPreparedPathConstantExpression,
  emitPreparedPathObjectCallExpression,
  emitPreparedPathStringCallExpression
} from '../../../stdlib/node/path/compiler/c.ts'
export {
  emitPreparedProcessNumberExpression,
  emitPreparedProcessValueExpression,
  emitPreparedProcessStringExpression,
  emitProcessExitCodeAssignment,
  emitProcessExitStatement
} from '../../../stdlib/node/process/compiler/c.ts'
export {
  emitPreparedTimerCallExpression,
  emitTimerVariableDeclaration,
  isTimerStartCallExpression,
  timerCallbackFunctionType
} from '../../../stdlib/node/timers/compiler/c.ts'
export {
  emitPreparedUrlObjectExpression,
  emitPreparedUrlSearchParamsCallExpression,
  emitPreparedUrlSearchParamsObjectExpression,
  emitPreparedUrlStringCallExpression,
  emitUrlObjectFieldAssignment
} from '../../../stdlib/node/url/compiler/c.ts'

export type BinaryLoweringDependencies = PackageBinaryLoweringDependencies
export type ChildProcessLoweringDependencies = PackageChildProcessLoweringDependencies
export type CryptoLoweringDependencies = PackageCryptoLoweringDependencies
export type DgramLoweringDependencies = PackageDgramLoweringDependencies
export type FsLoweringDependencies = PackageFsLoweringDependencies
export type HttpLoweringDependencies = PackageHttpLoweringDependencies
export type NetLoweringDependencies = PackageNetLoweringDependencies
export type PathLoweringDependencies = PackagePathLoweringDependencies
export type ProcessLoweringDependencies = PackageProcessLoweringDependencies
export type TimerLoweringDependencies = PackageTimerLoweringDependencies
export type UrlLoweringDependencies = PackageUrlLoweringDependencies

export type NodeNetworkLoweringDependencies = {
  dgram: DgramLoweringDependencies
  http: HttpLoweringDependencies
  net: NetLoweringDependencies
}

export type NodeStdlibAsyncTaskLoweringDependencies = {
  fs: FsLoweringDependencies
}

export type NodeStdlibRuntimeObjectReferenceDependencies = {
  process: ProcessLoweringDependencies
}

type NodeStdlibRuntimeObjectReferenceEmitter = {
  source: string
  name: string
  packageName: 'process'
}

const nodeStdlibRuntimeObjectReferenceEmitters: NodeStdlibRuntimeObjectReferenceEmitter[] =
  nodeStdlibProcessRuntimeObjectReferenceEmitters(processRuntimeObjectReferenceEmitterDescriptors)

function nodeStdlibProcessRuntimeObjectReferenceEmitters(
  descriptors: PackageProcessRuntimeObjectReferenceEmitterDescriptor[]
): NodeStdlibRuntimeObjectReferenceEmitter[] {
  const result: NodeStdlibRuntimeObjectReferenceEmitter[] = []

  for (let index = 0; index < descriptors.length; index = index + 1) {
    const descriptor = descriptors[index]

    result.push({
      source: descriptor.source,
      name: descriptor.name,
      packageName: 'process'
    })
  }

  return result
}

type NodeCGlobalNameSet = Set<string>

export type NodeStdlibCGlobalUsageContext = {
  cryptoImportNames?: NodeCGlobalNameSet
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
  registerCryptoRuntimeImportNames(context, irPrograms)
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
    isSupportedNodeNetCGlobalUsage(usage, context) ||
    isSupportedNodeCryptoCGlobalUsage(usage, context)
  )
}

export function nodeStdlibHasSupportedCryptoGlobalUsage(
  globalUsages: IrGlobalUsage[],
  context: NodeStdlibCGlobalUsageContext
): boolean {
  for (let index = 0; index < globalUsages.length; index = index + 1) {
    const usage = globalUsages[index] as IrGlobalUsage

    if (isSupportedNodeCryptoCGlobalUsage(usage, context)) {
      return true
    }
  }

  return false
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

export function isAsyncNodeStdlibRuntimeCallExpression(expression: AnyNode | null | undefined): boolean {
  return isAsyncFsRuntimeCallExpression(expression)
}

export function emitPreparedNodeStdlibAsyncTaskSourceExpression(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: NodeStdlibAsyncTaskLoweringDependencies
): FsAsyncTaskSourceExpression | null {
  return emitPreparedFsAsyncTaskSourceExpression(expression, context, dependencies.fs)
}

export function emitPreparedNodeStdlibRuntimeObjectReferenceExpression(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: NodeStdlibRuntimeObjectReferenceDependencies
): PreparedExpression | null {
  for (let index = 0; index < nodeStdlibRuntimeObjectReferenceEmitters.length; index = index + 1) {
    const emitter = nodeStdlibRuntimeObjectReferenceEmitters[index]

    if (nodeStdlibRuntimeObjectReferenceEmitterMatches(emitter, expression)) {
      return emitPreparedNodeStdlibRuntimeObjectReference(emitter, expression, context, dependencies)
    }
  }

  return null
}

export function emitPreparedNodeStdlibRuntimeObjectRootReferenceExpression(
  name: string,
  context: CFunctionContext,
  dependencies: NodeStdlibRuntimeObjectReferenceDependencies
): PreparedExpression | null {
  for (let index = 0; index < nodeStdlibRuntimeObjectReferenceEmitters.length; index = index + 1) {
    const emitter = nodeStdlibRuntimeObjectReferenceEmitters[index]

    if (emitter.name === name) {
      return emitPreparedNodeStdlibRuntimeObjectRootReference(emitter, name, context, dependencies)
    }
  }

  return null
}

function nodeStdlibRuntimeObjectReferenceEmitterMatches(
  emitter: NodeStdlibRuntimeObjectReferenceEmitter,
  expression: AnyNode
): boolean {
  if (expression.type !== 'Reference') {
    return false
  }

  return expression.runtimeObjectSource === emitter.source && expression.runtimeObjectName === emitter.name
}

function emitPreparedNodeStdlibRuntimeObjectRootReference(
  emitter: NodeStdlibRuntimeObjectReferenceEmitter,
  name: string,
  context: CFunctionContext,
  dependencies: NodeStdlibRuntimeObjectReferenceDependencies
): PreparedExpression | null {
  if (emitter.packageName === 'process') {
    return emitPreparedProcessRuntimeObjectRootReferenceExpression(name, context, dependencies.process)
  }

  return null
}

function emitPreparedNodeStdlibRuntimeObjectReference(
  emitter: NodeStdlibRuntimeObjectReferenceEmitter,
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: NodeStdlibRuntimeObjectReferenceDependencies
): PreparedExpression | null {
  if (emitter.packageName === 'process') {
    return emitPreparedProcessRuntimeObjectReferenceExpression(expression, context, dependencies.process)
  }

  return null
}

export function nodeRuntimeStringConstantValue(expression: AnyNode | null | undefined): string | null {
  const osConstant = cOsRuntimeConstantName(expression)

  if (osConstant !== null && typeof osConstant !== 'undefined') {
    return cOsRuntimeConstantValue(osConstant)
  }

  const pathConstant = cPathRuntimeConstantName(expression)

  if (pathConstant !== null && typeof pathConstant !== 'undefined') {
    return cPathRuntimeConstantValue(pathConstant)
  }

  return null
}

export function isNodeRuntimeProducedStringExpression(expression: AnyNode | null | undefined): boolean {
  if (expression === null || typeof expression === 'undefined') {
    return false
  }

  if (cOsRuntimeConstantName(expression)) {
    return true
  }

  if (cPathRuntimeConstantName(expression)) {
    return true
  }

  if (cProcessRuntimeStringPropertyName(expression)) {
    return true
  }

  if (cProcessRuntimeMethodName(expression) === 'cwd') {
    return true
  }

  if (cProcessRuntimeEnvName(expression)) {
    return true
  }

  if (cProcessRuntimePropertyName(expression) === 'argv' && expression.type === 'IndexExpression') {
    return true
  }

  return false
}

function nodeExpressionValueTypeOrUnknown(expression: AnyNode): string {
  if (expression.valueType !== null && typeof expression.valueType !== 'undefined') {
    return expression.valueType
  }

  return 'unknown'
}

export function inferNodeStdlibExpressionType(expression: AnyNode): string | null {
  const childProcessMethod = cChildProcessRuntimeMethodName(expression)

  if (childProcessMethod !== null && typeof childProcessMethod !== 'undefined') {
    if (childProcessMethod === 'spawnSync') {
      return 'object'
    }

    return 'string'
  }

  if (cOsRuntimeConstantName(expression) || cOsRuntimeMethodName(expression)) {
    return 'string'
  }

  const processMethod = cProcessRuntimeMethodName(expression)

  if (processMethod !== null && typeof processMethod !== 'undefined') {
    if (processMethod === 'cwd') {
      return 'string'
    }

    if (processMethod === 'hrtime') {
      return 'array'
    }

    if (processMethod === 'memoryUsage') {
      return 'object'
    }

    return 'void'
  }

  const processProperty = cProcessRuntimePropertyName(expression)

  if (processProperty === 'argv' && expression.type === 'IndexExpression') {
    return 'string'
  }

  const processPropertyType = cProcessRuntimePropertyValueType(expression)

  if (processPropertyType !== null && typeof processPropertyType !== 'undefined') {
    return processPropertyType
  }

  if (cProcessRuntimeEnvName(expression)) {
    return 'string'
  }

  const urlMethod = cUrlRuntimeMethodName(expression)

  if (urlMethod !== null && typeof urlMethod !== 'undefined') {
    if (
      urlMethod === 'fileURLToPath' ||
      urlMethod === 'URLSearchParams.get' ||
      urlMethod === 'URLSearchParams.toString'
    ) {
      return 'string'
    }

    if (urlMethod === 'URLSearchParams.has') {
      return 'boolean'
    }

    if (
      urlMethod === 'URLSearchParams.append' ||
      urlMethod === 'URLSearchParams.delete' ||
      urlMethod === 'URLSearchParams.set'
    ) {
      return 'void'
    }

    return 'object'
  }

  const pathConstant = cPathRuntimeConstantName(expression)

  if (pathConstant !== null && typeof pathConstant !== 'undefined') {
    return 'string'
  }

  const pathMethod = cPathRuntimeMethodName(expression)

  if (pathMethod !== null && typeof pathMethod !== 'undefined') {
    if (pathMethod === 'isAbsolute') {
      return 'boolean'
    }

    if (pathMethod === 'parse') {
      return 'object'
    }

    return 'string'
  }

  if (expression.type === 'CallExpression' && cFsRuntimeExpressionMethod(expression)) {
    if (expression.valueType === 'promise') {
      return 'promise'
    }

    return nodeExpressionValueTypeOrUnknown(expression)
  }

  const cryptoMethod = cryptoRuntimeMethodName(expression)

  if (cryptoMethod === 'createHash' || cryptoMethod === 'Hash.update') {
    return 'crypto-hash'
  }

  if (cryptoMethod === 'createHmac' || cryptoMethod === 'Hmac.update') {
    return 'crypto-hmac'
  }

  if (cryptoMethod === 'Hash.digest' || cryptoMethod === 'Hmac.digest' || cryptoMethod === 'hash') {
    return nodeExpressionValueTypeOrUnknown(expression)
  }

  if (cryptoMethod === 'getHashes') {
    return 'array'
  }

  if (cryptoMethod === 'getRandomValues' || cryptoMethod === 'randomBytes' || cryptoMethod === 'randomFillSync') {
    return 'bytes'
  }

  if (cryptoMethod === 'randomInt') {
    return 'number'
  }

  if (cryptoMethod === 'timingSafeEqual') {
    return 'boolean'
  }

  if (cryptoMethod === 'randomUUID') {
    return 'string'
  }

  return null
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
