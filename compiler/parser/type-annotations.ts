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
  let braceDepth = 0
  let bracketDepth = 0
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
      bracketDepth === 0 &&
      braceDepth === 0 &&
      stringArrayIncludes(stopValues, token.value) &&
      token.value !== '['
    ) {
      break
    }

    if (
      genericDepth === 0 &&
      parenDepth === 0 &&
      bracketDepth === 0 &&
      braceDepth === 0 &&
      parts.length > 0 &&
      actualOptions.stopAtLineBreak === true &&
      token.line > lastTokenLine
    ) {
      break
    }

    if (
      genericDepth === 0 &&
      parenDepth === 0 &&
      bracketDepth === 0 &&
      braceDepth === 0 &&
      parts.length > 0 &&
      actualOptions.stopAtStatementBoundary === true &&
      token.line > lastTokenLine &&
      isStatementBoundaryToken(token)
    ) {
      break
    }

    if (token.value === '{') {
      braceDepth = braceDepth + 1
    } else if (token.value === '}' && braceDepth > 0) {
      braceDepth = braceDepth - 1
    } else if (token.value === '<') {
      genericDepth = genericDepth + 1
    } else if (token.value === '>' && genericDepth > 0) {
      genericDepth = genericDepth - 1
    } else if (token.value === '[') {
      bracketDepth = bracketDepth + 1
    } else if (token.value === ']' && bracketDepth > 0) {
      bracketDepth = bracketDepth - 1
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

    if (token.value === 'typeof') {
      parts.push('typeof:')
    } else if (token.type === 'string') {
      parts.push(typeAnnotationStringToken(parts, token.value))
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

function typeAnnotationStringToken(parts: string[], value: string): string {
  if (!typeAnnotationNeedsStringLiteral(parts)) {
    return 'string'
  }

  let escaped = ''

  for (let index = 0; index < value.length; index = index + 1) {
    const unit = value.slice(index, index + 1)

    if (unit === '\\' || unit === "'") {
      escaped = escaped + '\\'
    }

    escaped = escaped + unit
  }

  return `'${escaped}'`
}

function typeAnnotationNeedsStringLiteral(parts: string[]): boolean {
  if (parts.length > 0 && parts[parts.length - 1] === '[') {
    return true
  }

  const genericNames: string[] = []
  const genericArgumentIndexes: number[] = []

  for (let index = 0; index < parts.length; index = index + 1) {
    const part = parts[index]

    if (part === '<') {
      let genericName = ''

      if (index > 0) {
        const previousPart = parts[index - 1]

        if (previousPart) {
          genericName = previousPart
        }
      }

      genericNames.push(genericName)
      genericArgumentIndexes.push(0)
      continue
    }

    if (part === '>') {
      genericNames.pop()
      genericArgumentIndexes.pop()
      continue
    }

    if (part === ',' && genericArgumentIndexes.length > 0) {
      const last = genericArgumentIndexes.length - 1
      genericArgumentIndexes[last] = genericArgumentIndexes[last] + 1
    }
  }

  if (genericNames.length === 0) {
    return false
  }

  const last = genericNames.length - 1
  return genericNames[last] === 'Pick' && genericArgumentIndexes[last] === 1
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

function isStatementBoundaryToken(token: Token): boolean {
  if (token.type === 'identifier') {
    return true
  }

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

  if (token.value === 'if') {
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
