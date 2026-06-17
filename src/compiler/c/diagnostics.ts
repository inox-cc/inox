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

export type CGlobalUsageSupportContext = {
  cryptoImportNames?: Set<string>
  dgramCreateSocketNames?: Set<string>
  dgramImportNames?: Set<string>
  httpCreateServerNames?: Set<string>
  httpImportNames?: Set<string>
  netConnectNames?: Set<string>
  netCreateServerNames?: Set<string>
  netImportNames?: Set<string>
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
  for (const usage of globalUsages) {
    if (!isSupportedCGlobalUsage(usage, context)) {
      reportCJsGlobalDiagnostic(diagnostics, usage.loc)
    }
  }
}

function isSupportedCGlobalUsage(usage: IrGlobalUsage, context: CGlobalUsageSupportContext): boolean {
  const path = usage.path.join('.')

  return (
    timeRuntimeMethodNameFromPath(usage.path) != null ||
    path === 'Error' ||
    path === 'Promise' ||
    path === 'Promise.resolve' ||
    path === 'Promise.reject' ||
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
    jsonRuntimeMethodNameFromPath(usage.path) != null ||
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

export function isSupportedCFetchGlobalUsage(usage: IrGlobalUsage): boolean {
  return usage.path.length === 1 && isFetchGlobalRoot(usage.path[0])
}

function isSupportedCDgramGlobalUsage(usage: IrGlobalUsage, context: CGlobalUsageSupportContext): boolean {
  return (
    (usage.path.length === 2 &&
      usage.path[1] === 'createSocket' &&
      context.dgramImportNames?.has(usage.root) === true) ||
    (usage.path.length === 1 && context.dgramCreateSocketNames?.has(usage.root) === true)
  )
}

function isSupportedCHttpGlobalUsage(usage: IrGlobalUsage, context: CGlobalUsageSupportContext): boolean {
  return (
    (usage.path.length === 2 &&
      usage.path[1] === 'createServer' &&
      context.httpImportNames?.has(usage.root) === true) ||
    (usage.path.length === 1 && context.httpCreateServerNames?.has(usage.root) === true)
  )
}

function isSupportedCNetGlobalUsage(usage: IrGlobalUsage, context: CGlobalUsageSupportContext): boolean {
  return (
    (usage.path.length === 2 && usage.path[1] === 'createServer' && context.netImportNames?.has(usage.root) === true) ||
    (usage.path.length === 2 &&
      (usage.path[1] === 'connect' || usage.path[1] === 'createConnection') &&
      context.netImportNames?.has(usage.root) === true) ||
    (usage.path.length === 1 &&
      (context.netCreateServerNames?.has(usage.root) === true || context.netConnectNames?.has(usage.root) === true))
  )
}

export function isSupportedCCryptoGlobalUsage(
  usage: IrGlobalUsage,
  context?: CGlobalUsageSupportContext
): boolean {
  return (
    isCryptoRuntimeMethodPath(usage.path) ||
    (usage.path.length === 2 &&
      context?.cryptoImportNames?.has(usage.root) === true &&
      isCryptoRuntimeMethod(usage.path[1]))
  )
}

export function isSupportedCDebugGlobalUsage(usage: IrGlobalUsage): boolean {
  return isDebugRuntimeMethodPath(usage.path)
}

export function isSupportedCMathGlobalUsage(usage: IrGlobalUsage): boolean {
  return mathRuntimeMethodNameFromPath(usage.path) != null
}

export function reportCJsGlobalDiagnostic(diagnostics: Diagnostic[], loc?: SourceLocation): void {
  if (diagnostics.some((item) => item.code === 'CCJS_C_JS_GLOBAL' && sameLocation(item, loc))) {
    return
  }

  diagnostics.push(
    diagnostic('CCJS_C_JS_GLOBAL', 'this JS global is not supported by the current C backend slice', loc)
  )
}

function sameLocation(left: SourceLocation | undefined, right: SourceLocation | undefined): boolean {
  if (left == null || right == null) {
    return left == null && right == null
  }

  return left.line === right.line && left.column === right.column
}
