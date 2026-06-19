import { diagnostic } from '../diagnostics.ts'
import { isBinaryGlobalUsagePath } from '../stdlib/descriptors/binary.ts'
import { isCollectionConstructorGlobalUsagePath } from '../stdlib/descriptors/collections.ts'
import { isCryptoRuntimeMethod, isCryptoRuntimeMethodPath } from '../stdlib/descriptors/crypto.ts'
import { isDebugRuntimeMethodPath } from '../stdlib/descriptors/debug.ts'
import { isFetchGlobalRoot } from '../stdlib/descriptors/fetch.ts'
import { jsonRuntimeMethodNameFromPath } from '../stdlib/descriptors/json.ts'
import { mathRuntimeMethodNameFromPath } from '../stdlib/descriptors/math.ts'
import { timeRuntimeMethodNameFromPath } from '../stdlib/descriptors/time.ts'
import type { Diagnostic, IrGlobalUsage, IrSyntaxFeatureUsage, SourceLocation } from '../types.ts'

type CGlobalNameSet = Set<string>

export type CGlobalUsageSupportContext = {
  cryptoImportNames?: CGlobalNameSet
  dgramCreateSocketNames?: CGlobalNameSet
  dgramImportNames?: CGlobalNameSet
  httpCreateServerNames?: CGlobalNameSet
  httpImportNames?: CGlobalNameSet
  netConnectNames?: CGlobalNameSet
  netCreateServerNames?: CGlobalNameSet
  netImportNames?: CGlobalNameSet
}

export function reportUnsupportedCSyntaxFeatures(
  _syntaxFeatures: IrSyntaxFeatureUsage[],
  _diagnostics: Diagnostic[]
): void {}

export function reportUnsupportedCGlobalUsages(
  globalUsages: IrGlobalUsage[],
  diagnostics: Diagnostic[],
  context: CGlobalUsageSupportContext
): void {
  for (let index = 0; index < globalUsages.length; index = index + 1) {
    const usage = globalUsages[index] as IrGlobalUsage

    if (!isSupportedCGlobalUsage(usage, context)) {
      reportCJsGlobalDiagnostic(diagnostics, usage.loc)
    }
  }
}

function isSupportedCGlobalUsage(usage: IrGlobalUsage, context: CGlobalUsageSupportContext): boolean {
  const path = joinStrings(usage.path, '.')

  return (
    !!timeRuntimeMethodNameFromPath(usage.path) ||
    path === 'Error' ||
    path === 'Promise' ||
    path === 'Promise.resolve' ||
    path === 'Promise.reject' ||
    path === 'Array.isArray' ||
    path === 'Object.entries' ||
    path === 'Object.keys' ||
    path === 'Object.values' ||
    path === 'fs.promises.access' ||
    path === 'fs.promises.appendFile' ||
    path === 'fs.promises.copyFile' ||
    path === 'fs.promises.lstat' ||
    path === 'fs.promises.mkdir' ||
    path === 'fs.promises.readFile' ||
    path === 'fs.promises.readdir' ||
    path === 'fs.promises.readlink' ||
    path === 'fs.promises.realpath' ||
    path === 'fs.promises.rename' ||
    path === 'fs.promises.rm' ||
    path === 'fs.promises.stat' ||
    path === 'fs.promises.symlink' ||
    path === 'fs.promises.unlink' ||
    path === 'fs.promises.writeFile' ||
    path === 'fs.accessSync' ||
    path === 'fs.appendFileSync' ||
    path === 'fs.copyFileSync' ||
    path === 'fs.lstatSync' ||
    path === 'fs.mkdirSync' ||
    path === 'fs.readFileSync' ||
    path === 'fs.readdirSync' ||
    path === 'fs.readlinkSync' ||
    path === 'fs.realpathSync' ||
    path === 'fs.renameSync' ||
    path === 'fs.rmSync' ||
    path === 'fs.statSync' ||
    path === 'fs.symlinkSync' ||
    path === 'fs.unlinkSync' ||
    path === 'fs.writeFileSync' ||
    path === 'fs.constants.F_OK' ||
    path === 'fs.constants.R_OK' ||
    path === 'fs.constants.W_OK' ||
    path === 'fs.constants.X_OK' ||
    !!jsonRuntimeMethodNameFromPath(usage.path) ||
    isBinaryGlobalUsagePath(usage.path) ||
    path === 'clearImmediate' ||
    path === 'clearInterval' ||
    path === 'clearTimeout' ||
    path === 'setImmediate' ||
    path === 'setInterval' ||
    path === 'setTimeout' ||
    isCollectionConstructorGlobalUsagePath(usage.path) ||
    isSupportedCDgramGlobalUsage(usage, context) ||
    isSupportedCFetchGlobalUsage(usage) ||
    isSupportedCHttpGlobalUsage(usage, context) ||
    isSupportedCNetGlobalUsage(usage, context) ||
    isSupportedCCryptoGlobalUsage(usage, context) ||
    isSupportedCDebugGlobalUsage(usage) ||
    isSupportedCMathGlobalUsage(usage)
  )
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

export function isSupportedCFetchGlobalUsage(usage: IrGlobalUsage): boolean {
  return usage.path.length === 1 && isFetchGlobalRoot(usage.path[0])
}

function isSupportedCDgramGlobalUsage(usage: IrGlobalUsage, context: CGlobalUsageSupportContext): boolean {
  return (
    (usage.path.length === 2 &&
      usage.path[1] === 'createSocket' &&
      runtimeNameSetHas(context.dgramImportNames, usage.root)) ||
    (usage.path.length === 1 && runtimeNameSetHas(context.dgramCreateSocketNames, usage.root))
  )
}

function isSupportedCHttpGlobalUsage(usage: IrGlobalUsage, context: CGlobalUsageSupportContext): boolean {
  return (
    (usage.path.length === 2 &&
      usage.path[1] === 'createServer' &&
      runtimeNameSetHas(context.httpImportNames, usage.root)) ||
    (usage.path.length === 1 && runtimeNameSetHas(context.httpCreateServerNames, usage.root))
  )
}

function isSupportedCNetGlobalUsage(usage: IrGlobalUsage, context: CGlobalUsageSupportContext): boolean {
  return (
    (usage.path.length === 2 &&
      usage.path[1] === 'createServer' &&
      runtimeNameSetHas(context.netImportNames, usage.root)) ||
    (usage.path.length === 2 &&
      (usage.path[1] === 'connect' || usage.path[1] === 'createConnection') &&
      runtimeNameSetHas(context.netImportNames, usage.root)) ||
    (usage.path.length === 1 &&
      (runtimeNameSetHas(context.netCreateServerNames, usage.root) ||
        runtimeNameSetHas(context.netConnectNames, usage.root)))
  )
}

export function isSupportedCCryptoGlobalUsage(usage: IrGlobalUsage, context: CGlobalUsageSupportContext): boolean {
  return (
    isCryptoRuntimeMethodPath(usage.path) ||
    (usage.path.length === 2 &&
      runtimeNameSetHas(context.cryptoImportNames, usage.root) &&
      isCryptoRuntimeMethod(usage.path[1]))
  )
}

function runtimeNameSetHas(names: CGlobalNameSet | undefined, root: string): boolean {
  if (names === null || typeof names === 'undefined') {
    return false
  }

  return names.has(root)
}

export function isSupportedCDebugGlobalUsage(usage: IrGlobalUsage): boolean {
  return isDebugRuntimeMethodPath(usage.path)
}

export function isSupportedCMathGlobalUsage(usage: IrGlobalUsage): boolean {
  return !!mathRuntimeMethodNameFromPath(usage.path)
}

export function reportCJsGlobalDiagnostic(diagnostics: Diagnostic[], loc: SourceLocation | null | undefined): void {
  if (hasCJsGlobalDiagnosticAtLocation(diagnostics, loc)) {
    return
  }

  diagnostics.push(
    diagnostic('INOX_C_JS_GLOBAL', 'this JS global is not supported by the current C backend slice', loc)
  )
}

function hasCJsGlobalDiagnosticAtLocation(diagnostics: Diagnostic[], loc: SourceLocation | null | undefined): boolean {
  for (let index = 0; index < diagnostics.length; index = index + 1) {
    const item = diagnostics[index]

    if (item.code === 'INOX_C_JS_GLOBAL' && sameLocation(item, loc)) {
      return true
    }
  }

  return false
}

function sameLocation(left: SourceLocation | undefined, right: SourceLocation | null | undefined): boolean {
  if (left === null || typeof left === 'undefined' || right === null || typeof right === 'undefined') {
    return (left === null || typeof left === 'undefined') && (right === null || typeof right === 'undefined')
  }

  return left.line === right.line && left.column === right.column
}
