import { splitGenericArgs, splitUnionArgs } from '../type-names.ts'
import type { Token } from '../types.ts'

export type TypeAnnotationReadOptions = {
  stopAtLineBreak?: boolean
  stopAtStatementBoundary?: boolean
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
  const actualOptions = typeAnnotationReadOptionsOrEmpty(options)

  if (startToken != null) {
    lastTokenLine = startToken.line
  }

  let currentToken = tokenAt(tokens, position)

  while (currentToken != null && currentToken.type !== 'eof') {
    const token = currentToken

    if (genericDepth === 0 && stringArrayIncludes(stopValues, token.value) && !isArrayTypeSuffixClose(parts, token.value)) {
      break
    }

    if (genericDepth === 0 && parts.length > 0 && actualOptions.stopAtLineBreak === true && token.line > lastTokenLine) {
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
    typeName: normalizeTypeName(parts.join('')),
    position
  }
}

function typeAnnotationReadOptionsOrEmpty(options: TypeAnnotationReadOptions | null): TypeAnnotationReadOptions {
  if (options != null) {
    return options
  }

  return {}
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
  const unionArgs = splitUnionArgs(name)

  if (unionArgs.length > 1) {
    const normalized: string[] = []
    const withoutNull: string[] = []

    for (const arg of unionArgs) {
      const normalizedArg = normalizeTypeName(arg)
      normalized.push(normalizedArg)

      if (normalizedArg !== 'null') {
        withoutNull.push(normalizedArg)
      }
    }

    if (allStringsSame(normalized)) {
      return normalized[0]
    }

    if (normalized.length === 2 && withoutNull.length === 1) {
      return `nullable<${withoutNull[0]}>`
    }

    return 'unknown'
  }

  if (name.endsWith('[]')) {
    return `array<${normalizeTypeName(name.slice(0, -2))}>`
  }

  const arrayInner = genericTypeInner(name, 'Array')

  if (arrayInner != null) {
    return `array<${normalizeTypeName(arrayInner)}>`
  }

  const mapInner = genericTypeInner(name, 'Map')

  if (mapInner != null) {
    const args = splitGenericArgs(mapInner)

    if (args.length === 2) {
      return `map<${normalizeTypeName(args[0])},${normalizeTypeName(args[1])}>`
    }

    return 'map'
  }

  const setInner = genericTypeInner(name, 'Set')

  if (setInner != null) {
    const args = splitGenericArgs(setInner)

    if (args.length === 1) {
      return `set<${normalizeTypeName(args[0])}>`
    }

    return 'set'
  }

  const promiseInner = genericTypeInner(name, 'Promise')

  if (promiseInner != null) {
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

  if (name === 'any') {
    return 'unknown'
  }

  if (isIdentifierTypeName(name)) {
    return name
  }

  return 'unknown'
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

  if (!isIdentifierStartChar(name[0])) {
    return false
  }

  let index = 1

  while (index < name.length) {
    if (!isIdentifierPartChar(name[index])) {
      return false
    }

    index = index + 1
  }

  return true
}

function isIdentifierStartChar(char: string): boolean {
  if (char === '_' || char === '$') {
    return true
  }

  if (char >= 'A' && char <= 'Z') {
    return true
  }

  if (char >= 'a' && char <= 'z') {
    return true
  }

  return false
}

function isIdentifierPartChar(char: string): boolean {
  if (isIdentifierStartChar(char)) {
    return true
  }

  if (char >= '0' && char <= '9') {
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
