const generatedCColumnLimit = 130
const generatedCJoinChunkSize = 65536

export function formatGeneratedC(code: string, _assumeFilename: string): string {
  return spaceGeneratedCControlFlow(
    wrapGeneratedCLongControlConditions(
      braceGeneratedCSingleLineControls(wrapGeneratedCLongCallStatements(wrapGeneratedCFunctionHeads(code)))
    )
  )
}

function wrapGeneratedCFunctionHeads(code: string): string {
  const source = splitGeneratedCLines(code)
  const mapped: string[] = []

  for (let index = 0; index < source.lines.length; index = index + 1) {
    const line = source.lines[index]

    if (line.length <= generatedCColumnLimit) {
      mapped.push(line)
      continue
    }

    const head = parseGeneratedCFunctionHead(line)

    if (head !== null && typeof head !== 'undefined') {
      if (head.params.length > 1) {
        mapped.push(`${head.indent}${head.prefix}(`)

        for (let paramIndex = 0; paramIndex < head.params.length; paramIndex = paramIndex + 1) {
          let suffix = ','

          if (paramIndex === head.params.length - 1) {
            suffix = ''
          }

          mapped.push(`${head.indent}  ${head.params[paramIndex]}${suffix}`)
        }

        mapped.push(`${head.indent})${head.suffix}`)
      } else {
        mapped.push(line)
      }
    } else {
      mapped.push(line)
    }
  }

  return joinGeneratedCLines(mapped, source.hasTrailingNewline)
}

function wrapGeneratedCLongCallStatements(code: string): string {
  const source = splitGeneratedCLines(code)
  const mapped: string[] = []

  for (let index = 0; index < source.lines.length; index = index + 1) {
    const line = source.lines[index]

    if (line.length <= generatedCColumnLimit) {
      mapped.push(line)
      continue
    }

    const call = parseGeneratedCCallStatement(line)

    if (call === null || call.args.length < 2) {
      mapped.push(line)
      continue
    }

    mapped.push(`${call.indent}${call.prefix}(`)

    for (let argumentIndex = 0; argumentIndex < call.args.length; argumentIndex = argumentIndex + 1) {
      const suffix = argumentIndex + 1 < call.args.length ? ',' : ''
      mapped.push(`${call.indent}  ${call.args[argumentIndex]}${suffix}`)
    }

    const comment = call.comment === null ? '' : ` ${call.comment}`
    mapped.push(`${call.indent});${comment}`)
  }

  return joinGeneratedCLines(mapped, source.hasTrailingNewline)
}

function braceGeneratedCSingleLineControls(code: string): string {
  const source = splitGeneratedCLines(code)
  const mapped: string[] = []

  for (let index = 0; index < source.lines.length; index = index + 1) {
    const line = source.lines[index]
    const control = parseGeneratedCSingleLineControl(line)

    if (control === null || typeof control === 'undefined') {
      mapped.push(line)
      continue
    }

    if (shouldKeepGeneratedCSingleLineControl(control)) {
      if (line.length <= generatedCColumnLimit) {
        mapped.push(line)
      } else {
        mapped.push(`${control.indent}${control.keyword} (`)
        pushGeneratedCLines(
          mapped,
          wrapGeneratedCCondition(control.condition.slice(1, control.condition.length - 1), control.indent)
        )
        mapped.push(`${control.indent}) ${control.statement}`)
      }
      continue
    }

    mapped.push(`${control.indent}${control.keyword} ${control.condition} {`)
    mapped.push(`${control.indent}  ${control.statement}`)
    mapped.push(`${control.indent}}`)
  }

  return joinGeneratedCLines(mapped, source.hasTrailingNewline)
}

function wrapGeneratedCLongControlConditions(code: string): string {
  const source = splitGeneratedCLines(code)
  const mapped: string[] = []

  for (let index = 0; index < source.lines.length; index = index + 1) {
    const line = source.lines[index]

    if (line.length <= generatedCColumnLimit) {
      mapped.push(line)
      continue
    }

    const control = parseGeneratedCControlBlockStart(line)

    if (control !== null && typeof control !== 'undefined') {
      mapped.push(`${control.indent}${control.keyword} (`)
      pushGeneratedCLines(mapped, wrapGeneratedCCondition(control.condition, control.indent))
      mapped.push(`${control.indent}) {`)
    } else {
      mapped.push(line)
    }
  }

  return joinGeneratedCLines(mapped, source.hasTrailingNewline)
}

function spaceGeneratedCControlFlow(code: string): string {
  const source = splitGeneratedCLines(code)
  const lines = source.lines

  const blankBefore: Set<number> = new Set()
  const blankAfter: Set<number> = new Set()

  for (let index = 0; index < lines.length; index = index + 1) {
    if (isGeneratedCGotoLabel(lines[index])) {
      markBlankBefore(lines, index, blankBefore)
    }

    if (shouldKeepGeneratedCSingleLineControlLine(lines[index])) {
      continue
    }

    if (!isGeneratedCControlStart(lines[index])) {
      continue
    }

    markBlankBefore(lines, generatedCLeadingCommentGroupStart(lines, index), blankBefore)

    const end = findGeneratedCControlEnd(lines, index)

    if (end !== null && typeof end !== 'undefined') {
      markBlankAfter(lines, end, blankAfter)
    }
  }

  const spaced: string[] = []

  for (let index = 0; index < lines.length; index = index + 1) {
    if (blankBefore.has(index)) {
      pushGeneratedCBlankLine(spaced)
    }

    spaced.push(lines[index])

    if (blankAfter.has(index)) {
      pushGeneratedCBlankLine(spaced)
    }
  }

  return joinGeneratedCLines(spaced, source.hasTrailingNewline)
}

function shouldKeepGeneratedCSingleLineControlLine(line: string): boolean {
  const control = parseGeneratedCSingleLineControl(line)

  if (control === null || typeof control === 'undefined') {
    return false
  }

  return shouldKeepGeneratedCSingleLineControl(control)
}

type GeneratedCLineSet = {
  lines: string[]
  hasTrailingNewline: boolean
}

function splitGeneratedCLines(code: string): GeneratedCLineSet {
  const lines = code.split('\n')
  const hasTrailingNewline = lines.length > 0 && lines[lines.length - 1] === ''

  if (hasTrailingNewline) {
    lines.pop()
  }

  return {
    lines,
    hasTrailingNewline
  }
}

function joinGeneratedCLines(lines: string[], hasTrailingNewline: boolean): string {
  const chunks: string[] = []
  let chunk = ''
  let result = ''

  for (let index = 0; index < lines.length; index = index + 1) {
    let part = lines[index]

    if (part.trim() === '') {
      part = ''
    }

    if (index > 0) {
      part = `\n${part}`
    }

    if (chunk.length + part.length > generatedCJoinChunkSize && chunk !== '') {
      chunks.push(chunk)
      chunk = ''
    }

    chunk = `${chunk}${part}`
  }

  if (chunk !== '') {
    chunks.push(chunk)
  }

  for (let index = 0; index < chunks.length; index = index + 1) {
    result = `${result}${chunks[index]}`
  }

  if (hasTrailingNewline) {
    return `${result}\n`
  }

  return result
}

function pushGeneratedCLines(target: string[], source: string[]): void {
  for (let index = 0; index < source.length; index = index + 1) {
    target.push(source[index])
  }
}

function generatedCLeadingWhitespace(value: string): string {
  let end = 0

  while (end < value.length && isGeneratedCWhitespace(value[end])) {
    end = end + 1
  }

  return value.slice(0, end)
}

function trimGeneratedCEnd(value: string): string {
  let end = value.length

  while (end > 0 && isGeneratedCWhitespace(value[end - 1])) {
    end = end - 1
  }

  return value.slice(0, end)
}

function isGeneratedCWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n'
}

function isGeneratedCIdentifierStart(ch: string): boolean {
  const code = ch.charCodeAt(0)

  return ch === '_' || (code >= 65 && code <= 90) || (code >= 97 && code <= 122)
}

function isGeneratedCIdentifierPart(ch: string): boolean {
  const code = ch.charCodeAt(0)
  return isGeneratedCIdentifierStart(ch) || (code >= 48 && code <= 57)
}

function generatedCStringStartsWithAt(value: string, search: string, start: number): boolean {
  if (start < 0 || start + search.length > value.length) {
    return false
  }

  for (let index = 0; index < search.length; index = index + 1) {
    if (value[start + index] !== search[index]) {
      return false
    }
  }

  return true
}

function hasGeneratedCFunctionNamePrefix(prefix: string): boolean {
  if (prefix.length === 0) {
    return false
  }

  let start = prefix.length - 1

  while (start >= 0 && isGeneratedCIdentifierPart(prefix[start])) {
    start = start - 1
  }

  const nameStart = start + 1

  if (nameStart >= prefix.length || !isGeneratedCIdentifierStart(prefix[nameStart])) {
    return false
  }

  return start >= 0 && isGeneratedCWhitespace(prefix[start])
}

function isGeneratedCCallCallee(callee: string): boolean {
  let start = 0

  if (generatedCStringStartsWithAt(callee, '!', 0)) {
    start = 1
  }

  if (start >= callee.length || !isGeneratedCIdentifierStart(callee[start])) {
    return false
  }

  for (let index = start + 1; index < callee.length; index = index + 1) {
    if (!isGeneratedCIdentifierPart(callee[index])) {
      return false
    }
  }

  return true
}

function startsWithGeneratedCControlKeyword(value: string): boolean {
  return (
    startsWithGeneratedCKeyword(value, 'if') ||
    startsWithGeneratedCKeyword(value, 'for') ||
    startsWithGeneratedCKeyword(value, 'while')
  )
}

function startsWithGeneratedCKeyword(value: string, keyword: string): boolean {
  if (!generatedCStringStartsWithAt(value, keyword, 0)) {
    return false
  }

  if (value.length === keyword.length) {
    return true
  }

  return !isGeneratedCIdentifierPart(value[keyword.length])
}

type GeneratedCControlPrefix = {
  indent: string
  keyword: string
  conditionSearchStart: number
}

function parseGeneratedCControlPrefix(line: string): GeneratedCControlPrefix | null {
  const indent = generatedCLeadingWhitespace(line)
  let cursor = indent.length
  let keyword: string | null = null

  if (generatedCStringStartsWithAt(line, 'if', cursor)) {
    keyword = 'if'
  } else if (generatedCStringStartsWithAt(line, 'for', cursor)) {
    keyword = 'for'
  } else if (generatedCStringStartsWithAt(line, 'while', cursor)) {
    keyword = 'while'
  }

  if (keyword !== null && typeof keyword !== 'undefined') {
    cursor = cursor + keyword.length

    if (cursor >= line.length || !isGeneratedCWhitespace(line[cursor])) {
      return null
    }

    while (cursor < line.length && isGeneratedCWhitespace(line[cursor])) {
      cursor = cursor + 1
    }

    return {
      indent,
      keyword,
      conditionSearchStart: cursor
    }
  }

  return null
}

type GeneratedCFunctionHead = {
  indent: string
  prefix: string
  params: string[]
  suffix: string
}

type GeneratedCCallStatement = {
  indent: string
  prefix: string
  args: string[]
  comment: string | null
}

type GeneratedCLineComment = {
  statement: string
  comment: string | null
}

type GeneratedCBraceScanResult = {
  open: number
  close: number
}

function parseGeneratedCFunctionHead(line: string): GeneratedCFunctionHead | null {
  const indent = generatedCLeadingWhitespace(line)
  const trimmed = line.trim()

  if (
    generatedCStringStartsWithAt(trimmed, '#', 0) ||
    generatedCStringStartsWithAt(trimmed, 'typedef ', 0) ||
    generatedCStringStartsWithAt(trimmed, 'return ', 0) ||
    isGeneratedCControlStart(trimmed)
  ) {
    return null
  }

  let suffix: string | null = null

  if (trimmed.endsWith(';')) {
    suffix = ';'
  } else if (trimmed.endsWith('{')) {
    suffix = ' {'
  }

  if (suffix === null || typeof suffix === 'undefined') {
    return null
  }

  const closeParen = trimmed.lastIndexOf(')')

  if (closeParen < 0 || trimmed.slice(closeParen + 1).trim() !== suffix.trim()) {
    return null
  }

  const openParen = trimmed.indexOf('(')

  if (openParen < 0 || openParen > closeParen) {
    return null
  }

  const prefix = trimmed.slice(0, openParen)

  if (!hasGeneratedCFunctionNamePrefix(prefix) || prefix.includes('=')) {
    return null
  }

  const params = splitGeneratedCParameters(trimmed.slice(openParen + 1, closeParen))

  if (
    params === null ||
    typeof params === 'undefined' ||
    params.length === 0 ||
    (params.length === 1 && params[0] === 'void')
  ) {
    return null
  }

  return {
    indent,
    prefix,
    params,
    suffix
  }
}

function parseGeneratedCCallStatement(line: string): GeneratedCCallStatement | null {
  const lineComment = splitGeneratedCLineComment(line)
  const indent = generatedCLeadingWhitespace(lineComment.statement)
  const statement = lineComment.statement.trim()

  if (
    statement === '' ||
    generatedCStringStartsWithAt(statement, '#', 0) ||
    isGeneratedCControlStart(statement) ||
    !statement.endsWith(';')
  ) {
    return null
  }

  const closeParen = statement.length - 2

  if (closeParen < 0 || statement.slice(closeParen, closeParen + 1) !== ')') {
    return null
  }

  const openParen = statement.indexOf('(')

  if (openParen < 0) {
    return null
  }

  if ((findGeneratedCMatchingParen(statement, openParen) ?? -1) !== closeParen) {
    return null
  }

  const prefix = statement.slice(0, openParen)

  if (prefix === '' || prefix.endsWith(' ') || prefix.endsWith('=')) {
    return null
  }

  const args = splitGeneratedCParameters(statement.slice(openParen + 1, closeParen))

  if (args === null) {
    return null
  }

  return {
    indent,
    prefix,
    args,
    comment: lineComment.comment
  }
}

function splitGeneratedCParameters(source: string): string[] | null {
  const params: string[] = []
  let start = 0
  let depth = 0
  let quote: '"' | "'" | null = null
  let escaped = false

  for (let index = 0; index < source.length; index = index + 1) {
    const character = source[index]

    if (quote !== null && typeof quote !== 'undefined') {
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === quote) {
        quote = null
      }

      continue
    }

    if (character === '"' || character === "'") {
      quote = character
      continue
    }

    if (character === '(' || character === '[' || character === '{') {
      depth = depth + 1
    } else if (character === ')' || character === ']' || character === '}') {
      depth = depth - 1
    } else if (character === ',' && depth === 0) {
      params.push(source.slice(start, index).trim())
      start = index + 1
    }
  }

  if ((quote !== null && typeof quote !== 'undefined') || depth !== 0) {
    return null
  }

  params.push(source.slice(start).trim())

  for (let index = 0; index < params.length; index = index + 1) {
    if (params[index] === '') {
      return null
    }
  }

  return params
}

type GeneratedCSingleLineControl = {
  indent: string
  keyword: string
  condition: string
  statement: string
}

type GeneratedCControlBlockStart = {
  indent: string
  keyword: string
  condition: string
}

type GeneratedCCallCondition = {
  callee: string
  args: string[]
  suffix: string
}

function parseGeneratedCSingleLineControl(line: string): GeneratedCSingleLineControl | null {
  const control = parseGeneratedCControlPrefix(line)

  if (control !== null && typeof control !== 'undefined') {
    const indent = control.indent
    const keyword = control.keyword
    const conditionStart = line.indexOf('(', control.conditionSearchStart)

    if (conditionStart < 0) {
      return null
    }

    const conditionEnd = findGeneratedCMatchingParen(line, conditionStart)

    if (conditionEnd === null || typeof conditionEnd === 'undefined') {
      return null
    }

    const condition = line.slice(conditionStart, conditionEnd + 1)
    const rest = line.slice(conditionEnd + 1).trim()

    if (
      rest === '' ||
      generatedCStringStartsWithAt(rest, '{', 0) ||
      generatedCStringStartsWithAt(rest, ';', 0) ||
      generatedCStringStartsWithAt(rest, '/*', 0)
    ) {
      return null
    }

    const lineComment = splitGeneratedCLineComment(rest)
    const statement = lineComment.statement
    const comment = lineComment.comment

    if (!statement.endsWith(';')) {
      return null
    }

    let nextStatement = statement

    if (comment !== null && typeof comment !== 'undefined') {
      nextStatement = `${statement} ${comment}`
    }

    return {
      indent,
      keyword,
      condition,
      statement: nextStatement
    }
  }

  return null
}

function shouldKeepGeneratedCSingleLineControl(control: GeneratedCSingleLineControl): boolean {
  if (control.keyword !== 'if') {
    return false
  }

  const statement = control.statement.trim()

  return (
    statement === 'return;' ||
    generatedCStringStartsWithAt(statement, 'return ', 0) ||
    generatedCStringStartsWithAt(statement, 'goto ', 0) ||
    statement === 'break;' ||
    statement === 'continue;'
  )
}

function parseGeneratedCControlBlockStart(line: string): GeneratedCControlBlockStart | null {
  const control = parseGeneratedCControlPrefix(line)

  if (control !== null && typeof control !== 'undefined') {
    const indent = control.indent
    const keyword = control.keyword
    const conditionStart = line.indexOf('(', control.conditionSearchStart)

    if (conditionStart < 0) {
      return null
    }

    const conditionEnd = findGeneratedCMatchingParen(line, conditionStart)

    if (conditionEnd === null || typeof conditionEnd === 'undefined' || line.slice(conditionEnd + 1).trim() !== '{') {
      return null
    }

    return {
      indent,
      keyword,
      condition: line.slice(conditionStart + 1, conditionEnd)
    }
  }

  return null
}

function wrapGeneratedCCondition(condition: string, indent: string): string[] {
  const logicalParts = splitGeneratedCLogicalCondition(condition)

  if (logicalParts.length > 1) {
    const lines: string[] = []

    for (let index = 0; index < logicalParts.length; index = index + 1) {
      lines.push(`${indent}  ${logicalParts[index]}`)
    }

    return lines
  }

  const call = parseGeneratedCCallCondition(condition)

  if (call !== null && typeof call !== 'undefined') {
    if (call.args.length > 1) {
      const lines: string[] = []
      lines.push(`${indent}  ${call.callee}(`)

      for (let index = 0; index < call.args.length; index = index + 1) {
        let suffix = ','

        if (index === call.args.length - 1) {
          suffix = ''
        }

        lines.push(`${indent}    ${call.args[index]}${suffix}`)
      }

      lines.push(`${indent}  )${call.suffix}`)
      return lines
    }
  }

  return [`${indent}  ${condition}`]
}

function splitGeneratedCLogicalCondition(condition: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  let quote: '"' | "'" | null = null
  let escaped = false

  for (let index = 0; index < condition.length; index = index + 1) {
    const character = condition[index]

    if (quote !== null && typeof quote !== 'undefined') {
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === quote) {
        quote = null
      }

      continue
    }

    if (character === '"' || character === "'") {
      quote = character
      continue
    }

    if (character === '(' || character === '[' || character === '{') {
      depth = depth + 1
      continue
    }

    if (character === ')' || character === ']' || character === '}') {
      depth = depth - 1
      continue
    }

    if (
      depth === 0 &&
      ((character === '&' && condition[index + 1] === '&') ||
        (character === '|' && condition[index + 1] === '|'))
    ) {
      parts.push(condition.slice(start, index + 2).trim())
      start = index + 2
      index = index + 1
    }
  }

  if (parts.length === 0) {
    return [condition]
  }

  parts.push(condition.slice(start).trim())
  return parts
}

function parseGeneratedCCallCondition(condition: string): GeneratedCCallCondition | null {
  const openParen = condition.indexOf('(')

  if (openParen < 0) {
    return null
  }

  const callee = condition.slice(0, openParen).trim()

  if (!isGeneratedCCallCallee(callee)) {
    return null
  }

  const closeParen = findGeneratedCMatchingParen(condition, openParen)

  if (closeParen === null || typeof closeParen === 'undefined') {
    return null
  }

  const args = splitGeneratedCParameters(condition.slice(openParen + 1, closeParen))

  if (args === null || typeof args === 'undefined') {
    return null
  }

  const suffix = condition.slice(closeParen + 1)

  return {
    callee,
    args,
    suffix
  }
}

function findGeneratedCMatchingParen(line: string, start: number): number | null {
  let depth = 0
  let quote: '"' | "'" | null = null
  let escaped = false

  for (let index = start; index < line.length; index = index + 1) {
    const character = line[index]

    if (quote !== null && typeof quote !== 'undefined') {
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === quote) {
        quote = null
      }

      continue
    }

    if (character === '"' || character === "'") {
      quote = character
      continue
    }

    if (character === '(') {
      depth = depth + 1
    } else if (character === ')') {
      depth = depth - 1

      if (depth === 0) {
        return index
      }
    }
  }

  return null
}

function splitGeneratedCLineComment(line: string): GeneratedCLineComment {
  let quote: '"' | "'" | null = null
  let escaped = false

  for (let index = 0; index < line.length - 1; index = index + 1) {
    const character = line[index]

    if (quote !== null && typeof quote !== 'undefined') {
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === quote) {
        quote = null
      }

      continue
    }

    if (character === '"' || character === "'") {
      quote = character
      continue
    }

    if (character === '/' && line[index + 1] === '/') {
      return {
        statement: trimGeneratedCEnd(line.slice(0, index)),
        comment: line.slice(index)
      }
    }
  }

  return {
    statement: line,
    comment: null
  }
}

function markBlankBefore(lines: string[], index: number, blankBefore: Set<number>): void {
  const previous = previousGeneratedCNonBlankLine(lines, index)

  if (previous === null || typeof previous === 'undefined') {
    return
  }

  const previousTrimmed = lines[previous].trim()

  if (
    previousTrimmed.endsWith('{') ||
    isGeneratedCGotoLabel(previousTrimmed) ||
    generatedCStringStartsWithAt(previousTrimmed, 'case ', 0) ||
    previousTrimmed === 'default:'
  ) {
    return
  }

  blankBefore.add(index)
}

function markBlankAfter(lines: string[], index: number, blankAfter: Set<number>): void {
  const next = nextGeneratedCNonBlankLine(lines, index)

  if (next === null || typeof next === 'undefined') {
    return
  }

  const nextTrimmed = lines[next].trim()

  if (
    nextTrimmed === '}' ||
    generatedCStringStartsWithAt(nextTrimmed, '} ', 0) ||
    generatedCStringStartsWithAt(nextTrimmed, 'else', 0) ||
    generatedCStringStartsWithAt(nextTrimmed, 'case ', 0) ||
    nextTrimmed === 'default:'
  ) {
    return
  }

  blankAfter.add(index)
}

function pushGeneratedCBlankLine(lines: string[]): void {
  if (lines.length > 0 && lines[lines.length - 1] !== '') {
    lines.push('')
  }
}

function generatedCLeadingCommentGroupStart(lines: string[], index: number): number {
  let start = index

  for (let cursor = index - 1; cursor >= 0 && isGeneratedCCommentOnlyLine(lines[cursor]); cursor = cursor - 1) {
    start = cursor
  }

  return start
}

function previousGeneratedCNonBlankLine(lines: string[], index: number): number | null {
  for (let cursor = index - 1; cursor >= 0; cursor = cursor - 1) {
    if (lines[cursor].trim() !== '') {
      return cursor
    }
  }

  return null
}

function nextGeneratedCNonBlankLine(lines: string[], index: number): number | null {
  for (let cursor = index + 1; cursor < lines.length; cursor = cursor + 1) {
    if (lines[cursor].trim() !== '') {
      return cursor
    }
  }

  return null
}

function isGeneratedCControlStart(line: string): boolean {
  return startsWithGeneratedCControlKeyword(line.trimStart())
}

function isGeneratedCGotoLabel(line: string): boolean {
  const trimmed = line.trim()
  const labelPrefixes = ['inox_', 'catch_', 'finally_', 'end_']
  let prefix = ''

  for (const candidate of labelPrefixes) {
    if (generatedCStringStartsWithAt(trimmed, candidate, 0)) {
      prefix = candidate
      break
    }
  }

  if (prefix === '') {
    return false
  }

  const colon = trimmed.indexOf(':')

  if (colon <= prefix.length) {
    return false
  }

  for (let index = prefix.length; index < colon; index = index + 1) {
    if (!isGeneratedCIdentifierPart(trimmed[index])) {
      return false
    }
  }

  const rest = trimmed.slice(colon + 1).trim()

  return rest === '' || rest === ';'
}

function isGeneratedCCommentOnlyLine(line: string): boolean {
  const trimmed = line.trimStart()

  return (
    generatedCStringStartsWithAt(trimmed, '//', 0) ||
    generatedCStringStartsWithAt(trimmed, '/*', 0) ||
    generatedCStringStartsWithAt(trimmed, '*', 0)
  )
}

function findGeneratedCControlEnd(lines: string[], start: number): number | null {
  const state: GeneratedCBraceScanState = {
    inBlockComment: false
  }
  let depth = 0
  let started = false

  for (let index = start; index < lines.length; index = index + 1) {
    const braces = scanGeneratedCBraces(lines[index], state)

    if (braces.open > 0) {
      started = true
    }

    if (started) {
      depth = depth + braces.open - braces.close

      if (depth <= 0) {
        return index
      }
    }
  }

  return null
}

type GeneratedCBraceScanState = {
  inBlockComment: boolean
}

function scanGeneratedCBraces(line: string, state: GeneratedCBraceScanState): GeneratedCBraceScanResult {
  let open = 0
  let close = 0
  let quote: '"' | "'" | null = null
  let escaped = false

  for (let index = 0; index < line.length; index = index + 1) {
    const character = line[index]
    const next = line[index + 1]

    if (state.inBlockComment) {
      if (character === '*' && next === '/') {
        state.inBlockComment = false
        index = index + 1
      }

      continue
    }

    if (quote !== null && typeof quote !== 'undefined') {
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === quote) {
        quote = null
      }

      continue
    }

    if (character === '/' && next === '/') {
      break
    }

    if (character === '/' && next === '*') {
      state.inBlockComment = true
      index = index + 1
      continue
    }

    if (character === '"' || character === "'") {
      quote = character
      continue
    }

    if (character === '{') {
      open = open + 1
    } else if (character === '}') {
      close = close + 1
    }
  }

  return { open, close }
}
