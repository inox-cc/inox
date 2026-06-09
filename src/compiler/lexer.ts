import { diagnostic, throwDiagnostics } from './diagnostics.ts'
import type { Diagnostic, Token } from './types.ts'

const keywords = new Set([
  'async',
  'await',
  'break',
  'case',
  'class',
  'const',
  'constructor',
  'continue',
  'default',
  'export',
  'false',
  'for',
  'function',
  'from',
  'else',
  'if',
  'in',
  'import',
  'let',
  'new',
  'null',
  'of',
  'readonly',
  'return',
  'switch',
  'this',
  'true',
  'type',
  'var',
  'while'
])

const threeCharPunctuators = new Set(['===', '!=='])
const twoCharPunctuators = new Set(['<=', '>=', '&&', '||', '?.', '=>'])
const punctuators = new Set(['(', ')', '{', '}', '[', ']', ':', ';', '.', ',', '=', '+', '-', '*', '/', '%', '<', '>', '!', '&', '|', '?'])

export function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  const diagnostics: Diagnostic[] = []
  let index = 0
  let line = 1
  let column = 1

  while (index < source.length) {
    const char = source[index]

    if (char === ' ' || char === '\t' || char === '\r') {
      advance(char)
      continue
    }

    if (char === '\n') {
      advance(char)
      continue
    }

    if (char === '/' && source[index + 1] === '/') {
      skipLineComment()
      continue
    }

    if (char === '/' && source[index + 1] === '*') {
      skipBlockComment()
      continue
    }

    if (char === '\'' || char === '"') {
      tokens.push(readString(char))
      continue
    }

    if (char === '`') {
      tokens.push(readTemplate())
      continue
    }

    if (isDigit(char)) {
      tokens.push(readNumber())
      continue
    }

    if (isIdentifierStart(char)) {
      tokens.push(readIdentifier())
      continue
    }

    if (punctuators.has(char)) {
      tokens.push(readPunctuator())
      continue
    }

    diagnostics.push(diagnostic('CCJS_UNKNOWN_CHAR', `unknown character ${JSON.stringify(char)}`, {
      line,
      column
    }))
    advance(char)
  }

  tokens.push(makeToken('eof', '<eof>', line, column, index))
  throwDiagnostics(diagnostics)

  return tokens

  function readString(quote: string): Token {
    const startLine = line
    const startColumn = column
    const startIndex = index
    let value = ''

    advance(quote)

    while (index < source.length) {
      const char = source[index]

      if (char === quote) {
        advance(char)
        return makeToken('string', value, startLine, startColumn, startIndex)
      }

      if (char === '\\') {
        value += readEscape()
      } else {
        value += char
        advance(char)
      }
    }

    diagnostics.push(diagnostic('CCJS_UNTERMINATED_STRING', 'unterminated string literal', {
      line: startLine,
      column: startColumn
    }))

    return makeToken('string', value, startLine, startColumn, startIndex)
  }

  function readTemplate(): Token {
    const startLine = line
    const startColumn = column
    const startIndex = index
    let raw = '`'

    advance('`')

    while (index < source.length) {
      const char = source[index]
      raw += char
      advance(char)

      if (char === '\\' && index < source.length) {
        raw += source[index]
        advance(source[index])
        continue
      }

      if (char === '`') {
        return makeToken('template', raw, startLine, startColumn, startIndex)
      }
    }

    diagnostics.push(diagnostic('CCJS_UNTERMINATED_TEMPLATE', 'unterminated template literal', {
      line: startLine,
      column: startColumn
    }))

    return makeToken('template', raw, startLine, startColumn, startIndex)
  }

  function readNumber(): Token {
    const startLine = line
    const startColumn = column
    const startIndex = index
    let value = ''

    while (index < source.length && isDigit(source[index])) {
      value += source[index]
      advance(source[index])
    }

    if (source[index] === '.') {
      value += '.'
      advance('.')

      while (index < source.length && isDigit(source[index])) {
        value += source[index]
        advance(source[index])
      }
    }

    return makeToken('number', value, startLine, startColumn, startIndex)
  }

  function readIdentifier(): Token {
    const startLine = line
    const startColumn = column
    const startIndex = index
    let value = ''

    while (index < source.length && isIdentifierPart(source[index])) {
      value += source[index]
      advance(source[index])
    }

    return makeToken(keywords.has(value) ? 'keyword' : 'identifier', value, startLine, startColumn, startIndex)
  }

  function readPunctuator(): Token {
    const startLine = line
    const startColumn = column
    const startIndex = index
    const three = source.slice(index, index + 3)
    const two = source.slice(index, index + 2)
    let value = source[index]

    if (threeCharPunctuators.has(three)) {
      value = three
    } else if (twoCharPunctuators.has(two)) {
      value = two
    }

    for (const char of value) {
      advance(char)
    }

    return makeToken('punctuator', value, startLine, startColumn, startIndex)
  }

  function readEscape(): string {
    advance('\\')
    const char = source[index]

    if (char == null) {
      return '\\'
    }

    advance(char)

    if (char === 'n') {
      return '\n'
    }

    if (char === 't') {
      return '\t'
    }

    if (char === 'r') {
      return '\r'
    }

    return char
  }

  function skipLineComment(): void {
    while (index < source.length && source[index] !== '\n') {
      advance(source[index])
    }
  }

  function skipBlockComment(): void {
    advance('/')
    advance('*')

    while (index < source.length) {
      if (source[index] === '*' && source[index + 1] === '/') {
        advance('*')
        advance('/')
        return
      }

      advance(source[index])
    }
  }

  function advance(char: string): void {
    index += 1

    if (char === '\n') {
      line += 1
      column = 1
    } else {
      column += 1
    }
  }
}

function makeToken(type: string, value: string, line: number, column: number, index: number): Token {
  return {
    type,
    value,
    line,
    column,
    index
  }
}

function isDigit(char: string): boolean {
  return char >= '0' && char <= '9'
}

function isIdentifierStart(char: string): boolean {
  return char === '_' || (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z')
}

function isIdentifierPart(char: string): boolean {
  return isIdentifierStart(char) || isDigit(char)
}
