import { diagnostic, quoteDiagnosticString, throwDiagnostics } from './diagnostics.ts'
import type { Diagnostic, SourceLocation, Token } from './types.ts'

type TokenizeOptions = {
  file?: string
}

type LexerState = {
  source: string
  tokens: Token[]
  diagnostics: Diagnostic[]
  file: string | null
  index: number
  line: number
  column: number
}

const keywords = new Set([
  'async',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'constructor',
  'continue',
  'default',
  'export',
  'false',
  'finally',
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
  'throw',
  'type',
  'try',
  'var',
  'while'
])

const threeCharPunctuators = new Set(['===', '!=='])
const twoCharPunctuators = new Set(['==', '!=', '<=', '>=', '&&', '||', '??', '?.', '=>', '++', '--'])
const punctuators = new Set([
  '(',
  ')',
  '{',
  '}',
  '[',
  ']',
  ':',
  ';',
  '.',
  ',',
  '=',
  '+',
  '-',
  '*',
  '/',
  '%',
  '<',
  '>',
  '!',
  '&',
  '|',
  '?'
])

export function tokenize(source: string, options: TokenizeOptions): Token[] {
  const state: LexerState = {
    source,
    tokens: [],
    diagnostics: [],
    file: null,
    index: 0,
    line: 1,
    column: 1
  }

  if (options.file != null) {
    state.file = options.file
  }

  while (state.index < state.source.length) {
    const char = state.source[state.index]

    if (char === ' ' || char === '\t' || char === '\r') {
      advanceLexer(state, char)
      continue
    }

    if (char === '\n') {
      advanceLexer(state, char)
      continue
    }

    if (char === '/' && state.source[state.index + 1] === '/') {
      skipLineComment(state)
      continue
    }

    if (char === '/' && state.source[state.index + 1] === '*') {
      skipBlockComment(state)
      continue
    }

    if (char === "'" || char === '"') {
      state.tokens.push(readStringToken(state, char))
      continue
    }

    if (char === '`') {
      state.tokens.push(readTemplateToken(state))
      continue
    }

    if (isDigit(char)) {
      state.tokens.push(readNumberToken(state))
      continue
    }

    if (isIdentifierStart(char)) {
      state.tokens.push(readIdentifierToken(state))
      continue
    }

    if (punctuators.has(char)) {
      state.tokens.push(readPunctuatorToken(state))
      continue
    }

    state.diagnostics.push(
      diagnostic('CCJS_UNKNOWN_CHAR', `unknown character ${quoteDiagnosticString(char)}`, lexerLocation(state, state.line, state.column))
    )
    advanceLexer(state, char)
  }

  state.tokens.push(makeToken('eof', '<eof>', state.line, state.column, state.index, state.file))
  throwDiagnostics(state.diagnostics)

  return state.tokens
}

function readStringToken(state: LexerState, quote: string): Token {
  const startLine = state.line
  const startColumn = state.column
  const startIndex = state.index
  let value = ''

  advanceLexer(state, quote)

  while (state.index < state.source.length) {
    const char = state.source[state.index]

    if (char === quote) {
      advanceLexer(state, char)
      return makeToken('string', value, startLine, startColumn, startIndex, state.file)
    }

    if (char === '\\') {
      value = value + readEscapeValue(state)
    } else {
      value = value + char
      advanceLexer(state, char)
    }
  }

  state.diagnostics.push(
    diagnostic('CCJS_UNTERMINATED_STRING', 'unterminated string literal', lexerLocation(state, startLine, startColumn))
  )

  return makeToken('string', value, startLine, startColumn, startIndex, state.file)
}

function readTemplateToken(state: LexerState): Token {
  const startLine = state.line
  const startColumn = state.column
  const startIndex = state.index
  let raw = '`'

  advanceLexer(state, '`')

  while (state.index < state.source.length) {
    const char = state.source[state.index]
    raw = raw + char
    advanceLexer(state, char)

    if (char === '\\' && state.index < state.source.length) {
      raw = raw + state.source[state.index]
      advanceLexer(state, state.source[state.index])
      continue
    }

    if (char === '`') {
      return makeToken('template', raw, startLine, startColumn, startIndex, state.file)
    }
  }

  state.diagnostics.push(
    diagnostic('CCJS_UNTERMINATED_TEMPLATE', 'unterminated template literal', lexerLocation(state, startLine, startColumn))
  )

  return makeToken('template', raw, startLine, startColumn, startIndex, state.file)
}

function readNumberToken(state: LexerState): Token {
  const startLine = state.line
  const startColumn = state.column
  const startIndex = state.index
  let value = ''

  while (state.index < state.source.length && isDigit(state.source[state.index])) {
    value = value + state.source[state.index]
    advanceLexer(state, state.source[state.index])
  }

  if (state.source[state.index] === '.') {
    value = value + '.'
    advanceLexer(state, '.')

    while (state.index < state.source.length && isDigit(state.source[state.index])) {
      value = value + state.source[state.index]
      advanceLexer(state, state.source[state.index])
    }
  }

  return makeToken('number', value, startLine, startColumn, startIndex, state.file)
}

function readIdentifierToken(state: LexerState): Token {
  const startLine = state.line
  const startColumn = state.column
  const startIndex = state.index
  let value = ''

  while (state.index < state.source.length && isIdentifierPart(state.source[state.index])) {
    value = value + state.source[state.index]
    advanceLexer(state, state.source[state.index])
  }

  let tokenType = 'identifier'

  if (keywords.has(value)) {
    tokenType = 'keyword'
  }

  return makeToken(tokenType, value, startLine, startColumn, startIndex, state.file)
}

function readPunctuatorToken(state: LexerState): Token {
  const startLine = state.line
  const startColumn = state.column
  const startIndex = state.index
  const three = state.source.slice(state.index, state.index + 3)
  const two = state.source.slice(state.index, state.index + 2)
  let value = state.source[state.index]

  if (threeCharPunctuators.has(three)) {
    value = three
  } else if (twoCharPunctuators.has(two)) {
    value = two
  }

  for (const char of value) {
    advanceLexer(state, char)
  }

  return makeToken('punctuator', value, startLine, startColumn, startIndex, state.file)
}

function readEscapeValue(state: LexerState): string {
  advanceLexer(state, '\\')
  const char = state.source[state.index]

  if (char == null) {
    return '\\'
  }

  advanceLexer(state, char)

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

function skipLineComment(state: LexerState): void {
  while (state.index < state.source.length && state.source[state.index] !== '\n') {
    advanceLexer(state, state.source[state.index])
  }
}

function skipBlockComment(state: LexerState): void {
  advanceLexer(state, '/')
  advanceLexer(state, '*')

  while (state.index < state.source.length) {
    if (state.source[state.index] === '*' && state.source[state.index + 1] === '/') {
      advanceLexer(state, '*')
      advanceLexer(state, '/')
      return
    }

    advanceLexer(state, state.source[state.index])
  }
}

function advanceLexer(state: LexerState, char: string): void {
  state.index = state.index + 1

  if (char === '\n') {
    state.line = state.line + 1
    state.column = 1
  } else {
    state.column = state.column + 1
  }
}

function lexerLocation(state: LexerState, line: number, column: number): SourceLocation {
  const file = state.file

  if (file != null) {
    return lexerLocationWithFile(file, line, column)
  }

  return {
    line,
    column
  }
}

function lexerLocationWithFile(file: string, line: number, column: number): SourceLocation {
  return {
    file,
    line,
    column
  }
}

function makeToken(tokenType: string, value: string, line: number, column: number, index: number, file: string | null): Token {
  const token: Token = {
    type: tokenType,
    value,
    line,
    column,
    index
  }

  if (file != null) {
    token.file = file
  }

  return token
}

function isDigit(ch: string): boolean {
  const code = ch.charCodeAt(0)
  return code >= 48 && code <= 57
}

function isIdentifierStart(ch: string): boolean {
  const code = ch.charCodeAt(0)
  return ch === '_' || (code >= 97 && code <= 122) || (code >= 65 && code <= 90)
}

function isIdentifierPart(ch: string): boolean {
  return isIdentifierStart(ch) || isDigit(ch)
}
