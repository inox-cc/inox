import { normalizeTypeName } from '../type-names.ts'
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
  let parenDepth = 0
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
      parenDepth === 0 &&
      stringArrayIncludes(stopValues, token.value) &&
      !isArrayTypeSuffixClose(parts, token.value)
    ) {
      break
    }

    if (
      genericDepth === 0 &&
      parenDepth === 0 &&
      parts.length > 0 &&
      actualOptions.stopAtLineBreak === true &&
      token.line > lastTokenLine
    ) {
      break
    }

    if (
      genericDepth === 0 &&
      parenDepth === 0 &&
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
    } else if (token.value === '(') {
      parenDepth = parenDepth + 1
    } else if (token.value === ')' && parenDepth > 0) {
      parenDepth = parenDepth - 1
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
