import { splitGenericArgs, splitUnionArgs } from '../type-names.ts'
import type { Token } from '../types.ts'

export type TypeAnnotationReadOptions = {
  stopAtLineBreak?: boolean
  stopAtStatementBoundary?: boolean
}

type RequiredTypeAnnotationReadOptions = {
  stopAtLineBreak: boolean
  stopAtStatementBoundary: boolean
}

export type TypeAnnotationReadResult = {
  typeName: string
  position: number
}

export function readTypeAnnotation(
  tokens: Token[],
  startPosition: number,
  stopValues: string[],
  options: TypeAnnotationReadOptions | null
): TypeAnnotationReadResult {
  const parts: string[] = []
  let genericDepth = 0
  let position = startPosition
  let lastTokenLine = 0
  const startToken = tokenAt(tokens, position)
  const actualOptions = requiredTypeAnnotationReadOptions(typeAnnotationReadOptionsOrEmpty(options))

  if (startToken !== null && typeof startToken !== 'undefined') {
    lastTokenLine = startToken.line
  }

  let currentToken = tokenAt(tokens, position)

  while (currentToken !== null && typeof currentToken !== 'undefined' && currentToken.type !== 'eof') {
    const token = currentToken

    if (
      genericDepth === 0 &&
      stringArrayIncludes(stopValues, token.value) &&
      !isArrayTypeSuffixClose(parts, token.value)
    ) {
      break
    }

    if (
      genericDepth === 0 &&
      parts.length > 0 &&
      actualOptions.stopAtLineBreak === true &&
      token.line > lastTokenLine
    ) {
      break
    }

    if (
      genericDepth === 0 &&
      parts.length > 0 &&
      actualOptions.stopAtStatementBoundary === true &&
      token.line > lastTokenLine &&
      isStatementBoundaryToken(token)
    ) {
      break
    }

    if (token.value === '<') {
      genericDepth = genericDepth + 1
    } else if (token.value === '>' && genericDepth > 0) {
      genericDepth = genericDepth - 1
    }

    if (token.value === 'readonly') {
      position = position + 1
      currentToken = tokenAt(tokens, position)
      continue
    }

    if (token.type === 'string') {
      parts.push('string')
    } else if (token.type === 'number') {
      parts.push('number')
    } else {
      parts.push(token.value)
    }
    lastTokenLine = token.line
    position = position + 1
    currentToken = tokenAt(tokens, position)
  }

  return {
    typeName: normalizeTypeName(joinStrings(parts, '')),
    position
  }
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

function stringArrayValueAt(values: string[], index: number): string {
  return values[index]
}

function typeAnnotationReadOptionsOrEmpty(options: TypeAnnotationReadOptions | null): TypeAnnotationReadOptions {
  if (options !== null && typeof options !== 'undefined') {
    return options
  }

  return {}
}

function requiredTypeAnnotationReadOptions(options: TypeAnnotationReadOptions): RequiredTypeAnnotationReadOptions {
  return {
    stopAtLineBreak: options.stopAtLineBreak === true,
    stopAtStatementBoundary: options.stopAtStatementBoundary === true
  }
}

function tokenAt(tokens: Token[], position: number): Token | null {
  if (position < 0) {
    return null
  }

  if (position >= tokens.length) {
    return null
  }

  return tokens[position]
}

function stringArrayIncludes(values: string[], value: string): boolean {
  for (const item of values) {
    if (item === value) {
      return true
    }
  }

  return false
}

function isArrayTypeSuffixClose(parts: string[], value: string): boolean {
  return value === ']' && parts.length > 0 && parts[parts.length - 1] === '['
}

export function normalizeTypeName(name: string): string {
  if (isFunctionTypeName(name)) {
    return 'function'
  }

  const unionArgs = splitUnionArgs(name)

  if (unionArgs.length > 1) {
    return normalizeUnionTypeNames(unionArgs)
  }

  const nullableInner = genericTypeInner(name, 'nullable')

  if (nullableInner !== null && typeof nullableInner !== 'undefined') {
    return `nullable<${normalizeTypeName(nullableInner)}>`
  }

  const unionInner = genericTypeInner(name, 'union')

  if (unionInner !== null && typeof unionInner !== 'undefined') {
    const args = splitGenericArgs(unionInner)

    if (args.length === 0) {
      return 'unknown'
    }

    return normalizeUnionTypeNames(args)
  }

  if (name.endsWith('[]')) {
    return `array<${normalizeTypeName(name.slice(0, -2))}>`
  }

  const normalizedArrayInner = genericTypeInner(name, 'array')

  if (normalizedArrayInner !== null && typeof normalizedArrayInner !== 'undefined') {
    return `array<${normalizeTypeName(normalizedArrayInner)}>`
  }

  const arrayInner = genericTypeInner(name, 'Array')

  if (arrayInner !== null && typeof arrayInner !== 'undefined') {
    return `array<${normalizeTypeName(arrayInner)}>`
  }

  const normalizedMapInner = genericTypeInner(name, 'map')

  if (normalizedMapInner !== null && typeof normalizedMapInner !== 'undefined') {
    const args = splitGenericArgs(normalizedMapInner)

    if (args.length === 2) {
      return `map<${normalizeTypeName(args[0])},${normalizeTypeName(args[1])}>`
    }

    return 'map'
  }

  const mapInner = genericTypeInner(name, 'Map')

  if (mapInner !== null && typeof mapInner !== 'undefined') {
    const args = splitGenericArgs(mapInner)

    if (args.length === 2) {
      return `map<${normalizeTypeName(args[0])},${normalizeTypeName(args[1])}>`
    }

    return 'map'
  }

  const normalizedRecordInner = genericTypeInner(name, 'record')

  if (normalizedRecordInner !== null && typeof normalizedRecordInner !== 'undefined') {
    const args = splitGenericArgs(normalizedRecordInner)

    if (args.length === 2) {
      return `record<${normalizeTypeName(args[0])},${normalizeTypeName(args[1])}>`
    }

    return 'object'
  }

  const recordInner = genericTypeInner(name, 'Record')

  if (recordInner !== null && typeof recordInner !== 'undefined') {
    const args = splitGenericArgs(recordInner)

    if (args.length === 2) {
      return `record<${normalizeTypeName(args[0])},${normalizeTypeName(args[1])}>`
    }

    return 'object'
  }

  const normalizedSetInner = genericTypeInner(name, 'set')

  if (normalizedSetInner !== null && typeof normalizedSetInner !== 'undefined') {
    const args = splitGenericArgs(normalizedSetInner)

    if (args.length === 1) {
      return `set<${normalizeTypeName(args[0])}>`
    }

    return 'set'
  }

  const setInner = genericTypeInner(name, 'Set')

  if (setInner !== null && typeof setInner !== 'undefined') {
    const args = splitGenericArgs(setInner)

    if (args.length === 1) {
      return `set<${normalizeTypeName(args[0])}>`
    }

    return 'set'
  }

  const normalizedPromiseInner = genericTypeInner(name, 'promise')

  if (normalizedPromiseInner !== null && typeof normalizedPromiseInner !== 'undefined') {
    const args = splitGenericArgs(normalizedPromiseInner)

    if (args.length === 1) {
      return `promise<${normalizeTypeName(args[0])}>`
    }

    return 'promise'
  }

  const promiseInner = genericTypeInner(name, 'Promise')

  if (promiseInner !== null && typeof promiseInner !== 'undefined') {
    const args = splitGenericArgs(promiseInner)

    if (args.length === 1) {
      return `promise<${normalizeTypeName(args[0])}>`
    }

    return 'promise'
  }

  if (isSimpleTypeName(name)) {
    return name
  }

  if (name === 'Array' || name === 'array') {
    return 'array'
  }

  if (name === 'Map' || name === 'map') {
    return 'map'
  }

  if (name === 'Set' || name === 'set') {
    return 'set'
  }

  if (name === 'Promise' || name === 'promise') {
    return 'promise'
  }

  if (name === 'Function' || name === 'function') {
    return 'function'
  }

  if (name === 'true' || name === 'false') {
    return 'boolean'
  }

  if (name === 'any') {
    return 'unknown'
  }

  if (isIdentifierTypeName(name)) {
    return name
  }

  return 'unknown'
}

function normalizeUnionTypeNames(unionArgs: string[]): string {
  const normalized: string[] = []
  const withoutNullish: string[] = []

  for (let index = 0; index < unionArgs.length; index = index + 1) {
    const arg = stringArrayValueAt(unionArgs, index)
    const normalizedArg = normalizeTypeName(arg)
    normalized.push(normalizedArg)

    if (!isAbsentTypeName(normalizedArg)) {
      withoutNullish.push(normalizedArg)
    }
  }

  if (allStringsSame(normalized)) {
    return normalized[0]
  }

  if (withoutNullish.length === 0) {
    return 'unknown'
  }

  if (normalized.length > withoutNullish.length) {
    if (withoutNullish.length === 1) {
      return `nullable<${withoutNullish[0]}>`
    }

    return `nullable<union<${joinStrings(withoutNullish, ',')}>>`
  }

  return `union<${joinStrings(normalized, ',')}>`
}

function allStringsSame(values: string[]): boolean {
  if (values.length === 0) {
    return false
  }

  const first = values[0]

  for (const value of values) {
    if (value !== first) {
      return false
    }
  }

  return true
}

function isAbsentTypeName(name: string): boolean {
  return name === 'null' || name === 'undefined'
}

function isFunctionTypeName(name: string): boolean {
  if (!name.startsWith('(')) {
    return false
  }

  const arrow = functionTypeArrowIndex(name)

  return arrow > 0
}

function functionTypeArrowIndex(name: string): number {
  let parenDepth = 0
  let genericDepth = 0

  for (let index = 0; index < name.length - 1; index = index + 1) {
    const current = name[index]
    const next = name[index + 1]

    if (current === '<') {
      genericDepth = genericDepth + 1
    } else if (current === '>' && genericDepth > 0) {
      genericDepth = genericDepth - 1
    } else if (current === '(') {
      parenDepth = parenDepth + 1
    } else if (current === ')' && parenDepth > 0) {
      parenDepth = parenDepth - 1
    }

    if (current === '=' && next === '>' && parenDepth === 0 && genericDepth === 0) {
      return index
    }
  }

  return -1
}

function genericTypeInner(name: string, wrapper: string): string | null {
  const prefix = `${wrapper}<`

  if (!name.startsWith(prefix)) {
    return null
  }

  if (!name.endsWith('>')) {
    return null
  }

  const inner = name.slice(prefix.length, name.length - 1)

  if (inner.length === 0) {
    return null
  }

  return inner
}

function isSimpleTypeName(name: string): boolean {
  if (name === 'number') {
    return true
  }

  if (name === 'string') {
    return true
  }

  if (name === 'boolean') {
    return true
  }

  if (name === 'void') {
    return true
  }

  if (name === 'null') {
    return true
  }

  if (name === 'unknown') {
    return true
  }

  return false
}

function isIdentifierTypeName(name: string): boolean {
  if (name.length === 0) {
    return false
  }

  if (!isIdentifierStartChar(name.slice(0, 1))) {
    return false
  }

  let index = 1

  while (index < name.length) {
    if (!isIdentifierPartChar(name.slice(index, index + 1))) {
      return false
    }

    index = index + 1
  }

  return true
}

function isIdentifierStartChar(ch: string): boolean {
  if (ch === '_' || ch === '$') {
    return true
  }

  const code = ch.charCodeAt(0)

  if (code >= 65 && code <= 90) {
    return true
  }

  if (code >= 97 && code <= 122) {
    return true
  }

  return false
}

function isIdentifierPartChar(ch: string): boolean {
  if (isIdentifierStartChar(ch)) {
    return true
  }

  const code = ch.charCodeAt(0)

  if (code >= 48 && code <= 57) {
    return true
  }

  return false
}

function isStatementBoundaryToken(token: Token): boolean {
  if (token.type !== 'keyword') {
    return false
  }

  if (token.value === 'async') {
    return true
  }

  if (token.value === 'class') {
    return true
  }

  if (token.value === 'const') {
    return true
  }

  if (token.value === 'export') {
    return true
  }

  if (token.value === 'function') {
    return true
  }

  if (token.value === 'import') {
    return true
  }

  if (token.value === 'let') {
    return true
  }

  if (token.value === 'type') {
    return true
  }

  return false
}
