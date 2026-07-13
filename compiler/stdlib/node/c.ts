import type { CEmitContext, CFunctionContext } from '../../c/context.ts'
import type { AnyNode, IrGlobalUsage, IrProgram } from '../../types.ts'
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
import type { TimerLoweringDependencies as PackageTimerLoweringDependencies } from '../../../stdlib/node/timers/compiler/c.ts'

export {
  emitPreparedTimerCallExpression,
  emitTimerVariableDeclaration,
  isTimerStartCallExpression,
  timerCallbackFunctionType
} from '../../../stdlib/node/timers/compiler/c.ts'

export type HttpLoweringDependencies = PackageHttpLoweringDependencies
export type TimerLoweringDependencies = PackageTimerLoweringDependencies

type NodeCGlobalNameSet = Set<string>

export type NodeStdlibCGlobalUsageContext = {
  httpCreateServerNames?: NodeCGlobalNameSet
  httpImportNames?: NodeCGlobalNameSet
}

export type NodeStdlibRuntimeImportUsage = {
  http: boolean
}

export function registerNodeStdlibRuntimeImportNames(context: CEmitContext, irPrograms: IrProgram[]): void {
  registerHttpRuntimeImportNames(context, irPrograms)
}

export function nodeStdlibRuntimeImportUsage(irPrograms: IrProgram[]): NodeStdlibRuntimeImportUsage {
  return {
    http: irProgramsUseHttpRuntimeImport(irPrograms)
  }
}

export function isSupportedNodeStdlibCGlobalUsage(
  usage: IrGlobalUsage,
  context: NodeStdlibCGlobalUsageContext
): boolean {
  return isSupportedNodeHttpCGlobalUsage(usage, context)
}

function pushNodeStdlibLines(target: string[], lines: string[]): void {
  for (const line of lines) {
    target.push(line)
  }
}

export function collectNodeHttpHandlers(irPrograms: IrProgram[], context: CEmitContext): void {
  context.httpHandlers = collectHttpHandlers(irPrograms, context)
}

export function hasNodeHttpHandlers(context: CEmitContext): boolean {
  return context.httpHandlers.size > 0
}

export function emitNodeHttpHandlerPrototypeLines(context: CEmitContext): string[] {
  const lines: string[] = []

  for (const wrapper of context.httpHandlers.values()) {
    lines.push(`${emitHttpHandlerHead(wrapper)};`)
  }

  return lines
}

export function emitNodeHttpHandlerDeclarations(
  context: CEmitContext,
  deps: HttpLoweringDependencies
): string[] {
  const lines: string[] = []

  for (const wrapper of context.httpHandlers.values()) {
    pushNodeStdlibLines(lines, emitHttpHandlerDeclaration(wrapper, context, deps))
    lines.push('')
  }

  return lines
}

export function emitNodeHttpVariableDeclaration(
  statement: AnyNode,
  context: CFunctionContext
): string[] | null {
  const httpServer = emitHttpServerVariableDeclaration(statement, context)

  if (httpServer !== null && typeof httpServer !== 'undefined') {
    return httpServer
  }

  return null
}

export function emitNodeHttpCallStatement(
  expression: AnyNode,
  context: CFunctionContext,
  deps: HttpLoweringDependencies
): string[] | null {
  const httpServerCall = emitHttpServerCallStatement(expression, context, deps)

  if (httpServerCall !== null && typeof httpServerCall !== 'undefined') {
    return httpServerCall
  }

  return null
}
