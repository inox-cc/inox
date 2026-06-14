const generatedCColumnLimit = 130

export function formatGeneratedC(code: string, _assumeFilename: string): string {
  return spaceGeneratedCControlFlow(
    wrapGeneratedCLongControlConditions(braceGeneratedCSingleLineControls(wrapGeneratedCFunctionHeads(code)))
  )
}

function wrapGeneratedCFunctionHeads(code: string): string {
  return mapGeneratedCLines(code, (line) => {
    if (line.length <= generatedCColumnLimit) {
      return [line]
    }

    const head = parseGeneratedCFunctionHead(line)

    if (head == null || head.params.length <= 1) {
      return [line]
    }

    return [
      `${head.indent}${head.prefix}(`,
      ...head.params.map((param, index) => `${head.indent}  ${param}${index === head.params.length - 1 ? '' : ','}`),
      `${head.indent})${head.suffix}`
    ]
  })
}

function braceGeneratedCSingleLineControls(code: string): string {
  return mapGeneratedCLines(code, (line) => {
    const control = parseGeneratedCSingleLineControl(line)

    if (control == null) {
      return [line]
    }

    return [`${control.indent}${control.keyword} ${control.condition} {`, `${control.indent}  ${control.statement}`, `${control.indent}}`]
  })
}

function wrapGeneratedCLongControlConditions(code: string): string {
  return mapGeneratedCLines(code, (line) => {
    if (line.length <= generatedCColumnLimit) {
      return [line]
    }

    const control = parseGeneratedCControlBlockStart(line)

    if (control == null) {
      return [line]
    }

    return [
      `${control.indent}${control.keyword} (`,
      ...wrapGeneratedCCondition(control.condition, control.indent),
      `${control.indent}) {`
    ]
  })
}

function spaceGeneratedCControlFlow(code: string): string {
  const lines = code.split('\n')
  const hasTrailingNewline = lines.at(-1) === ''

  if (hasTrailingNewline) {
    lines.pop()
  }

  const blankBefore = new Set<number>()
  const blankAfter = new Set<number>()

  for (let index = 0; index < lines.length; index += 1) {
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

  for (let index = 0; index < lines.length; index += 1) {
    if (blankBefore.has(index)) {
      pushGeneratedCBlankLine(spaced)
    }

    spaced.push(lines[index])

    if (blankAfter.has(index)) {
      pushGeneratedCBlankLine(spaced)
    }
  }

  return `${spaced.join('\n')}${hasTrailingNewline ? '\n' : ''}`
}

function mapGeneratedCLines(code: string, callback: (line: string) => string[]): string {
  const lines = code.split('\n')
  const hasTrailingNewline = lines.at(-1) === ''

  if (hasTrailingNewline) {
    lines.pop()
  }

  const mapped = lines.flatMap(callback)

  return `${mapped.join('\n')}${hasTrailingNewline ? '\n' : ''}`
}

type GeneratedCFunctionHead = {
  indent: string
  prefix: string
  params: string[]
  suffix: string
}

function parseGeneratedCFunctionHead(line: string): GeneratedCFunctionHead | null {
  const indentMatch = /^(\s*)/.exec(line)
  const indent = indentMatch?.[1] ?? ''
  const trimmed = line.trim()

  if (
    trimmed.startsWith('#') ||
    trimmed.startsWith('typedef ') ||
    trimmed.startsWith('return ') ||
    isGeneratedCControlStart(trimmed)
  ) {
    return null
  }

  const suffix = trimmed.endsWith(';') ? ';' : trimmed.endsWith('{') ? ' {' : null

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

  if (!/\s[A-Za-z_][A-Za-z0-9_]*$/.test(prefix) || prefix.includes('=')) {
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

  for (let index = 0; index < source.length; index += 1) {
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
      depth += 1
    } else if (char === ')' || char === ']' || char === '}') {
      depth -= 1
    } else if (char === ',' && depth === 0) {
      params.push(source.slice(start, index).trim())
      start = index + 1
    }
  }

  if (quote != null || depth !== 0) {
    return null
  }

  params.push(source.slice(start).trim())

  return params.some((param) => param === '') ? null : params
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
  const match = /^(\s*)(if|for|while)\s+/.exec(line)

  if (match == null) {
    return null
  }

  const indent = match[1]
  const keyword = match[2]
  const conditionStart = line.indexOf('(', match[0].length - 1)

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

  const { statement, comment } = splitGeneratedCLineComment(rest)

  if (!statement.endsWith(';')) {
    return null
  }

  return {
    indent,
    keyword,
    condition,
    statement: comment == null ? statement : `${statement} ${comment}`
  }
}

function parseGeneratedCControlBlockStart(line: string): GeneratedCControlBlockStart | null {
  const match = /^(\s*)(if|for|while)\s+/.exec(line)

  if (match == null) {
    return null
  }

  const indent = match[1]
  const keyword = match[2]
  const conditionStart = line.indexOf('(', match[0].length - 1)

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

function wrapGeneratedCCondition(condition: string, indent: string): string[] {
  const call = parseGeneratedCCallCondition(condition)

  if (call == null || call.args.length <= 1) {
    return [`${indent}  ${condition}`]
  }

  return [
    `${indent}  ${call.callee}(`,
    ...call.args.map((arg, index) => `${indent}    ${arg}${index === call.args.length - 1 ? '' : ','}`),
    `${indent}  )${call.suffix}`
  ]
}

function parseGeneratedCCallCondition(condition: string): GeneratedCCallCondition | null {
  const openParen = condition.indexOf('(')

  if (openParen < 0) {
    return null
  }

  const callee = condition.slice(0, openParen).trim()

  if (!/^!?[A-Za-z_][A-Za-z0-9_]*$/.test(callee)) {
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

  for (let index = start; index < line.length; index += 1) {
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
      depth += 1
    } else if (char === ')') {
      depth -= 1

      if (depth === 0) {
        return index
      }
    }
  }

  return null
}

function splitGeneratedCLineComment(line: string): { statement: string; comment: string | null } {
  let quote: '"' | "'" | null = null
  let escaped = false

  for (let index = 0; index < line.length - 1; index += 1) {
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
        statement: line.slice(0, index).trimEnd(),
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
  if (lines.length > 0 && lines.at(-1) !== '') {
    lines.push('')
  }
}

function generatedCLeadingCommentGroupStart(lines: string[], index: number): number {
  let start = index

  for (let cursor = index - 1; cursor >= 0 && isGeneratedCCommentOnlyLine(lines[cursor]); cursor -= 1) {
    start = cursor
  }

  return start
}

function previousGeneratedCNonBlankLine(lines: string[], index: number): number | null {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (lines[cursor].trim() !== '') {
      return cursor
    }
  }

  return null
}

function nextGeneratedCNonBlankLine(lines: string[], index: number): number | null {
  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    if (lines[cursor].trim() !== '') {
      return cursor
    }
  }

  return null
}

function isGeneratedCControlStart(line: string): boolean {
  return /^(if|for|while)\b/.test(line.trimStart())
}

function isGeneratedCGotoLabel(line: string): boolean {
  return /^\s*ccjs_[A-Za-z0-9_]+:\s*;?\s*$/.test(line)
}

function isGeneratedCCommentOnlyLine(line: string): boolean {
  return /^\s*(\/\/|\/\*|\*|\*\/)/.test(line)
}

function findGeneratedCControlEnd(lines: string[], start: number): number | null {
  const state: GeneratedCBraceScanState = {
    inBlockComment: false
  }
  let depth = 0
  let started = false

  for (let index = start; index < lines.length; index += 1) {
    const braces = scanGeneratedCBraces(lines[index], state)

    if (braces.open > 0) {
      started = true
    }

    if (started) {
      depth += braces.open - braces.close

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

function scanGeneratedCBraces(line: string, state: GeneratedCBraceScanState): { open: number; close: number } {
  let open = 0
  let close = 0
  let quote: '"' | "'" | null = null
  let escaped = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]

    if (state.inBlockComment) {
      if (char === '*' && next === '/') {
        state.inBlockComment = false
        index += 1
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
      index += 1
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    if (char === '{') {
      open += 1
    } else if (char === '}') {
      close += 1
    }
  }

  return { open, close }
}
