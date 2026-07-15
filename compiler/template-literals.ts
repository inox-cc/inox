import { diagnostic } from './diagnostics.ts'
import { tokenize } from './lexer.ts'
import { parse } from './parser.ts'
import type { AnyNode, Diagnostic, SourceLocation } from './types.ts'

export type TemplateLiteralPart = {
  kind: 'placeholder' | 'text'
  value: string
  loc?: SourceLocation
}

type TemplateLocationState = {
  line: number
  column: number
}

type TrimmedTemplatePlaceholder = {
  value: string
  loc: SourceLocation
}

type TokenizeLocationOptions = {
  file?: string
}

type CompileErrorLike = {
  diagnostics: Diagnostic[]
}

type CompileErrorCandidate = {
  diagnostics?: Diagnostic[]
}

export function parseTemplateLiteralParts(
  raw: string,
  diagnostics: Diagnostic[],
  loc: SourceLocation | undefined
): TemplateLiteralPart[] {
  const parts: TemplateLiteralPart[] = []
  let text = ''
  let index = 1
  let end = raw.length
  const locationState: TemplateLocationState = {
    line: 1,
    column: 2
  }

  if (raw.endsWith('`')) {
    end = raw.length - 1
  }

  if (loc !== null && typeof loc !== 'undefined') {
    locationState.line = loc.line
    locationState.column = loc.column + 1
  }

  while (index < end) {
    const part = raw[index]

    if (part === '\\') {
      text = text + raw.slice(index, Math.min(index + 2, end))
      advanceTemplateLocation(locationState, part)

      if (index + 1 < end) {
        advanceTemplateLocation(locationState, raw[index + 1])
      }

      index = index + 2
      continue
    }

    if (part === '$' && raw[index + 1] === '{') {
      if (text !== '') {
        parts.push({
          kind: 'text',
          value: text
        })
        text = ''
      }

      advanceTemplateLocation(locationState, '$')
      advanceTemplateLocation(locationState, '{')
      index = index + 2

      const placeholderStart = index
      const placeholderLoc = currentTemplateLocation(loc, locationState)
      let depth = 0
      let quote: string | null = null

      while (index < end) {
        const current = raw[index]

        if (quote !== null && typeof quote !== 'undefined') {
          advanceTemplateLocation(locationState, current)

          if (current === '\\' && index + 1 < end) {
            index = index + 1
            advanceTemplateLocation(locationState, raw[index])
          } else if (current === quote) {
            quote = null
          }

          index = index + 1
          continue
        }

        if (current === '"' || current === "'" || current === '`') {
          quote = current
          advanceTemplateLocation(locationState, current)
          index = index + 1
          continue
        }

        if (current === '{') {
          depth = depth + 1
          advanceTemplateLocation(locationState, current)
          index = index + 1
          continue
        }

        if (current === '}') {
          if (depth === 0) {
            break
          }

          depth = depth - 1
          advanceTemplateLocation(locationState, current)
          index = index + 1
          continue
        }

        advanceTemplateLocation(locationState, current)
        index = index + 1
      }

      if (index >= end) {
        diagnostics.push(diagnostic('INOX_C_STRING_EXPR', 'unterminated template placeholder in template literal', loc))
        return parts
      }

      const placeholderRaw = raw.slice(placeholderStart, index)
      const placeholder = trimTemplatePlaceholder(placeholderRaw, placeholderLoc)

      parts.push({
        kind: 'placeholder',
        value: placeholder.value,
        loc: placeholder.loc
      })
      advanceTemplateLocation(locationState, '}')
      index = index + 1
      continue
    }

    text = text + part
    advanceTemplateLocation(locationState, part)
    index = index + 1
  }

  if (text !== '') {
    parts.push({
      kind: 'text',
      value: text
    })
  }

  return parts
}

export function parseTemplatePlaceholderExpression(
  value: string,
  loc: SourceLocation,
  diagnostics: Diagnostic[]
): AnyNode | null {
  if (value === '') {
    diagnostics.push(diagnostic('INOX_C_STRING_EXPR', 'empty template placeholder in template literal', loc))
    return null
  }

  const prefix = 'const __inox_template = '

  try {
    const program = parse(tokenize(`${prefix}${value}`, tokenizeLocationOptions(loc)))
    const statement = program.body[0]
    let expression: AnyNode | null = null

    if (statement !== null && typeof statement !== 'undefined' && statement.type === 'VariableDeclaration') {
      expression = statement.init
    }

    if (program.body.length !== 1 || expression === null || typeof expression === 'undefined') {
      diagnostics.push(
        diagnostic('INOX_C_STRING_EXPR', 'template placeholder must contain exactly one expression', loc)
      )
      return null
    }

    shiftTemplatePlaceholderExpressionLocations(expression, loc, prefix.length)

    return expression
  } catch (error) {
    const compileError = compileErrorOrNull(error)

    if (compileError !== null && typeof compileError !== 'undefined') {
      const first = compileError.diagnostics[0]
      let code = 'INOX_C_STRING_EXPR'
      let message = 'invalid template placeholder expression'

      if (compileError.diagnostics.length > 0) {
        code = first.code
        message = `invalid template placeholder expression: ${first.message}`
      }

      diagnostics.push(diagnostic(code, message, loc))

      return null
    }

    throw error
  }
}

function currentTemplateLocation(loc: SourceLocation | undefined, state: TemplateLocationState): SourceLocation {
  return sourceLocationWithFile(loc, state.line, state.column)
}

function advanceTemplateLocation(state: TemplateLocationState, unit: string): void {
  if (unit === '\n') {
    state.line = state.line + 1
    state.column = 1
    return
  }

  state.column = state.column + 1
}

function trimTemplatePlaceholder(value: string, loc: SourceLocation): TrimmedTemplatePlaceholder {
  let index = 0
  let line = loc.line
  let column = loc.column

  while (index < value.length && isTemplateWhitespace(value[index])) {
    if (value[index] === '\n') {
      line = line + 1
      column = 1
    } else {
      column = column + 1
    }

    index = index + 1
  }

  const leadingTrimmed = value.slice(index)
  const trimmed = trimTemplateTrailingWhitespace(leadingTrimmed)

  return {
    value: trimmed,
    loc: sourceLocationWithFile(loc, line, column)
  }
}

function trimTemplateTrailingWhitespace(value: string): string {
  let end = value.length

  while (end > 0 && isTemplateWhitespace(value[end - 1])) {
    end = end - 1
  }

  return value.slice(0, end)
}

function isTemplateWhitespace(value: string): boolean {
  return value === ' ' || value === '\n' || value === '\r' || value === '\t' || value === '\f' || value === '\v'
}

function sourceLocationWithFile(loc: SourceLocation | undefined, line: number, column: number): SourceLocation {
  const result: SourceLocation = {
    line,
    column
  }

  if (loc !== null && typeof loc !== 'undefined') {
    const file = loc.file

    if (file !== null && typeof file !== 'undefined') {
      result.file = file
    }
  }

  return result
}

function tokenizeLocationOptions(loc: SourceLocation | undefined): TokenizeLocationOptions {
  const options: TokenizeLocationOptions = {}

  if (loc !== null && typeof loc !== 'undefined') {
    const file = loc.file

    if (file !== null && typeof file !== 'undefined') {
      options.file = file
    }
  }

  return options
}

function compileErrorOrNull(error: unknown): CompileErrorLike | null {
  const candidate = error as CompileErrorCandidate

  if (candidate !== null && typeof candidate !== 'undefined' && Array.isArray(candidate.diagnostics)) {
    return {
      diagnostics: candidate.diagnostics
    }
  }

  return null
}

function shiftTemplatePlaceholderExpressionLocations(
  value: AnyNode | AnyNode[] | null | undefined,
  loc: SourceLocation,
  prefixLength: number
): void {
  const shiftedLocations: Set<SourceLocation> = new Set()

  shiftTemplatePlaceholderExpressionLocationsWithState(value, loc, prefixLength, shiftedLocations)
}

function shiftTemplatePlaceholderExpressionLocationsWithState(
  value: AnyNode | AnyNode[] | null | undefined,
  loc: SourceLocation,
  prefixLength: number,
  shiftedLocations: Set<SourceLocation>
): void {
  if (Array.isArray(value)) {
    const items: AnyNode[] = value

    for (const item of items) {
      shiftTemplatePlaceholderExpressionLocationsWithState(item, loc, prefixLength, shiftedLocations)
    }

    return
  }

  if (value === null || typeof value === 'undefined') {
    return
  }

  const node = value

  if (node.loc !== null && typeof node.loc !== 'undefined' && !shiftedLocations.has(node.loc)) {
    shiftedLocations.add(node.loc)
    shiftTemplatePlaceholderLocation(node.loc, loc, prefixLength)
  }

  shiftTemplatePlaceholderChildLocations(node, loc, prefixLength, shiftedLocations)
}

function shiftTemplatePlaceholderLocation(target: SourceLocation, loc: SourceLocation, prefixLength: number): void {
  const lineOffset = target.line - 1

  target.line = loc.line + lineOffset

  if (lineOffset === 0) {
    target.column = loc.column + target.column - prefixLength - 1
  }

  if (loc.file !== null && typeof loc.file !== 'undefined') {
    target.file = loc.file
  }
}

function shiftTemplatePlaceholderChildLocations(
  node: AnyNode,
  loc: SourceLocation,
  prefixLength: number,
  shiftedLocations: Set<SourceLocation>
): void {
  if (node.type === 'BinaryExpression') {
    shiftTemplatePlaceholderExpressionLocationsWithState(node.left, loc, prefixLength, shiftedLocations)
    shiftTemplatePlaceholderExpressionLocationsWithState(node.right, loc, prefixLength, shiftedLocations)
    return
  }

  if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression' || node.type === 'NewExpression') {
    shiftTemplatePlaceholderExpressionLocationsWithState(node.callee, loc, prefixLength, shiftedLocations)
    shiftTemplatePlaceholderExpressionLocationsWithState(node.args, loc, prefixLength, shiftedLocations)
    return
  }

  if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
    shiftTemplatePlaceholderExpressionLocationsWithState(node.object, loc, prefixLength, shiftedLocations)
    return
  }

  if (node.type === 'IndexExpression' || node.type === 'OptionalIndexExpression') {
    shiftTemplatePlaceholderExpressionLocationsWithState(node.object, loc, prefixLength, shiftedLocations)
    shiftTemplatePlaceholderExpressionLocationsWithState(node.index, loc, prefixLength, shiftedLocations)
    return
  }

  if (
    node.type === 'AwaitExpression' ||
    node.type === 'UnaryExpression' ||
    node.type === 'UpdateExpression' ||
    node.type === 'TypeAssertionExpression'
  ) {
    shiftTemplatePlaceholderExpressionLocationsWithState(node.argument, loc, prefixLength, shiftedLocations)
    shiftTemplatePlaceholderExpressionLocationsWithState(node.expression, loc, prefixLength, shiftedLocations)
    return
  }

  if (node.type === 'ArrayLiteral') {
    shiftTemplatePlaceholderExpressionLocationsWithState(node.elements, loc, prefixLength, shiftedLocations)
    return
  }

  if (node.type === 'ObjectLiteral') {
    shiftTemplatePlaceholderExpressionLocationsWithState(node.properties, loc, prefixLength, shiftedLocations)
    return
  }

  if (
    (node.type === null || typeof node.type === 'undefined') &&
    node.value !== null &&
    typeof node.value !== 'undefined'
  ) {
    shiftTemplatePlaceholderExpressionLocationsWithState(node.value, loc, prefixLength, shiftedLocations)
  }
}
