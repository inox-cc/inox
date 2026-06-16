const generatedCColumnLimit = 130

export function formatGeneratedC(code: string, _assumeFilename: string): string {
  return spaceGeneratedCControlFlow(
    wrapGeneratedCLongControlConditions(braceGeneratedCSingleLineControls(wrapGeneratedCFunctionHeads(code)))
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

    if (head != null) {
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

function braceGeneratedCSingleLineControls(code: string): string {
  const source = splitGeneratedCLines(code)
  const mapped: string[] = []

  for (let index = 0; index < source.lines.length; index = index + 1) {
    const line = source.lines[index]
    const control = parseGeneratedCSingleLineControl(line)

    if (control == null) {
      mapped.push(line)
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

    if (control != null) {
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

    if (!isGeneratedCControlStart(lines[index])) {
      continue
    }

    markBlankBefore(lines, generatedCLeadingCommentGroupStart(lines, index), blankBefore)

    const end = findGeneratedCControlEnd(lines, index)

    if (end != null) {
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
  if (hasTrailingNewline) {
    return `${lines.join('\n')}\n`
  }

  return lines.join('\n')
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

function isGeneratedCWhitespace(char: string): boolean {
  return char === ' ' || char === '\t' || char === '\r' || char === '\n'
}

function isGeneratedCIdentifierStart(char: string): boolean {
  return (
    char === '_' ||
    (char >= 'A' && char <= 'Z') ||
    (char >= 'a' && char <= 'z')
  )
}

function isGeneratedCIdentifierPart(char: string): boolean {
  return isGeneratedCIdentifierStart(char) || (char >= '0' && char <= '9')
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

  if (callee.startsWith('!')) {
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
  if (!value.startsWith(keyword)) {
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

  if (keyword != null) {
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
    trimmed.startsWith('#') ||
    trimmed.startsWith('typedef ') ||
    trimmed.startsWith('return ') ||
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

  if (suffix == null) {
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

  if (params == null || params.length === 0 || (params.length === 1 && params[0] === 'void')) {
    return null
  }

  return {
    indent,
    prefix,
    params,
    suffix
  }
}

function splitGeneratedCParameters(source: string): string[] | null {
  const params: string[] = []
  let start = 0
  let depth = 0
  let quote: '"' | "'" | null = null
  let escaped = false

  for (let index = 0; index < source.length; index = index + 1) {
    const char = source[index]

    if (quote != null) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === quote) {
        quote = null
      }

      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    if (char === '(' || char === '[' || char === '{') {
      depth = depth + 1
    } else if (char === ')' || char === ']' || char === '}') {
      depth = depth - 1
    } else if (char === ',' && depth === 0) {
      params.push(source.slice(start, index).trim())
      start = index + 1
    }
  }

  if (quote != null || depth !== 0) {
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

  if (control != null) {
    const indent = control.indent
    const keyword = control.keyword
    const conditionStart = line.indexOf('(', control.conditionSearchStart)

    if (conditionStart < 0) {
      return null
    }

    const conditionEnd = findGeneratedCMatchingParen(line, conditionStart)

    if (conditionEnd == null) {
      return null
    }

    const condition = line.slice(conditionStart, conditionEnd + 1)
    const rest = line.slice(conditionEnd + 1).trim()

    if (rest === '' || rest.startsWith('{') || rest.startsWith(';') || rest.startsWith('/*')) {
      return null
    }

    const lineComment = splitGeneratedCLineComment(rest)
    const statement = lineComment.statement
    const comment = lineComment.comment

    if (!statement.endsWith(';')) {
      return null
    }

    let nextStatement = statement

    if (comment != null) {
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

function parseGeneratedCControlBlockStart(line: string): GeneratedCControlBlockStart | null {
  const control = parseGeneratedCControlPrefix(line)

  if (control != null) {
    const indent = control.indent
    const keyword = control.keyword
    const conditionStart = line.indexOf('(', control.conditionSearchStart)

    if (conditionStart < 0) {
      return null
    }

    const conditionEnd = findGeneratedCMatchingParen(line, conditionStart)

    if (conditionEnd == null || line.slice(conditionEnd + 1).trim() !== '{') {
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
  const call = parseGeneratedCCallCondition(condition)

  if (call != null) {
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

  if (closeParen == null) {
    return null
  }

  const args = splitGeneratedCParameters(condition.slice(openParen + 1, closeParen))

  if (args == null) {
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
    const char = line[index]

    if (quote != null) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === quote) {
        quote = null
      }

      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    if (char === '(') {
      depth = depth + 1
    } else if (char === ')') {
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
    const char = line[index]

    if (quote != null) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === quote) {
        quote = null
      }

      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    if (char === '/' && line[index + 1] === '/') {
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

  if (previous == null) {
    return
  }

  const previousTrimmed = lines[previous].trim()

  if (
    previousTrimmed.endsWith('{') ||
    isGeneratedCGotoLabel(previousTrimmed) ||
    previousTrimmed.startsWith('case ') ||
    previousTrimmed === 'default:'
  ) {
    return
  }

  blankBefore.add(index)
}

function markBlankAfter(lines: string[], index: number, blankAfter: Set<number>): void {
  const next = nextGeneratedCNonBlankLine(lines, index)

  if (next == null) {
    return
  }

  const nextTrimmed = lines[next].trim()

  if (
    nextTrimmed === '}' ||
    nextTrimmed.startsWith('} ') ||
    nextTrimmed.startsWith('else') ||
    nextTrimmed.startsWith('case ') ||
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

  if (!trimmed.startsWith('ccjs_')) {
    return false
  }

  const colon = trimmed.indexOf(':')

  if (colon <= 5) {
    return false
  }

  for (let index = 5; index < colon; index = index + 1) {
    if (!isGeneratedCIdentifierPart(trimmed[index])) {
      return false
    }
  }

  const rest = trimmed.slice(colon + 1).trim()

  return rest === '' || rest === ';'
}

function isGeneratedCCommentOnlyLine(line: string): boolean {
  const trimmed = line.trimStart()

  return trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')
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
    const char = line[index]
    const next = line[index + 1]

    if (state.inBlockComment) {
      if (char === '*' && next === '/') {
        state.inBlockComment = false
        index = index + 1
      }

      continue
    }

    if (quote != null) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === quote) {
        quote = null
      }

      continue
    }

    if (char === '/' && next === '/') {
      break
    }

    if (char === '/' && next === '*') {
      state.inBlockComment = true
      index = index + 1
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    if (char === '{') {
      open = open + 1
    } else if (char === '}') {
      close = close + 1
    }
  }

  return { open, close }
}
