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
  options: TypeAnnotationReadOptions = {}
): TypeAnnotationReadResult {
  const parts: string[] = []
  let genericDepth = 0
  let position = startPosition
  let lastTokenLine = tokens[position]?.line ?? 0

  while (tokens[position]?.type !== 'eof') {
    const token = tokens[position]

    if (genericDepth === 0 && stopValues.includes(token.value)) {
      break
    }

    if (genericDepth === 0 && parts.length > 0 && options.stopAtLineBreak === true && token.line > lastTokenLine) {
      break
    }

    if (
      genericDepth === 0 &&
      parts.length > 0 &&
      options.stopAtStatementBoundary === true &&
      token.line > lastTokenLine &&
      isStatementBoundaryToken(token)
    ) {
      break
    }

    if (token.value === '<') {
      genericDepth += 1
    } else if (token.value === '>' && genericDepth > 0) {
      genericDepth -= 1
    }

    parts.push(token.value)
    lastTokenLine = token.line
    position += 1
  }

  return {
    typeName: normalizeTypeName(parts.join('')),
    position
  }
}

export function normalizeTypeName(name: string): string {
  const unionArgs = splitUnionArgs(name)

  if (unionArgs.length > 1) {
    const normalized = unionArgs.map((arg) => normalizeTypeName(arg))
    const withoutNull = normalized.filter((arg) => arg !== 'null')

    return normalized.length === 2 && withoutNull.length === 1 ? `nullable<${withoutNull[0]}>` : 'unknown'
  }

  if (name.endsWith('[]')) {
    return `array<${normalizeTypeName(name.slice(0, -2))}>`
  }

  const arrayMatch = /^Array<(.+)>$/.exec(name)

  if (arrayMatch != null) {
    return `array<${normalizeTypeName(arrayMatch[1])}>`
  }

  const mapMatch = /^Map<(.+)>$/.exec(name)

  if (mapMatch != null) {
    const args = splitGenericArgs(mapMatch[1])

    return args.length === 2 ? `map<${normalizeTypeName(args[0])},${normalizeTypeName(args[1])}>` : 'map'
  }

  const setMatch = /^Set<(.+)>$/.exec(name)

  if (setMatch != null) {
    const args = splitGenericArgs(setMatch[1])

    return args.length === 1 ? `set<${normalizeTypeName(args[0])}>` : 'set'
  }

  const promiseMatch = /^Promise<(.+)>$/.exec(name)

  if (promiseMatch != null) {
    const args = splitGenericArgs(promiseMatch[1])

    return args.length === 1 ? `promise<${normalizeTypeName(args[0])}>` : 'promise'
  }

  if (['number', 'string', 'boolean', 'void', 'null', 'unknown'].includes(name)) {
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

  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : 'unknown'
}

function isStatementBoundaryToken(token: Token): boolean {
  return (
    token.type === 'keyword' &&
    ['async', 'class', 'const', 'export', 'function', 'import', 'let', 'type'].includes(token.value)
  )
}
