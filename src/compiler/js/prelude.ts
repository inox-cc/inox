import {
  collectIrFeatureRequirements,
  collectIrGlobalRoots,
  collectIrGlobalUsages
} from '../ir.ts'
import {
  isFsPromiseRuntimeMethod,
  isFsPromiseUsagePath,
  isFsSyncRuntimeMethod,
  isFsSyncUsagePath
} from '../stdlib/descriptors/fs.ts'
import type { AnyNode, IrProgram } from '../types.ts'
import type { JsEmitOptions } from './types.ts'

export function emitJsPrelude(programs: IrProgram[], options: JsEmitOptions = {}): string[] {
  const lines: string[] = []
  const helperLines: string[] = []
  const globalRoots = new Set(collectIrGlobalRoots(programs))
  const globalUsages = collectIrGlobalUsages(programs)
  const fsUsagePaths = new Set(globalUsages.filter((usage) => usage.root === 'fs').map((usage) => usage.path.join('.')))
  const features = new Set(collectIrFeatureRequirements(programs))
  const fsRuntimeMethods = new Set(collectFsRuntimeMethods(programs))
  const needsFsSync = [...fsUsagePaths].some(isFsSyncUsagePath) || [...fsRuntimeMethods].some(isFsSyncRuntimeMethod)
  const needsFsPromises =
    [...fsUsagePaths].some(isFsPromiseUsagePath) || [...fsRuntimeMethods].some(isFsPromiseRuntimeMethod)

  if (needsFsPromises || (features.has('fs') && !needsFsSync) || (globalRoots.has('fs') && !needsFsSync)) {
    lines.push("import * as fs from 'node:fs/promises'")
  }

  if (needsFsSync) {
    lines.push("import * as ccjsFsSync from 'node:fs'")
  }

  if (globalRoots.has('http')) {
    lines.push("import * as http from 'node:http'")
  }

  if (features.has('array-pop-null')) {
    helperLines.push(...emitArrayPopHelper(options))
  }

  if (features.has('map-get-null')) {
    if (helperLines.length > 0) {
      helperLines.push('')
    }

    helperLines.push(...emitMapGetHelper(options))
  }

  if (features.has('map-index-set')) {
    if (helperLines.length > 0) {
      helperLines.push('')
    }

    helperLines.push(...emitMapSetHelper(options))
  }

  if (features.has('string-bytes')) {
    if (helperLines.length > 0) {
      helperLines.push('')
    }

    helperLines.push(...emitStringUnicodeHelpers(options))
  }

  if (features.has('number-from-string-null')) {
    if (helperLines.length > 0) {
      helperLines.push('')
    }

    helperLines.push(...emitNumberFromStringHelper(options))
  }

  if (features.has('numeric-casts')) {
    if (helperLines.length > 0) {
      helperLines.push('')
    }

    helperLines.push(...emitNumericCastHelpers(options))
  }

  if (helperLines.length > 0) {
    if (lines.length > 0) {
      lines.push('')
    }

    lines.push(...helperLines)
  }

  return lines
}

function collectFsRuntimeMethods(programs: IrProgram[]): string[] {
  const methods: string[] = []

  for (const program of programs) {
    collectFsRuntimeMethodsFromNode(program.body, methods)
  }

  return methods
}

function collectFsRuntimeMethodsFromNode(node: unknown, methods: string[]): void {
  if (node == null) {
    return
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      collectFsRuntimeMethodsFromNode(item, methods)
    }
    return
  }

  if (typeof node !== 'object') {
    return
  }

  const item = node as AnyNode

  if (item.type === 'CallExpression' && item.fsRuntimeMethod != null) {
    methods.push(item.fsRuntimeMethod)
  }

  for (const [key, value] of Object.entries(item)) {
    if (key === 'loc' || key === 'shape') {
      continue
    }

    collectFsRuntimeMethodsFromNode(value, methods)
  }
}

function emitArrayPopHelper(options: JsEmitOptions): string[] {
  return ['function ccjsArrayPop(array) {', '  return array.length === 0 ? null : array.pop()', '}']
}

function emitMapGetHelper(options: JsEmitOptions): string[] {
  return ['function ccjsMapGet(map, key) {', '  return map.has(key) ? map.get(key) : null', '}']
}

function emitMapSetHelper(options: JsEmitOptions): string[] {
  return ['function ccjsMapSet(map, key, value) {', '  map.set(key, value)', '  return value', '}']
}

function emitStringUnicodeHelpers(options: JsEmitOptions): string[] {
  return [
    'function ccjsStringLength(value) {',
    '  return Array.from(value).length',
    '}',
    '',
    'function ccjsStringSlice(value, start, end) {',
    '  if (end === null) {',
    "    return Array.from(value).slice(start).join('')",
    '  }',
    '',
    "  return Array.from(value).slice(start, end).join('')",
    '}',
    '',
    'function ccjsStringSplit(value, separator) {',
    "  if (separator === '') {",
    '    return Array.from(value)',
    '  }',
    '',
    '  return value.split(separator)',
    '}'
  ]
}

function emitNumberFromStringHelper(options: JsEmitOptions): string[] {
  return [
    'function ccjsNumberFromString(text) {',
    '  if (/^[ \\t\\n\\r\\f\\v]*$/.test(text)) {',
    '    return 0',
    '  }',
    '',
    '  if (!/^[ \\t\\n\\r\\f\\v]*[+-]?(?:(?:(?:\\d+(?:\\.\\d*)?)|(?:\\.\\d+))(?:[eE][+-]?\\d+)?|Infinity)[ \\t\\n\\r\\f\\v]*$/.test(text)) {',
    '    return null',
    '  }',
    '',
    '  const value = Number(text)',
    '  return Number.isNaN(value) ? null : value',
    '}'
  ]
}

function emitNumericCastHelpers(options: JsEmitOptions): string[] {
  return [
    'function ccjsNumericCastTrunc(value) {',
    '  if (value !== value || (value - value) !== 0) {',
    "    throw new Error('ccjs numeric cast requires a finite number')",
    '  }',
    '',
    '  if (value < 0) {',
    '    return Math.ceil(value)',
    '  }',
    '',
    '  return Math.floor(value)',
    '}',
    '',
    'function ccjsCheckedIntegerCast(value, min, max) {',
    '  const truncated = ccjsNumericCastTrunc(value)',
    '',
    '  if (truncated < min || truncated > max) {',
    "    throw new Error('ccjs numeric cast overflow')",
    '  }',
    '',
    '  return truncated',
    '}',
    '',
    'function ccjsI32(value) {',
    '  return ccjsCheckedIntegerCast(value, -2147483648, 2147483647)',
    '}',
    '',
    'function ccjsU32(value) {',
    '  return ccjsCheckedIntegerCast(value, 0, 4294967295)',
    '}',
    '',
    'function ccjsU64(value) {',
    '  return ccjsCheckedIntegerCast(value, 0, 9007199254740991)',
    '}',
    '',
    'function ccjsF32(value) {',
    '  return Math.fround(value)',
    '}',
    '',
    'function ccjsF64(value) {',
    '  return value',
    '}'
  ]
}
