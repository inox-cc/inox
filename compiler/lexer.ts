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

  if (options.file !== null && typeof options.file !== 'undefined') {
    state.file = options.file
  }

  while (state.index < state.source.length) {
    const unit = lexerCurrentChar(state)

    if (unit === ' ' || unit === '\t' || unit === '\r') {
      advanceLexer(state, unit)
      continue
    }

    if (unit === '\n') {
      advanceLexer(state, unit)
      continue
    }

    if (state.index === 0 && unit === '#' && lexerNextChar(state) === '!') {
      skipLineComment(state)
      continue
    }

    if (unit === '/' && lexerNextChar(state) === '/') {
      skipLineComment(state)
      continue
    }

    if (unit === '/' && lexerNextChar(state) === '*') {
      skipBlockComment(state)
      continue
    }

    if (unit === '/' && canStartRegexpLiteral(state)) {
      state.tokens.push(readRegexpToken(state))
      continue
    }

    if (unit === "'" || unit === '"') {
      state.tokens.push(readStringToken(state, unit))
      continue
    }

    if (unit === '`') {
      state.tokens.push(readTemplateToken(state))
      continue
    }

    if (isDigit(unit)) {
      state.tokens.push(readNumberToken(state))
      continue
    }

    if (isIdentifierStart(unit)) {
      state.tokens.push(readIdentifierToken(state))
      continue
    }

    if (isPunctuatorStart(unit)) {
      state.tokens.push(readPunctuatorToken(state))
      continue
    }

    state.diagnostics.push(
      diagnostic(
        'INOX_UNKNOWN_CHAR',
        `unknown character ${quoteDiagnosticString(unit)}`,
        lexerLocation(state, state.line, state.column)
      )
    )
    advanceLexer(state, unit)
  }

  state.tokens.push(makeToken('eof', '<eof>', state.line, state.column, state.index, state.file))
  throwDiagnostics(state.diagnostics)

  return state.tokens
}

function lexerCharAt(source: string, index: number): string {
  return source.slice(index, index + 1)
}

function lexerCurrentChar(state: LexerState): string {
  return lexerCharAt(state.source, state.index)
}

function lexerNextChar(state: LexerState): string {
  return lexerCharAt(state.source, state.index + 1)
}

function readStringToken(state: LexerState, quote: string): Token {
  const startLine = state.line
  const startColumn = state.column
  const startIndex = state.index
  const source = state.source
  let value = ''

  advanceLexer(state, quote)

  while (state.index < source.length) {
    const unit = lexerCharAt(source, state.index)

    if (isMatchingStringQuote(unit, quote)) {
      advanceLexer(state, unit)
      return makeToken('string', value, startLine, startColumn, startIndex, state.file)
    }

    if (unit === '\\') {
      value = value + readEscapeValue(state)
    } else {
      value = value + unit
      advanceLexer(state, unit)
    }
  }

  state.diagnostics.push(
    diagnostic('INOX_UNTERMINATED_STRING', 'unterminated string literal', lexerLocation(state, startLine, startColumn))
  )

  return makeToken('string', value, startLine, startColumn, startIndex, state.file)
}

function isMatchingStringQuote(unit: string, quote: string): boolean {
  if (quote === "'") {
    return unit === "'"
  }

  return unit === '"'
}

function readTemplateToken(state: LexerState): Token {
  const startLine = state.line
  const startColumn = state.column
  const startIndex = state.index
  let raw = '`'

  advanceLexer(state, '`')

  while (state.index < state.source.length) {
    const unit = lexerCurrentChar(state)
    raw = raw + unit
    advanceLexer(state, unit)

    if (unit === '\\' && state.index < state.source.length) {
      const escaped = lexerCurrentChar(state)
      raw = raw + escaped
      advanceLexer(state, escaped)
      continue
    }

    if (unit === '$' && state.index < state.source.length && lexerCurrentChar(state) === '{') {
      raw = raw + readTemplatePlaceholderRaw(state)
      continue
    }

    if (unit === '`') {
      return makeToken('template', raw, startLine, startColumn, startIndex, state.file)
    }
  }

  state.diagnostics.push(
    diagnostic(
      'INOX_UNTERMINATED_TEMPLATE',
      'unterminated template literal',
      lexerLocation(state, startLine, startColumn)
    )
  )

  return makeToken('template', raw, startLine, startColumn, startIndex, state.file)
}

function readTemplatePlaceholderRaw(state: LexerState): string {
  let raw = '{'
  let depth = 1

  advanceLexer(state, '{')

  while (state.index < state.source.length && depth > 0) {
    const unit = lexerCurrentChar(state)

    if (unit === "'" || unit === '"') {
      raw = raw + readQuotedRaw(state, unit)
      continue
    }

    if (unit === '`') {
      raw = raw + readNestedTemplateRaw(state)
      continue
    }

    if (unit === '/' && lexerNextChar(state) === '/') {
      raw = raw + readLineCommentRaw(state)
      continue
    }

    if (unit === '/' && lexerNextChar(state) === '*') {
      raw = raw + readBlockCommentRaw(state)
      continue
    }

    raw = raw + unit
    advanceLexer(state, unit)

    if (unit === '{') {
      depth = depth + 1
    } else if (unit === '}') {
      depth = depth - 1
    }
  }

  return raw
}

function readNestedTemplateRaw(state: LexerState): string {
  let raw = '`'

  advanceLexer(state, '`')

  while (state.index < state.source.length) {
    const unit = lexerCurrentChar(state)
    raw = raw + unit
    advanceLexer(state, unit)

    if (unit === '\\' && state.index < state.source.length) {
      const escaped = lexerCurrentChar(state)
      raw = raw + escaped
      advanceLexer(state, escaped)
      continue
    }

    if (unit === '$' && state.index < state.source.length && lexerCurrentChar(state) === '{') {
      raw = raw + readTemplatePlaceholderRaw(state)
      continue
    }

    if (unit === '`') {
      return raw
    }
  }

  return raw
}

function readQuotedRaw(state: LexerState, quote: string): string {
  let raw = quote

  advanceLexer(state, quote)

  while (state.index < state.source.length) {
    const unit = lexerCurrentChar(state)
    raw = raw + unit
    advanceLexer(state, unit)

    if (unit === '\\' && state.index < state.source.length) {
      const escaped = lexerCurrentChar(state)
      raw = raw + escaped
      advanceLexer(state, escaped)
      continue
    }

    if (isMatchingStringQuote(unit, quote)) {
      return raw
    }
  }

  return raw
}

function readLineCommentRaw(state: LexerState): string {
  let raw = ''

  while (state.index < state.source.length && lexerCurrentChar(state) !== '\n') {
    const unit = lexerCurrentChar(state)
    raw = raw + unit
    advanceLexer(state, unit)
  }

  return raw
}

function readBlockCommentRaw(state: LexerState): string {
  let raw = ''

  while (state.index < state.source.length) {
    const unit = lexerCurrentChar(state)
    raw = raw + unit
    advanceLexer(state, unit)

    if (unit === '*' && state.index < state.source.length && lexerCurrentChar(state) === '/') {
      raw = raw + '/'
      advanceLexer(state, '/')
      return raw
    }
  }

  return raw
}

function readNumberToken(state: LexerState): Token {
  const startLine = state.line
  const startColumn = state.column
  const startIndex = state.index
  let value = ''

  while (state.index < state.source.length && isDigit(lexerCurrentChar(state))) {
    const unit = lexerCurrentChar(state)
    value = value + unit
    advanceLexer(state, unit)
  }

  if (lexerCurrentChar(state) === '.') {
    value = value + '.'
    advanceLexer(state, '.')

    while (state.index < state.source.length && isDigit(lexerCurrentChar(state))) {
      const unit = lexerCurrentChar(state)
      value = value + unit
      advanceLexer(state, unit)
    }
  }

  return makeToken('number', value, startLine, startColumn, startIndex, state.file)
}

function readRegexpToken(state: LexerState): Token {
  const startLine = state.line
  const startColumn = state.column
  const startIndex = state.index
  let value = '/'
  let inClass = false

  advanceLexer(state, '/')

  while (state.index < state.source.length) {
    const unit = lexerCurrentChar(state)

    if (unit === '\n') {
      state.diagnostics.push(
        diagnostic(
          'INOX_UNTERMINATED_REGEXP',
          'unterminated regular expression literal',
          lexerLocation(state, startLine, startColumn)
        )
      )
      return makeToken('regexp', value, startLine, startColumn, startIndex, state.file)
    }

    value = value + unit
    advanceLexer(state, unit)

    if (unit === '\\' && state.index < state.source.length) {
      const escaped = lexerCurrentChar(state)
      value = value + escaped
      advanceLexer(state, escaped)
      continue
    }

    if (unit === '[') {
      inClass = true
      continue
    }

    if (unit === ']') {
      inClass = false
      continue
    }

    if (unit === '/' && !inClass) {
      while (state.index < state.source.length && isIdentifierPart(lexerCurrentChar(state))) {
        const flag = lexerCurrentChar(state)
        value = value + flag
        advanceLexer(state, flag)
      }

      return makeToken('regexp', value, startLine, startColumn, startIndex, state.file)
    }
  }

  state.diagnostics.push(
    diagnostic(
      'INOX_UNTERMINATED_REGEXP',
      'unterminated regular expression literal',
      lexerLocation(state, startLine, startColumn)
    )
  )

  return makeToken('regexp', value, startLine, startColumn, startIndex, state.file)
}

function readIdentifierToken(state: LexerState): Token {
  const startLine = state.line
  const startColumn = state.column
  const startIndex = state.index
  let value = ''

  while (state.index < state.source.length && isIdentifierPart(lexerCurrentChar(state))) {
    const unit = lexerCurrentChar(state)
    value = value + unit
    advanceLexer(state, unit)
  }

  let tokenType = 'identifier'

  if (isKeyword(value)) {
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
  let value = lexerCurrentChar(state)

  if (isThreeCharPunctuator(three)) {
    value = three
  } else if (isTwoCharPunctuator(two)) {
    value = two
  }

  for (let index = 0; index < value.length; index = index + 1) {
    const unit = value[index]
    advanceLexer(state, unit)
  }

  return makeToken('punctuator', value, startLine, startColumn, startIndex, state.file)
}

function readEscapeValue(state: LexerState): string {
  advanceLexer(state, '\\')

  if (state.index >= state.source.length) {
    return '\\'
  }

  const unit = lexerCurrentChar(state)
  advanceLexer(state, unit)

  if (unit === 'n') {
    return '\n'
  }

  if (unit === 't') {
    return '\t'
  }

  if (unit === 'r') {
    return '\r'
  }

  if (unit === 'f') {
    return '\f'
  }

  if (unit === 'v') {
    return '\v'
  }

  return unit
}

function skipLineComment(state: LexerState): void {
  while (state.index < state.source.length && lexerCurrentChar(state) !== '\n') {
    advanceLexer(state, lexerCurrentChar(state))
  }
}

function skipBlockComment(state: LexerState): void {
  advanceLexer(state, '/')
  advanceLexer(state, '*')

  while (state.index < state.source.length) {
    if (lexerCurrentChar(state) === '*' && lexerNextChar(state) === '/') {
      advanceLexer(state, '*')
      advanceLexer(state, '/')
      return
    }

    advanceLexer(state, lexerCurrentChar(state))
  }
}

function advanceLexer(state: LexerState, unit: string): void {
  state.index = state.index + 1

  if (unit === '\n') {
    state.line = state.line + 1
    state.column = 1
  } else {
    state.column = state.column + 1
  }
}

function lexerLocation(state: LexerState, line: number, column: number): SourceLocation {
  const file = state.file

  if (file !== null && typeof file !== 'undefined') {
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

function makeToken(
  tokenType: string,
  value: string,
  line: number,
  column: number,
  index: number,
  file: string | null
): Token {
  const token: Token = {
    type: tokenType,
    value,
    line,
    column,
    index
  }

  if (file !== null && typeof file !== 'undefined') {
    token.file = file
  }

  return token
}

function canStartRegexpLiteral(state: LexerState): boolean {
  const previous = previousToken(state)

  if (previous === null || typeof previous === 'undefined') {
    return true
  }

  if (previous.type === 'keyword') {
    return isRegexpPrefixKeyword(previous.value)
  }

  if (previous.type !== 'punctuator') {
    return false
  }

  return isRegexpPrefixPunctuator(previous.value)
}

function previousToken(state: LexerState): Token | null {
  if (state.tokens.length === 0) {
    return null
  }

  return state.tokens[state.tokens.length - 1]
}

function isRegexpPrefixKeyword(value: string): boolean {
  return (
    value === 'case' ||
    value === 'delete' ||
    value === 'else' ||
    value === 'in' ||
    value === 'instanceof' ||
    value === 'new' ||
    value === 'return' ||
    value === 'throw' ||
    value === 'typeof'
  )
}

function isRegexpPrefixPunctuator(value: string): boolean {
  return (
    value === '(' ||
    value === '{' ||
    value === '[' ||
    value === ',' ||
    value === ';' ||
    value === ':' ||
    value === '=' ||
    value === '==' ||
    value === '===' ||
    value === '!=' ||
    value === '!==' ||
    value === '!' ||
    value === '&&' ||
    value === '||' ||
    value === '??' ||
    value === '?' ||
    value === '+' ||
    value === '-' ||
    value === '*' ||
    value === '%' ||
    value === '<' ||
    value === '>' ||
    value === '<=' ||
    value === '>=' ||
    value === '=>'
  )
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

function isKeyword(value: string): boolean {
  return (
    value === 'async' ||
    value === 'await' ||
    value === 'break' ||
    value === 'case' ||
    value === 'catch' ||
    value === 'class' ||
    value === 'const' ||
    value === 'constructor' ||
    value === 'continue' ||
    value === 'default' ||
    value === 'delete' ||
    value === 'export' ||
    value === 'false' ||
    value === 'finally' ||
    value === 'for' ||
    value === 'function' ||
    value === 'from' ||
    value === 'else' ||
    value === 'if' ||
    value === 'in' ||
    value === 'import' ||
    value === 'let' ||
    value === 'new' ||
    value === 'null' ||
    value === 'of' ||
    value === 'readonly' ||
    value === 'return' ||
    value === 'switch' ||
    value === 'this' ||
    value === 'true' ||
    value === 'throw' ||
    value === 'typeof' ||
    value === 'type' ||
    value === 'try' ||
    value === 'var' ||
    value === 'while'
  )
}

function isThreeCharPunctuator(value: string): boolean {
  return value === '===' || value === '!==' || value === '...'
}

function isTwoCharPunctuator(value: string): boolean {
  return (
    value === '=' + '=' ||
    value === '!' + '=' ||
    value === '<=' ||
    value === '>=' ||
    value === '&&' ||
    value === '||' ||
    value === '??' ||
    value === '?.' ||
    value === '=>' ||
    value === '++' ||
    value === '--'
  )
}

function isPunctuatorStart(value: string): boolean {
  return (
    value === '(' ||
    value === ')' ||
    value === '{' ||
    value === '}' ||
    value === '[' ||
    value === ']' ||
    value === ':' ||
    value === ';' ||
    value === '.' ||
    value === ',' ||
    value === '=' ||
    value === '+' ||
    value === '-' ||
    value === '*' ||
    value === '/' ||
    value === '%' ||
    value === '<' ||
    value === '>' ||
    value === '!' ||
    value === '&' ||
    value === '|' ||
    value === '?'
  )
}
