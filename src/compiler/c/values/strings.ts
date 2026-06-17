import { diagnostic } from '../../diagnostics.ts'
import { tokenize } from '../../lexer.ts'
import { parse } from '../../parser.ts'
import {
  emitPrepareOwnedValueWrite,
  emitRuntimeTypeCheck,
  emitStatusCheck,
  nextCName,
  registerOwnedValue
} from '../context.ts'
import { isCJsGlobalRoot } from '../globals.ts'
import { cStringLiteral, utf8ByteLength } from '../identifiers.ts'
import { emitRuntimeValueCheck } from '../runtime-values.ts'
import { cOsRuntimeConstantName } from '../stdlib/os.ts'
import { cPathRuntimeConstantName } from '../stdlib/path.ts'
import {
  cProcessRuntimeEnvName,
  cProcessRuntimePropertyName,
  cProcessRuntimeStringPropertyName
} from '../stdlib/process.ts'
import { cUnsupportedExpressionCode, isNullishCoalescingExpression, isOptionalChainExpression } from '../syntax.ts'
import { isStringPredicateMethod, isStringRuntimeMethod } from '../../stdlib/descriptors/collections.ts'
import { emitSliceIndexNormalizationLines } from './slices.ts'
import type { AnyNode, Diagnostic, SourceLocation } from '../../types.ts'
import type {
  CObjectFieldInfo,
  CPreparedExpression as PreparedExpression,
  CPreparedStringBytesOperand as PreparedStringBytesOperand
} from '../types.ts'

type StringDiagnosticContext = {
  diagnostics: Diagnostic[]
}

type StringCContext = {
  cleanupEnabled: boolean
  failureStatement?: string | null
  failureStatementUsed?: boolean
  nextId: number
  ownedValues: string[]
  returnType?: string
  statusReturn: boolean
  throwingFunction: boolean
  usedCleanupGoto: boolean
  [key: string]: any
}

type TemplateLiteralPart = {
  kind: string
  value: string
  loc?: SourceLocation
}

type TokenizeLocationOptions = {
  file?: string
}

type PreparedStringSplitExpression = PreparedExpression & {
  elementType: string
}

type TrimmedTemplatePlaceholder = {
  value: string
  loc: SourceLocation
}

type CompileErrorLike = {
  diagnostics: Diagnostic[]
}

type CompileErrorCandidate = {
  diagnostics?: Diagnostic[]
}

type TemplateLocationState = {
  line: number
  column: number
}

type TemplateReferenceValidationState = {
  context: StringCContext
  reported: Set<string>
  valid: boolean
}

export type StringLoweringDependencies = {
  canLowerCNullishCoalescingExpression(expression: AnyNode, context: StringCContext): boolean
  emitCallExpression(expression: AnyNode, context: StringCContext): string
  emitCValueExpression(expression: AnyNode, context: StringCContext): PreparedExpression
  emitPreparedNumberExpression(expression: AnyNode, context: StringCContext): PreparedExpression
  emitReference(expression: AnyNode, context: StringCContext): string
  inferExpressionType(expression: AnyNode, context: StringCContext): string
  isBoxedRuntimeStringName(name: string, context: StringCContext): boolean
  isBoxedRuntimeStringReference(expression: AnyNode, context: StringCContext): boolean
  isMemberAccessExpression(expression: AnyNode): boolean
  resolveKnownObjectMember(expression: AnyNode, context: StringCContext): CObjectFieldInfo | null
  resolveNetAddressStringMember(expression: AnyNode, context: StringCContext): string | null
}

function stringDeps(context: StringCContext): StringLoweringDependencies {
  return context.stringLoweringDependencies
}

function pushAllLines(target: string[], source: string[]): void {
  for (const line of source) {
    target.push(line)
  }
}

function sourceLocationWithFile(loc: SourceLocation | undefined, line: number, column: number): SourceLocation {
  const result: SourceLocation = {
    line,
    column
  }

  if (loc != null) {
    const file = loc.file

    if (file != null) {
      result.file = file
    }
  }

  return result
}

function tokenizeLocationOptions(loc: SourceLocation | undefined): TokenizeLocationOptions {
  const options: TokenizeLocationOptions = {}

  if (loc != null) {
    const file = loc.file

    if (file != null) {
      options.file = file
    }
  }

  return options
}

function nodeLocation(node: AnyNode | null | undefined): SourceLocation | null | undefined {
  if (node != null) {
    return node.loc
  }

  return null
}

function compileErrorOrNull(error: unknown): CompileErrorLike | null {
  const candidate = error as CompileErrorCandidate

  if (candidate != null && Array.isArray(candidate.diagnostics)) {
    return {
      diagnostics: candidate.diagnostics
    }
  }

  return null
}

export function resolveRuntimeStringReference(
  expression: AnyNode | null | undefined,
  context: StringCContext
): string | null {
  if (expression == null || expression.type !== 'Reference' || expression.path.length !== 1) {
    return null
  }

  const name = expression.path[0]

  if (context.runtimeStrings.has(name)) {
    return name
  }

  return null
}

export function emitStringExpression(expression: AnyNode | null | undefined, context: StringCContext): string {
  if (expression != null && expression.type === 'StringLiteral') {
    return JSON.stringify(expression.value)
  }

  if (expression != null && expression.type === 'TemplateLiteral' && !expression.raw.includes('${')) {
    return JSON.stringify(expression.raw.slice(1, -1))
  }

  if (expression != null && expression.type === 'Reference') {
    return stringDeps(context).emitReference(expression, context)
  }

  if (expression != null && expression.type === 'CallExpression') {
    return stringDeps(context).emitCallExpression(expression, context)
  }

  if (expression != null && isNullishCoalescingExpression(expression)) {
    context.diagnostics.push(
      diagnostic('CCJS_C_NULLISH', 'nullish coalescing is not supported by the current C backend slice', expression.loc)
    )
    return '""'
  }

  if (expression != null && stringDeps(context).isMemberAccessExpression(expression)) {
    const member = stringDeps(context).resolveKnownObjectMember(expression, context)

    if (member != null && ['number', 'boolean'].includes(member.valueType)) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_UNSUPPORTED_EXPR',
          'object field access must be assigned before it can be used by the current C backend slice',
          expression.loc
        )
      )
      return '""'
    }
  }

  if (expression != null && expression.type === 'AwaitExpression') {
    context.diagnostics.push(
      diagnostic('CCJS_C_ASYNC', 'async/await is not supported by the current C backend slice', nodeLocation(expression))
    )
    return '""'
  }

  if (expression != null && isOptionalChainExpression(expression)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_OPTIONAL_CHAINING',
        'optional chaining is not supported by the current C backend slice',
        nodeLocation(expression)
      )
    )
    return '""'
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_C_STRING_EXPR',
      'this string expression is not supported by the current C backend slice',
      nodeLocation(expression)
    )
  )
  return '""'
}

export function emitPreparedStringLengthExpression(
  expression: AnyNode | null | undefined,
  context: StringCContext
): PreparedExpression | null {
  if (
    expression == null ||
    expression.type !== 'MemberExpression' ||
    expression.property !== 'length' ||
    !isStringLengthObject(expression.object, context)
  ) {
    return null
  }

  const operand = emitPreparedStringBytesOperand(expression.object, context, 'ccjs_length_string')
  const length = nextCName(context, 'ccjs_string_length')
  const lines: string[] = []

  pushAllLines(lines, operand.lines)
  lines.push(`size_t ${length} = ccjs_string_code_point_length_parts(${operand.bytes}, ${operand.length});`)

  return {
    lines,
    expression: `((double)${length})`
  }
}

export function emitPreparedStringCompareExpression(expression: AnyNode, context: StringCContext): PreparedExpression {
  const left = emitPreparedStringBytesOperand(expression.left, context)
  const right = emitPreparedStringBytesOperand(expression.right, context)
  const equals = `(${left.length} == ${right.length} && memcmp(${left.bytes}, ${right.bytes}, ${left.length}) == 0)`
  const lines: string[] = []
  let resultExpression = `(!${equals})`

  pushAllLines(lines, left.lines)
  pushAllLines(lines, right.lines)

  if (expression.operator === '===' || expression.operator === '==') {
    resultExpression = equals
  }

  return {
    lines,
    expression: resultExpression
  }
}

export function emitPreparedStringPredicateCall(expression: AnyNode, context: StringCContext): PreparedExpression {
  const value = emitPreparedStringBytesOperand(expression.callee.object, context, 'ccjs_string_method_value')
  const search = emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_string_method_search')
  const helper = cStringPredicateHelperName(expression.callee.property)
  const lines: string[] = []

  pushAllLines(lines, value.lines)
  pushAllLines(lines, search.lines)

  return {
    lines,
    expression: `(${helper}(${value.bytes}, ${value.length}, ${search.bytes}, ${search.length}) ? 1 : 0)`
  }
}

export function emitPreparedStringBytesOperand(
  expression: AnyNode | null | undefined,
  context: StringCContext,
  tempPrefix?: string
): PreparedStringBytesOperand {
  const actualTempPrefix = tempPrefix || 'ccjs_cmp_string'

  if (expression != null && expression.type === 'StringLiteral') {
    return {
      lines: [],
      bytes: cStringLiteral(expression.value),
      length: `${utf8ByteLength(expression.value)}`
    }
  }

  if (expression != null && expression.type === 'TemplateLiteral' && !expression.raw.includes('${')) {
    const value = expression.raw.slice(1, -1)

    return {
      lines: [],
      bytes: cStringLiteral(value),
      length: `${utf8ByteLength(value)}`
    }
  }

  if (expression != null && expression.type === 'TemplateLiteral') {
    const value = emitCTemplateLiteralValueExpression(expression, context)
    const string = nextCName(context, actualTempPrefix)
    const lines: string[] = []

    pushAllLines(lines, value.lines)
    lines.push(`ccjs_string* ${string} = (ccjs_string*)${value.expression}.as.ref;`)

    return {
      lines,
      bytes: `${string}->bytes`,
      length: `${string}->len`
    }
  }

  if (expression != null && expression.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]

    if (context.variables.get(name) === 'string') {
      if (stringDeps(context).isBoxedRuntimeStringName(name, context)) {
        const string = nextCName(context, actualTempPrefix)

        return {
          lines: [
            emitRuntimeTypeCheck(`(*${name}).tag != CCJS_TAG_STRING || (*${name}).as.ref == 0`, context),
            `ccjs_string* ${string} = (ccjs_string*)(*${name}).as.ref;`
          ],
          bytes: `${string}->bytes`,
          length: `${string}->len`
        }
      }

      const reference = stringDeps(context).emitReference(expression, context)

      if (context.runtimeStrings.has(reference)) {
        return {
          lines: [],
          bytes: `${reference}->bytes`,
          length: `${reference}->len`
        }
      }

      return {
        lines: [],
        bytes: reference,
        length: `strlen(${reference})`
      }
    }
  }

  if (expression == null) {
    context.diagnostics.push(
      diagnostic('CCJS_C_STRING_EXPR', 'this string operand is not supported by the current C backend slice', null)
    )

    return {
      lines: [],
      bytes: '""',
      length: '0'
    }
  }

  const netAddressMember = stringDeps(context).resolveNetAddressStringMember(expression, context)

  if (netAddressMember != null) {
    return {
      lines: [],
      bytes: netAddressMember,
      length: `strlen(${netAddressMember})`
    }
  }

  if (stringDeps(context).inferExpressionType(expression, context) === 'string') {
    const value = stringDeps(context).emitCValueExpression(expression, context)
    const string = nextCName(context, actualTempPrefix)
    const lines: string[] = []

    pushAllLines(lines, value.lines)
    lines.push(`ccjs_string* ${string} = (ccjs_string*)${value.expression}.as.ref;`)

    return {
      lines,
      bytes: `${string}->bytes`,
      length: `${string}->len`
    }
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_C_STRING_EXPR',
      'this string operand is not supported by the current C backend slice',
      nodeLocation(expression)
    )
  )

  return {
    lines: [],
    bytes: '""',
    length: '0'
  }
}

export function emitCStringConcatValueExpression(expression: AnyNode, context: StringCContext): PreparedExpression {
  const left = emitPreparedStringBytesOperand(expression.left, context)
  const right = emitPreparedStringBytesOperand(expression.right, context)
  const temp = nextCName(context, 'ccjs_value')
  const lines: string[] = []
  registerOwnedValue(context, temp)

  pushAllLines(lines, left.lines)
  pushAllLines(lines, right.lines)
  pushAllLines(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(
    emitStatusCheck(
      `ccjs_string_concat_parts(&ccjs_default_allocator, ${left.bytes}, ${left.length}, ${right.bytes}, ${right.length}, &${temp})`,
      context
    )
  )

  return {
    lines,
    expression: temp
  }
}

export function emitCTemplateLiteralValueExpression(expression: AnyNode, context: StringCContext): PreparedExpression {
  const parts = parseTemplateLiteralParts(expression.raw, { diagnostics: context.diagnostics }, expression.loc)
  const operands: PreparedStringBytesOperand[] = []

  for (const part of parts) {
    if (part.kind === 'text') {
      operands.push({
        lines: [],
        bytes: cStringLiteral(part.value),
        length: `${utf8ByteLength(part.value)}`
      })
      continue
    }

    if (part.loc == null) {
      continue
    }

    const placeholder = parseTemplatePlaceholderExpression(part.value, part.loc, context)

    if (placeholder != null) {
      operands.push(emitPreparedTemplatePlaceholderBytesOperand(placeholder, context))
    }
  }

  if (operands.length === 0) {
    const temp = nextCName(context, 'ccjs_value')
    const lines: string[] = []
    registerOwnedValue(context, temp)

    pushAllLines(lines, emitPrepareOwnedValueWrite(temp))
    lines.push(emitStatusCheck(`ccjs_string_from_literal(&ccjs_default_allocator, "", 0, &${temp})`, context))

    return {
      lines,
      expression: temp
    }
  }

  const lines: string[] = []

  for (const operand of operands) {
    pushAllLines(lines, operand.lines)
  }

  if (operands.length === 1) {
    const operand = operands[0]
    const temp = nextCName(context, 'ccjs_value')
    registerOwnedValue(context, temp)

    pushAllLines(lines, emitPrepareOwnedValueWrite(temp))
    lines.push(
      emitStatusCheck(
        `ccjs_string_from_literal(&ccjs_default_allocator, ${operand.bytes}, ${operand.length}, &${temp})`,
        context
      )
    )

    return {
      lines,
      expression: temp
    }
  }

  let current = operands[0]
  let currentValue = ''

  for (let index = 1; index < operands.length; index = index + 1) {
    const operand = operands[index]
    const temp = nextCName(context, 'ccjs_value')
    registerOwnedValue(context, temp)

    if (currentValue !== '') {
      const string = nextCName(context, 'ccjs_template_string')

      lines.push(`ccjs_string* ${string} = (ccjs_string*)${currentValue}.as.ref;`)
      current = {
        lines: [],
        bytes: `${string}->bytes`,
        length: `${string}->len`
      }
    }

    pushAllLines(lines, emitPrepareOwnedValueWrite(temp))
    lines.push(
      emitStatusCheck(
        `ccjs_string_concat_parts(&ccjs_default_allocator, ${current.bytes}, ${current.length}, ${operand.bytes}, ${operand.length}, &${temp})`,
        context
      )
    )

    currentValue = temp
  }

  return {
    lines,
    expression: currentValue
  }
}

function emitPreparedTemplatePlaceholderBytesOperand(
  expression: AnyNode,
  context: StringCContext
): PreparedStringBytesOperand {
  const valueType = stringDeps(context).inferExpressionType(expression, context)

  if (valueType === 'string') {
    return emitPreparedStringBytesOperand(expression, context, 'ccjs_template_string')
  }

  if (valueType === 'number' || valueType === 'boolean' || valueType === 'null') {
    const value = emitCStringConversionValueExpression(
      {
        type: 'CallExpression',
        callee: {
          type: 'Reference',
          path: ['String'],
          loc: expression.loc
        },
        args: [expression],
        loc: expression.loc
      },
      context
    )
    const string = nextCName(context, 'ccjs_template_string')
    const lines: string[] = []

    pushAllLines(lines, value.lines)
    lines.push(`ccjs_string* ${string} = (ccjs_string*)${value.expression}.as.ref;`)

    return {
      lines,
      bytes: `${string}->bytes`,
      length: `${string}->len`
    }
  }

  context.diagnostics.push(
    diagnostic(
      cUnsupportedExpressionCode(valueType),
      'template placeholders currently support string, number, boolean and null expressions in C',
      nodeLocation(expression)
    )
  )

  return {
    lines: [],
    bytes: '""',
    length: '0'
  }
}

export function emitCStringConversionValueExpression(expression: AnyNode, context: StringCContext): PreparedExpression {
  const arg = expression.args[0]
  const valueType = stringDeps(context).inferExpressionType(arg, context)
  const temp = nextCName(context, 'ccjs_value')
  registerOwnedValue(context, temp)

  if (valueType === 'string') {
    const value = emitPreparedStringBytesOperand(arg, context, 'ccjs_string_conversion')
    const lines: string[] = []

    pushAllLines(lines, value.lines)
    pushAllLines(lines, emitPrepareOwnedValueWrite(temp))
    lines.push(
      emitStatusCheck(
        `ccjs_string_from_literal(&ccjs_default_allocator, ${value.bytes}, ${value.length}, &${temp})`,
        context
      )
    )

    return {
      lines,
      expression: temp
    }
  }

  if (valueType === 'null') {
    const lines: string[] = []

    pushAllLines(lines, emitPrepareOwnedValueWrite(temp))
    lines.push(emitStatusCheck(`ccjs_string_from_literal(&ccjs_default_allocator, "null", 4, &${temp})`, context))

    return {
      lines,
      expression: temp
    }
  }

  const value = stringDeps(context).emitPreparedNumberExpression(arg, context)
  let helper = `ccjs_string_from_number(&ccjs_default_allocator, ${value.expression}, &${temp})`
  const lines: string[] = []

  if (valueType === 'boolean') {
    helper = `ccjs_string_from_bool(&ccjs_default_allocator, (${value.expression}) != 0, &${temp})`
  }

  pushAllLines(lines, value.lines)
  pushAllLines(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(emitStatusCheck(helper, context))

  return {
    lines,
    expression: temp
  }
}

export function emitCNumberConversionValueExpression(
  expression: AnyNode,
  context: StringCContext
): PreparedExpression | null {
  if (!isNumberConversionCall(expression, context)) {
    return null
  }

  const value = emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_number_conversion')
  const temp = nextCName(context, 'ccjs_value')
  const lines: string[] = []
  registerOwnedValue(context, temp)

  pushAllLines(lines, value.lines)
  pushAllLines(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(emitStatusCheck(`ccjs_string_to_number(${value.bytes}, ${value.length}, &${temp})`, context))

  return {
    lines,
    expression: temp
  }
}

export function emitCStringTrimValueExpression(expression: AnyNode, context: StringCContext): PreparedExpression {
  const value = emitPreparedStringBytesOperand(expression.callee.object, context, 'ccjs_trim_string')
  const temp = nextCName(context, 'ccjs_value')
  const lines: string[] = []
  registerOwnedValue(context, temp)

  pushAllLines(lines, value.lines)
  pushAllLines(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(
    emitStatusCheck(
      `ccjs_string_trim_parts(&ccjs_default_allocator, ${value.bytes}, ${value.length}, &${temp})`,
      context
    )
  )

  return {
    lines,
    expression: temp
  }
}

export function emitCStringSliceValueExpression(expression: AnyNode, context: StringCContext): PreparedExpression {
  const value = emitPreparedStringBytesOperand(expression.callee.object, context, 'ccjs_slice_string')
  const start = stringDeps(context).emitPreparedNumberExpression(expression.args[0], context)
  const lengthName = nextCName(context, 'ccjs_slice_length')
  const startRaw = nextCName(context, 'ccjs_slice_start_raw')
  const startIndex = nextCName(context, 'ccjs_slice_start')
  const endRaw = nextCName(context, 'ccjs_slice_end_raw')
  const endIndex = nextCName(context, 'ccjs_slice_end')
  let end: PreparedExpression = {
    lines: [],
    expression: `((double)${lengthName})`
  }
  const temp = nextCName(context, 'ccjs_value')
  const lines: string[] = []

  if (expression.args[1] != null) {
    end = stringDeps(context).emitPreparedNumberExpression(expression.args[1], context)
  }

  registerOwnedValue(context, temp)

  pushAllLines(lines, value.lines)
  pushAllLines(lines, start.lines)
  lines.push(`size_t ${lengthName} = ccjs_string_code_point_length_parts(${value.bytes}, ${value.length});`)
  pushAllLines(lines, end.lines)
  lines.push(`double ${startRaw} = ${start.expression};`)
  lines.push(`double ${endRaw} = ${end.expression};`)
  pushAllLines(lines, emitSliceIndexNormalizationLines(startRaw, lengthName, startIndex, context, 'ccjs_slice_start'))
  pushAllLines(lines, emitSliceIndexNormalizationLines(endRaw, lengthName, endIndex, context, 'ccjs_slice_end'))
  lines.push(`if (${endIndex} < ${startIndex}) ${endIndex} = ${startIndex};`)
  pushAllLines(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(
    emitStatusCheck(
      `ccjs_string_slice_parts(&ccjs_default_allocator, ${value.bytes}, ${value.length}, ${startIndex}, ${endIndex}, &${temp})`,
      context
    )
  )

  return {
    lines,
    expression: temp
  }
}

export function emitCStringSplitValueExpression(
  expression: AnyNode,
  context: StringCContext
): PreparedStringSplitExpression {
  const value = emitPreparedStringBytesOperand(expression.callee.object, context, 'ccjs_split_string')
  const separator = emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_split_separator')
  const temp = nextCName(context, 'ccjs_split_array')
  const lines: string[] = []
  registerOwnedValue(context, temp)

  pushAllLines(lines, value.lines)
  pushAllLines(lines, separator.lines)
  pushAllLines(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(
    emitStatusCheck(
      `ccjs_string_split_parts(&ccjs_default_allocator, ${value.bytes}, ${value.length}, ${separator.bytes}, ${separator.length}, &${temp})`,
      context
    )
  )
  lines.push(emitRuntimeValueCheck(temp, 'CCJS_TAG_ARRAY', context))

  return {
    lines,
    expression: temp,
    elementType: 'string'
  }
}

export function isStringConcatExpression(expression: AnyNode | null | undefined, context: StringCContext): boolean {
  if (expression == null || expression.type !== 'BinaryExpression') {
    return false
  }

  if (expression.operator !== '+') {
    return false
  }

  return (
    stringDeps(context).inferExpressionType(expression.left, context) === 'string' &&
    stringDeps(context).inferExpressionType(expression.right, context) === 'string'
  )
}

export function isRuntimeProducedStringExpression(
  expression: AnyNode | null | undefined,
  context: StringCContext
): boolean {
  if (expression == null) {
    return false
  }

  if (expression.type === 'CallExpression' && stringDeps(context).inferExpressionType(expression, context) === 'string') {
    return true
  }

  if (cOsRuntimeConstantName(expression) != null) {
    return true
  }

  if (cPathRuntimeConstantName(expression) != null) {
    return true
  }

  if (cProcessRuntimeStringPropertyName(expression) != null) {
    return true
  }

  if (cProcessRuntimeEnvName(expression) != null) {
    return true
  }

  if (cProcessRuntimePropertyName(expression) === 'argv' && expression.type === 'IndexExpression') {
    return true
  }

  if (expression.type === 'AwaitExpression' && stringDeps(context).inferExpressionType(expression, context) === 'string') {
    return true
  }

  if (isStringConcatExpression(expression, context)) {
    return true
  }

  if (expression.type === 'TemplateLiteral' && expression.raw.includes('${')) {
    return true
  }

  if (isNullishCoalescingExpression(expression) && stringDeps(context).canLowerCNullishCoalescingExpression(expression, context)) {
    return true
  }

  return stringDeps(context).isBoxedRuntimeStringReference(expression, context)
}

export function isRawStringLiteralExpression(expression: AnyNode | null | undefined): boolean {
  if (expression == null) {
    return false
  }

  if (expression.type === 'StringLiteral') {
    return true
  }

  return expression.type === 'TemplateLiteral' && !expression.raw.includes('${')
}

export function isStringConversionCall(expression: AnyNode | null | undefined, context: StringCContext): boolean {
  if (
    expression == null ||
    expression.type !== 'CallExpression' ||
    expression.callee.type !== 'Reference' ||
    expression.callee.path.length !== 1 ||
    expression.callee.path[0] !== 'String' ||
    expression.args.length !== 1
  ) {
    return false
  }

  const valueType = stringDeps(context).inferExpressionType(expression.args[0], context)

  return valueType === 'boolean' || valueType === 'null' || valueType === 'number' || valueType === 'string'
}

export function isNumberConversionCall(expression: AnyNode | null | undefined, context: StringCContext): boolean {
  if (
    expression == null ||
    expression.type !== 'CallExpression' ||
    expression.callee.type !== 'Reference' ||
    expression.callee.path.length !== 1 ||
    expression.callee.path[0] !== 'Number' ||
    expression.args.length !== 1
  ) {
    return false
  }

  return stringDeps(context).inferExpressionType(expression.args[0], context) === 'string'
}

export function isStringTrimCall(expression: AnyNode | null | undefined, context: StringCContext): boolean {
  if (
    expression == null ||
    expression.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.property !== 'trim' ||
    expression.args.length !== 0
  ) {
    return false
  }

  return isStringLengthObject(expression.callee.object, context)
}

export function isStringSliceCall(expression: AnyNode | null | undefined, context: StringCContext): boolean {
  if (
    expression == null ||
    expression.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.property !== 'slice' ||
    expression.args.length < 1 ||
    expression.args.length > 2
  ) {
    return false
  }

  if (!isStringLengthObject(expression.callee.object, context)) {
    return false
  }

  for (const arg of expression.args) {
    if (stringDeps(context).inferExpressionType(arg, context) !== 'number') {
      return false
    }
  }

  return true
}

export function isStringSplitCall(expression: AnyNode | null | undefined, context: StringCContext): boolean {
  if (
    expression == null ||
    expression.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.property !== 'split' ||
    expression.args.length !== 1
  ) {
    return false
  }

  return (
    isStringLengthObject(expression.callee.object, context) &&
    stringDeps(context).inferExpressionType(expression.args[0], context) === 'string'
  )
}

export function isStringPredicateCall(expression: AnyNode | null | undefined, context: StringCContext): boolean {
  if (
    expression == null ||
    expression.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    !isStringPredicateMethod(expression.callee.property) ||
    expression.args.length !== 1
  ) {
    return false
  }

  return (
    isStringLengthObject(expression.callee.object, context) &&
    stringDeps(context).inferExpressionType(expression.args[0], context) === 'string'
  )
}

function cStringPredicateHelperName(method: string): string {
  if (method === 'startsWith') {
    return 'ccjs_string_starts_with_parts'
  }

  if (method === 'endsWith') {
    return 'ccjs_string_ends_with_parts'
  }

  return 'ccjs_string_includes_parts'
}

function isStringLengthObject(expression: AnyNode | null | undefined, context: StringCContext): boolean {
  if (expression == null) {
    return false
  }

  if (expression.type === 'StringLiteral') {
    return true
  }

  if (expression.type === 'TemplateLiteral') {
    return true
  }

  if (expression.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]

    return context.variables.get(name) === 'string' || context.runtimeStrings.has(name)
  }

  return stringDeps(context).inferExpressionType(expression, context) === 'string'
}

function parseTemplateLiteralParts(
  raw: string,
  context: StringDiagnosticContext,
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

  if (loc != null) {
    locationState.line = loc.line
    locationState.column = loc.column + 1
  }

  while (index < end) {
    const char = raw[index]

    if (char === '\\') {
      text = text + raw.slice(index, Math.min(index + 2, end))
      advanceTemplateLocation(locationState, char)

      if (index + 1 < end) {
        advanceTemplateLocation(locationState, raw[index + 1])
      }

      index = index + 2
      continue
    }

    if (char === '$' && raw[index + 1] === '{') {
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

        if (quote != null) {
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
        context.diagnostics.push(
          diagnostic('CCJS_C_STRING_EXPR', 'unterminated template placeholder in C template literal', loc)
        )
        return parts
      }

      const placeholder = trimTemplatePlaceholder(raw.slice(placeholderStart, index), placeholderLoc)

      parts.push({
        kind: 'placeholder',
        value: placeholder.value,
        loc: placeholder.loc
      })
      advanceTemplateLocation(locationState, '}')
      index = index + 1
      continue
    }

    text = text + char
    advanceTemplateLocation(locationState, char)
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

function currentTemplateLocation(
  loc: SourceLocation | undefined,
  state: TemplateLocationState
): SourceLocation {
  return sourceLocationWithFile(loc, state.line, state.column)
}

function advanceTemplateLocation(state: TemplateLocationState, char: string): void {
  if (char === '\n') {
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

  return {
    value: trimTemplateTrailingWhitespace(value.slice(index)),
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
  return (
    value === ' ' ||
    value === '\n' ||
    value === '\r' ||
    value === '\t' ||
    value === '\f' ||
    value === '\v'
  )
}

export function collectTemplatePlaceholderExpressions(expression: AnyNode | null | undefined): AnyNode[] {
  if (expression == null || expression.type !== 'TemplateLiteral' || !expression.raw.includes('${')) {
    return []
  }

  const diagnostics: Diagnostic[] = []
  const parts = parseTemplateLiteralParts(expression.raw, { diagnostics }, expression.loc)
  const result: AnyNode[] = []

  for (const part of parts) {
    if (part.kind !== 'placeholder' || part.value === '' || part.loc == null) {
      continue
    }

    const parsed = parseTemplatePlaceholderCaptureExpression(part.value, part.loc)

    if (parsed != null) {
      result.push(parsed)
    }
  }

  return result
}

function parseTemplatePlaceholderCaptureExpression(value: string, loc: SourceLocation): AnyNode | null {
  const prefix = 'const __ccjs_template = '

  try {
    const program = parse(tokenize(`${prefix}${value}`, tokenizeLocationOptions(loc)))
    const statement = program.body[0]
    let expression: AnyNode | null = null

    if (statement != null && statement.type === 'VariableDeclaration') {
      expression = statement.init
    }

    if (program.body.length !== 1 || expression == null) {
      return null
    }

    shiftTemplatePlaceholderExpressionLocations(expression, loc, prefix.length)

    return expression
  } catch (error) {
    const compileError = compileErrorOrNull(error)

    if (compileError != null) {
      return null
    }

    throw error
  }
}

function parseTemplatePlaceholderExpression(
  value: string,
  loc: SourceLocation,
  context: StringCContext
): AnyNode | null {
  if (value === '') {
    context.diagnostics.push(diagnostic('CCJS_C_STRING_EXPR', 'empty template placeholder in C template literal', loc))
    return null
  }

  const prefix = 'const __ccjs_template = '

  try {
    const program = parse(tokenize(`${prefix}${value}`, tokenizeLocationOptions(loc)))
    const statement = program.body[0]
    let expression: AnyNode | null = null

    if (statement != null && statement.type === 'VariableDeclaration') {
      expression = statement.init
    }

    if (program.body.length !== 1) {
      context.diagnostics.push(
        diagnostic('CCJS_C_STRING_EXPR', 'template placeholder must contain exactly one expression', loc)
      )
      return null
    }

    if (expression == null) {
      context.diagnostics.push(
        diagnostic('CCJS_C_STRING_EXPR', 'template placeholder must contain exactly one expression', loc)
      )
      return null
    }

    shiftTemplatePlaceholderExpressionLocations(expression, loc, prefix.length)

    if (validateTemplatePlaceholderExpressionReferences(expression, context)) {
      return expression
    }

    return null
  } catch (error) {
    const compileError = compileErrorOrNull(error)

    if (compileError != null) {
      const first = compileError.diagnostics[0]
      let code = 'CCJS_C_STRING_EXPR'
      let message = 'invalid template placeholder expression'

      if (compileError.diagnostics.length > 0) {
        code = first.code
        message = `invalid template placeholder expression: ${first.message}`
      }

      context.diagnostics.push(
        diagnostic(
          code,
          message,
          loc
        )
      )

      return null
    }

    throw error
  }
}

function validateTemplatePlaceholderExpressionReferences(expression: AnyNode | null, context: StringCContext): boolean {
  const reported: Set<string> = new Set()
  const state: TemplateReferenceValidationState = {
    context,
    reported,
    valid: true
  }

  visitTemplatePlaceholderValue(expression, null, '', state)

  return state.valid
}

function visitTemplatePlaceholderValue(
  value: AnyNode | AnyNode[] | null | undefined,
  parent: AnyNode | null,
  key: string,
  state: TemplateReferenceValidationState
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      visitTemplatePlaceholderValue(item, parent, key, state)
    }

    return
  }

  if (value == null) {
    return
  }

  const node = value

  if (node.type === 'Reference') {
    const name = node.path[0]

    if (!isKnownTemplatePlaceholderReference(node, parent, key, state.context)) {
      reportUnknownTemplatePlaceholderReference(node, name, state)
    }
  }

  visitTemplatePlaceholderChildren(node, parent, key, state)
}

function reportUnknownTemplatePlaceholderReference(
  node: AnyNode,
  name: string,
  state: TemplateReferenceValidationState
): void {
  let line = 1
  let column = 1

  if (node.loc != null) {
    line = node.loc.line
    column = node.loc.column
  }

  const reportKey = `${name}:${line}:${column}`

  if (!state.reported.has(reportKey)) {
    state.reported.add(reportKey)
    state.context.diagnostics.push(diagnostic('CCJS_UNKNOWN_NAME', `unknown name ${name}`, node.loc))
  }

  state.valid = false
}

function visitTemplatePlaceholderChildren(
  node: AnyNode,
  parent: AnyNode | null,
  key: string,
  state: TemplateReferenceValidationState
): void {
  if (node.type === 'BinaryExpression') {
    visitTemplatePlaceholderValue(node.left, node, 'left', state)
    visitTemplatePlaceholderValue(node.right, node, 'right', state)
    return
  }

  if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression' || node.type === 'NewExpression') {
    visitTemplatePlaceholderValue(node.callee, node, 'callee', state)
    visitTemplatePlaceholderValue(node.args, node, 'args', state)
    return
  }

  if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
    visitTemplatePlaceholderValue(node.object, node, 'object', state)
    return
  }

  if (node.type === 'IndexExpression' || node.type === 'OptionalIndexExpression') {
    visitTemplatePlaceholderValue(node.object, node, 'object', state)
    visitTemplatePlaceholderValue(node.index, node, 'index', state)
    return
  }

  if (
    node.type === 'AwaitExpression' ||
    node.type === 'UnaryExpression' ||
    node.type === 'UpdateExpression' ||
    node.type === 'TypeAssertionExpression'
  ) {
    visitTemplatePlaceholderValue(node.argument, node, 'argument', state)
    visitTemplatePlaceholderValue(node.expression, node, 'expression', state)
    return
  }

  if (node.type === 'ArrayLiteral') {
    visitTemplatePlaceholderValue(node.elements, node, 'elements', state)
    return
  }

  if (node.type === 'ObjectLiteral') {
    visitTemplatePlaceholderValue(node.properties, node, 'properties', state)
    return
  }

  if (node.type == null && node.value != null) {
    visitTemplatePlaceholderValue(node.value, node, 'value', state)
  }
}

function isKnownTemplatePlaceholderReference(
  expression: AnyNode,
  parent: AnyNode | null,
  key: string,
  context: StringCContext
): boolean {
  const name = expression.path[0]

  if (context.variables.has(expression.path.join('.'))) {
    return true
  }

  if (context.variables.has(name)) {
    return true
  }

  if (context.functionNames.has(name)) {
    return true
  }

  if (isCJsGlobalRoot(name, { jsGlobalRoots: context.jsGlobalRoots })) {
    return true
  }

  if (key === 'callee' && parent != null && parent.type === 'CallExpression' && expression.path.length === 1) {
    return name === 'Number' || name === 'String'
  }

  return false
}

function shiftTemplatePlaceholderExpressionLocations(
  value: AnyNode | AnyNode[] | null | undefined,
  loc: SourceLocation,
  prefixLength: number
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      shiftTemplatePlaceholderExpressionLocations(item, loc, prefixLength)
    }

    return
  }

  if (value == null) {
    return
  }

  const node = value

  if (node.loc != null) {
    shiftTemplatePlaceholderLocation(node.loc, loc, prefixLength)
  }

  shiftTemplatePlaceholderChildLocations(node, loc, prefixLength)
}

function shiftTemplatePlaceholderLocation(target: SourceLocation, loc: SourceLocation, prefixLength: number): void {
  const lineOffset = target.line - 1

  target.line = loc.line + lineOffset

  if (lineOffset === 0) {
    target.column = loc.column + target.column - prefixLength - 1
  }

  target.file = ''
}

function shiftTemplatePlaceholderChildLocations(node: AnyNode, loc: SourceLocation, prefixLength: number): void {
  if (node.type === 'BinaryExpression') {
    shiftTemplatePlaceholderExpressionLocations(node.left, loc, prefixLength)
    shiftTemplatePlaceholderExpressionLocations(node.right, loc, prefixLength)
    return
  }

  if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression' || node.type === 'NewExpression') {
    shiftTemplatePlaceholderExpressionLocations(node.callee, loc, prefixLength)
    shiftTemplatePlaceholderExpressionLocations(node.args, loc, prefixLength)
    return
  }

  if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
    shiftTemplatePlaceholderExpressionLocations(node.object, loc, prefixLength)
    return
  }

  if (node.type === 'IndexExpression' || node.type === 'OptionalIndexExpression') {
    shiftTemplatePlaceholderExpressionLocations(node.object, loc, prefixLength)
    shiftTemplatePlaceholderExpressionLocations(node.index, loc, prefixLength)
    return
  }

  if (
    node.type === 'AwaitExpression' ||
    node.type === 'UnaryExpression' ||
    node.type === 'UpdateExpression' ||
    node.type === 'TypeAssertionExpression'
  ) {
    shiftTemplatePlaceholderExpressionLocations(node.argument, loc, prefixLength)
    shiftTemplatePlaceholderExpressionLocations(node.expression, loc, prefixLength)
    return
  }

  if (node.type === 'ArrayLiteral') {
    shiftTemplatePlaceholderExpressionLocations(node.elements, loc, prefixLength)
    return
  }

  if (node.type === 'ObjectLiteral') {
    shiftTemplatePlaceholderExpressionLocations(node.properties, loc, prefixLength)
    return
  }

  if (node.type == null && node.value != null) {
    shiftTemplatePlaceholderExpressionLocations(node.value, loc, prefixLength)
  }
}

export function isCStringRuntimeMethodName(name: string): boolean {
  return isStringRuntimeMethod(name)
}
