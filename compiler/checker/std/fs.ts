import { memberExpressionPath } from '../../member-paths.ts'
import { isFsConstantValue } from '../builtins.ts'
import type { FsRuntimeCallInfo } from '../../stdlib/descriptors/fs.ts'
import { fsRuntimeCallInfoFromPath, unsupportedFsRuntimeMethodMessage } from '../../stdlib/descriptors/fs.ts'
import { isStdlibModuleImportSourceForId } from '../../stdlib/descriptors/modules.ts'
import type { AnyNode, SymbolInfo, ValueType } from '../../types.ts'

export type { FsRuntimeCallInfo } from '../../stdlib/descriptors/fs.ts'

export type FsBooleanOptions = {
  bytes?: boolean
  recursive?: boolean
  force?: boolean
  withFileTypes?: boolean
}

export type FsRuntimeArgumentCheck = {
  kind: string
  index: number
  label: string
  allowedOptions?: string[] | null
}

export type FsRuntimeCallPlan = {
  info: FsRuntimeCallInfo
  method: string
  label: string
  promisesApi: boolean
  unsupportedMessage: string | null
  minArgs: number
  maxArgs: number
  expectedArgsLabel: string
  argumentChecks: FsRuntimeArgumentCheck[]
  runtimeMethod: string
  valueType: ValueType
  promiseValueType: ValueType | null
  shape: string | null
  arrayElementType: ValueType | null
  arrayElementDeclaredType: string | null
  bytes: boolean | null
  bytesFromWriteData: boolean
  direntsFromOptions: boolean
  recursiveFromOptions: boolean
  forceFromOptions: boolean
}

export type FsStatsRuntimeMethodInfo = {
  method: string
  receiverName: string
}

export function fsRuntimeCallInfo(callee: AnyNode): FsRuntimeCallInfo | null {
  return fsRuntimeCallInfoFromPath(memberExpressionPath(callee))
}

export function fsRuntimeCallInfoFromImportSymbol(
  callee: AnyNode,
  symbol: SymbolInfo | null
): FsRuntimeCallInfo | null {
  if (
    callee.type !== 'Reference' ||
    callee.path.length !== 1 ||
    symbol === null ||
    typeof symbol === 'undefined' ||
    symbol.kind !== 'import'
  ) {
    return null
  }

  if (
    !isFsRuntimeImportSource(symbol.importSource) ||
    symbol.importedName === null ||
    typeof symbol.importedName === 'undefined'
  ) {
    return null
  }

  const root = callee.path[0]
  let path = [root, symbol.importedName]

  if (symbol.importSource === 'node:fs/promises') {
    path = [root, 'promises', symbol.importedName]
  }

  const info = fsRuntimeCallInfoFromPath(path)

  if (info === null || typeof info === 'undefined') {
    return null
  }

  return {
    method: info.method,
    nodeName: info.nodeName,
    path: [root],
    root,
    viaPromises: info.viaPromises,
    mode: info.mode
  }
}

export function isFsRuntimeImportSymbol(symbol: SymbolInfo): boolean {
  return (
    symbol.kind === 'import' &&
    isFsRuntimeImportSource(symbol.importSource) &&
    isFsRuntimeImportedName(symbol.importedName)
  )
}

export function isFsRuntimeRootSymbol(symbol: SymbolInfo | null | undefined): boolean {
  return symbol !== null && typeof symbol !== 'undefined' && isFsRuntimeImportSymbol(symbol)
}

export function isFsPromisesImportSymbol(symbol: SymbolInfo | null | undefined): boolean {
  if (symbol === null || typeof symbol === 'undefined' || symbol.kind !== 'import') {
    return false
  }

  if (symbol.importSource === 'node:fs/promises') {
    return true
  }

  return (symbol.importSource === 'fs' || symbol.importSource === 'node:fs') && symbol.importedName === 'promises'
}

export function fsRuntimeConstantName(
  path: readonly string[] | null | undefined,
  rootSymbol: SymbolInfo | null | undefined
): string | null {
  if (
    path === null ||
    typeof path === 'undefined' ||
    path.length !== 3 ||
    path[1] !== 'constants' ||
    !isFsConstantValue(path[2]) ||
    !isFsRuntimeRootSymbol(rootSymbol)
  ) {
    return null
  }

  return path[2]
}

export function fsStatsRuntimeMethodInfo(
  property: string | null | undefined,
  builtin: string | null | undefined
): FsStatsRuntimeMethodInfo | null {
  if (
    (property !== 'isFile' && property !== 'isDirectory') ||
    (builtin !== 'fs.Stats' && builtin !== 'fs.Dirent')
  ) {
    return null
  }

  if (builtin === 'fs.Dirent') {
    if (property === 'isFile') {
      return {
        method: 'direntIsFile',
        receiverName: 'Dirent'
      }
    }

    return {
      method: 'direntIsDirectory',
      receiverName: 'Dirent'
    }
  }

  if (property === 'isFile') {
    return {
      method: 'statsIsFile',
      receiverName: 'Stats'
    }
  }

  return {
    method: 'statsIsDirectory',
    receiverName: 'Stats'
  }
}

export function fsRuntimeCallPlan(
  info: FsRuntimeCallInfo,
  promisesApi: boolean,
  argCount: number
): FsRuntimeCallPlan {
  const method = info.method
  const label = joinStrings(info.path, '.')
  const unsupportedMessage = unsupportedFsRuntimeMethodMessage(info, promisesApi)

  if (unsupportedMessage !== null && typeof unsupportedMessage !== 'undefined') {
    return fsBaseCallPlan(info, promisesApi, label, unsupportedMessage, 0, 0, '0', method, 'unknown')
  }

  if (method === 'statSync' || method === 'lstatSync') {
    return fsBaseCallPlan(info, promisesApi, label, null, 1, 1, '1', method, 'object', {
      shape: 'stats',
      argumentChecks: [fsArgumentCheck('string', 0, label)]
    })
  }

  if (method === 'accessSync') {
    return fsBaseCallPlan(info, promisesApi, label, null, 1, 2, '1 or 2', 'accessSync', 'void', {
      argumentChecks: [fsArgumentCheck('string', 0, label), fsArgumentCheck('number', 1, label)]
    })
  }

  if (method === 'mkdirSync') {
    return fsBaseCallPlan(info, promisesApi, label, null, 1, 2, '1 or 2', 'mkdirSync', 'void', {
      argumentChecks: [
        fsArgumentCheck('string', 0, label),
        fsBooleanOptionsCheck(1, label, ['recursive'])
      ],
      recursiveFromOptions: true
    })
  }

  if (method === 'unlinkSync') {
    return fsBaseCallPlan(info, promisesApi, label, null, 1, 1, '1', 'unlinkSync', 'void', {
      argumentChecks: [fsArgumentCheck('string', 0, label)]
    })
  }

  if (method === 'rmSync') {
    return fsBaseCallPlan(info, promisesApi, label, null, 1, 2, '1 or 2', 'rmSync', 'void', {
      argumentChecks: [
        fsArgumentCheck('string', 0, label),
        fsBooleanOptionsCheck(1, label, ['recursive', 'force'])
      ],
      recursiveFromOptions: true,
      forceFromOptions: true
    })
  }

  if (method === 'renameSync') {
    return fsTwoStringCallPlan(info, promisesApi, label, 'renameSync', 'void')
  }

  if (method === 'readFileSync') {
    if (argCount < 2) {
      return fsBaseCallPlan(info, promisesApi, label, null, 1, 2, '1 or 2', 'readFileSync', 'bytes', {
        argumentChecks: [fsArgumentCheck('string', 0, label)],
        bytes: true
      })
    }

    return fsBaseCallPlan(info, promisesApi, label, null, 1, 2, '1 or 2', 'readFileSync', 'string', {
      argumentChecks: [fsArgumentCheck('string', 0, label), fsArgumentCheck('utf8-encoding', 1, label)]
    })
  }

  if (method === 'readdirSync') {
    let maxArgs = 1
    let expectedArgsLabel = '1'

    if (info.nodeName === 'readdirSync') {
      maxArgs = 2
      expectedArgsLabel = '1 or 2'
    }

    return fsBaseCallPlan(info, promisesApi, label, null, 1, maxArgs, expectedArgsLabel, 'readdirSync', 'array', {
      argumentChecks: [fsArgumentCheck('string', 0, label), fsArgumentCheck('readdir-options', 1, label)],
      arrayElementType: 'string',
      arrayElementDeclaredType: 'string',
      direntsFromOptions: true
    })
  }

  if (method === 'writeFileSync') {
    return fsWriteCallPlan(info, promisesApi, label, 'writeFileSync', 'void', 2, 3, '2 or 3')
  }

  if (method === 'appendFileSync') {
    return fsWriteCallPlan(info, promisesApi, label, 'appendFileSync', 'void', 2, 3, '2 or 3')
  }

  if (method === 'copyFileSync') {
    return fsTwoStringCallPlan(info, promisesApi, label, 'copyFileSync', 'void')
  }

  if (method === 'realpathSync' || method === 'readlinkSync') {
    return fsBaseCallPlan(info, promisesApi, label, null, 1, 1, '1', method, 'string', {
      argumentChecks: [fsArgumentCheck('string', 0, label)]
    })
  }

  if (method === 'symlinkSync') {
    return fsTwoStringCallPlan(info, promisesApi, label, 'symlinkSync', 'void')
  }

  if (method === 'readFile') {
    if (promisesApi && argCount < 2) {
      return fsBaseCallPlan(info, promisesApi, label, null, 1, 2, '1 or 2', 'readFile', 'promise', {
        argumentChecks: [fsArgumentCheck('string', 0, label)],
        promiseValueType: 'bytes',
        bytes: true
      })
    }

    const checks = [fsArgumentCheck('string', 0, label)]

    if (argCount > 1) {
      checks.push(fsArgumentCheck('utf8-encoding', 1, label))
    }

    return fsBaseCallPlan(info, promisesApi, label, null, 1, 2, '1 or 2', 'readFile', 'promise', {
      argumentChecks: checks,
      promiseValueType: 'string'
    })
  }

  if (method === 'stat' || method === 'lstat') {
    return fsBaseCallPlan(info, promisesApi, label, null, 1, 1, '1', method, 'promise', {
      argumentChecks: [fsArgumentCheck('string', 0, label)],
      promiseValueType: 'object',
      shape: 'stats'
    })
  }

  if (method === 'access') {
    return fsBaseCallPlan(info, promisesApi, label, null, 1, 2, '1 or 2', 'access', 'promise', {
      argumentChecks: [fsArgumentCheck('string', 0, label), fsArgumentCheck('number', 1, label)],
      promiseValueType: 'void'
    })
  }

  if (method === 'mkdir') {
    let maxArgs = 1
    let expectedArgsLabel = '1'
    let checks = [fsArgumentCheck('string', 0, label)]
    let recursiveFromOptions = false

    if (promisesApi) {
      maxArgs = 2
      expectedArgsLabel = '1 or 2'
      checks = [fsArgumentCheck('string', 0, label), fsBooleanOptionsCheck(1, label, ['recursive'])]
      recursiveFromOptions = true
    }

    return fsBaseCallPlan(info, promisesApi, label, null, 1, maxArgs, expectedArgsLabel, 'mkdir', 'promise', {
      argumentChecks: checks,
      promiseValueType: 'void',
      recursiveFromOptions
    })
  }

  if (method === 'unlink') {
    return fsBaseCallPlan(info, promisesApi, label, null, 1, 1, '1', 'unlink', 'promise', {
      argumentChecks: [fsArgumentCheck('string', 0, label)],
      promiseValueType: 'void'
    })
  }

  if (method === 'rm') {
    let maxArgs = 1
    let expectedArgsLabel = '1'
    let checks = [fsArgumentCheck('string', 0, label)]
    let recursiveFromOptions = false
    let forceFromOptions = false

    if (promisesApi) {
      maxArgs = 2
      expectedArgsLabel = '1 or 2'
      checks = [fsArgumentCheck('string', 0, label), fsBooleanOptionsCheck(1, label, ['recursive', 'force'])]
      recursiveFromOptions = true
      forceFromOptions = true
    }

    return fsBaseCallPlan(info, promisesApi, label, null, 1, maxArgs, expectedArgsLabel, 'rm', 'promise', {
      argumentChecks: checks,
      promiseValueType: 'void',
      recursiveFromOptions,
      forceFromOptions
    })
  }

  if (method === 'rename') {
    return fsTwoStringCallPlan(info, promisesApi, label, 'rename', 'promise', 'void')
  }

  if (method === 'readdir') {
    let maxArgs = 1
    let expectedArgsLabel = '1'

    if (info.nodeName === 'readdir') {
      maxArgs = 2
      expectedArgsLabel = '1 or 2'
    }

    return fsBaseCallPlan(info, promisesApi, label, null, 1, maxArgs, expectedArgsLabel, 'readdir', 'promise', {
      argumentChecks: [fsArgumentCheck('string', 0, label), fsArgumentCheck('readdir-options', 1, label)],
      promiseValueType: 'array',
      arrayElementType: 'string',
      arrayElementDeclaredType: 'string',
      direntsFromOptions: true
    })
  }

  if (method === 'appendFile') {
    return fsAsyncWriteCallPlan(info, promisesApi, label, 'appendFile')
  }

  if (method === 'copyFile') {
    return fsTwoStringCallPlan(info, promisesApi, label, 'copyFile', 'promise', 'void')
  }

  if (method === 'realpath' || method === 'readlink') {
    return fsBaseCallPlan(info, promisesApi, label, null, 1, 1, '1', method, 'promise', {
      argumentChecks: [fsArgumentCheck('string', 0, label)],
      promiseValueType: 'string'
    })
  }

  if (method === 'symlink') {
    return fsTwoStringCallPlan(info, promisesApi, label, 'symlink', 'promise', 'void')
  }

  return fsAsyncWriteCallPlan(info, promisesApi, label, 'writeFile')
}

function isFsRuntimeImportSource(source: string | null | undefined): boolean {
  return isStdlibModuleImportSourceForId(source, 'fs')
}

function isFsRuntimeImportedName(name: string | null | undefined): boolean {
  return name === 'default' || name === 'fs' || name === 'promises'
}

function fsAsyncWriteCallPlan(
  info: FsRuntimeCallInfo,
  promisesApi: boolean,
  label: string,
  runtimeMethod: string
): FsRuntimeCallPlan {
  let maxArgs = 2
  let expectedArgsLabel = '2'

  if (promisesApi) {
    maxArgs = 3
    expectedArgsLabel = '2 or 3'
  }

  return fsWriteCallPlan(info, promisesApi, label, runtimeMethod, 'promise', 2, maxArgs, expectedArgsLabel, 'void')
}

function fsTwoStringCallPlan(
  info: FsRuntimeCallInfo,
  promisesApi: boolean,
  label: string,
  runtimeMethod: string,
  valueType: ValueType,
  promiseValueType?: ValueType | null
): FsRuntimeCallPlan {
  return fsBaseCallPlan(info, promisesApi, label, null, 2, 2, '2', runtimeMethod, valueType, {
    argumentChecks: [fsArgumentCheck('string', 0, label), fsArgumentCheck('string', 1, label)],
    promiseValueType: promiseValueType ?? null
  })
}

function fsWriteCallPlan(
  info: FsRuntimeCallInfo,
  promisesApi: boolean,
  label: string,
  runtimeMethod: string,
  valueType: ValueType,
  minArgs: number,
  maxArgs: number,
  expectedArgsLabel: string,
  promiseValueType?: ValueType | null
): FsRuntimeCallPlan {
  return fsBaseCallPlan(info, promisesApi, label, null, minArgs, maxArgs, expectedArgsLabel, runtimeMethod, valueType, {
    argumentChecks: [
      fsArgumentCheck('string', 0, label),
      fsArgumentCheck('write-data', 1, `${label} data`),
      fsArgumentCheck('utf8-encoding', 2, label)
    ],
    bytesFromWriteData: true,
    promiseValueType: promiseValueType ?? null
  })
}

type FsRuntimeCallPlanOptions = {
  argumentChecks?: FsRuntimeArgumentCheck[]
  promiseValueType?: ValueType | null
  shape?: string | null
  arrayElementType?: ValueType | null
  arrayElementDeclaredType?: string | null
  bytes?: boolean | null
  bytesFromWriteData?: boolean
  direntsFromOptions?: boolean
  recursiveFromOptions?: boolean
  forceFromOptions?: boolean
}

function fsBaseCallPlan(
  info: FsRuntimeCallInfo,
  promisesApi: boolean,
  label: string,
  unsupportedMessage: string | null,
  minArgs: number,
  maxArgs: number,
  expectedArgsLabel: string,
  runtimeMethod: string,
  valueType: ValueType,
  options?: FsRuntimeCallPlanOptions
): FsRuntimeCallPlan {
  const planOptions = options ?? {}
  const argumentChecks = planOptions.argumentChecks ?? []

  return {
    info,
    method: info.method,
    label,
    promisesApi,
    unsupportedMessage,
    minArgs,
    maxArgs,
    expectedArgsLabel,
    argumentChecks,
    runtimeMethod,
    valueType,
    promiseValueType: planOptions.promiseValueType ?? null,
    shape: planOptions.shape ?? null,
    arrayElementType: planOptions.arrayElementType ?? null,
    arrayElementDeclaredType: planOptions.arrayElementDeclaredType ?? null,
    bytes: planOptions.bytes ?? null,
    bytesFromWriteData: planOptions.bytesFromWriteData === true,
    direntsFromOptions: planOptions.direntsFromOptions === true,
    recursiveFromOptions: planOptions.recursiveFromOptions === true,
    forceFromOptions: planOptions.forceFromOptions === true
  }
}

function fsArgumentCheck(kind: string, index: number, label: string): FsRuntimeArgumentCheck {
  return {
    kind,
    index,
    label
  }
}

function fsBooleanOptionsCheck(index: number, label: string, allowedOptions: string[]): FsRuntimeArgumentCheck {
  return {
    kind: 'boolean-options',
    index,
    label,
    allowedOptions
  }
}

function joinStrings(values: readonly string[], separator: string): string {
  let result = ''

  for (let index = 0; index < values.length; index = index + 1) {
    if (index > 0) {
      result = result + separator
    }

    result = result + values[index]
  }

  return result
}
