import { CompileError, diagnostic } from '../../diagnostics.ts'
import { tokenize } from '../../lexer.ts'
import { parse } from '../../parser.ts'
import {
  emitPrepareOwnedValueWrite,
  emitRuntimeTypeCheck,
  emitStatusCheck,
  nextCName,
  registerOwnedValue,
  type CFunctionContext
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
import type { Diagnostic, SourceLocation } from '../../types.ts'
import type { CObjectFieldInfo, CPreparedExpression as PreparedExpression } from '../types.ts'

type StringDiagnosticContext = {
  diagnostics: Diagnostic[]
}

type TemplateLiteralPart =
  | {
      type: 'text'
      value: string
    }
  | {
      type: 'placeholder'
      value: string
      loc: SourceLocation
    }

export type StringLoweringDependencies = {
  canLowerCNullishCoalescingExpression: (expression: any, context: CFunctionContext) => boolean
  emitCallExpression: (expression: any, context: CFunctionContext) => string
  emitCValueExpression: (expression: any, context: CFunctionContext) => PreparedExpression
  emitPreparedNumberExpression: (expression: any, context: CFunctionContext) => PreparedExpression
  emitReference: (expression: any, context: CFunctionContext) => string
  inferExpressionType: (expression: any, context: CFunctionContext) => string
  isBoxedRuntimeStringName: (name: string, context: CFunctionContext) => boolean
  isBoxedRuntimeStringReference: (expression: any, context: CFunctionContext) => boolean
  isMemberAccessExpression: (expression: any) => boolean
  resolveKnownObjectMember: (expression: any, context: CFunctionContext) => CObjectFieldInfo | null
  resolveNetAddressStringMember: (expression: any, context: CFunctionContext) => string | null
}

function stringDeps(context: CFunctionContext): StringLoweringDependencies {
  return context.stringLoweringDependencies
}

export function resolveRuntimeStringReference(expression: any, context: CFunctionContext) {
  if (expression?.type !== 'Reference' || expression.path.length !== 1) {
    return null
  }

  const name = expression.path[0]

  return context.runtimeStrings.has(name) ? name : null
}

export function emitStringExpression(expression: any, context: CFunctionContext) {
  if (expression?.type === 'StringLiteral') {
    return JSON.stringify(expression.value)
  }

  if (expression?.type === 'TemplateLiteral' && !expression.raw.includes('${')) {
    return JSON.stringify(expression.raw.slice(1, -1))
  }

  if (expression?.type === 'Reference') {
    return stringDeps(context).emitReference(expression, context)
  }

  if (expression?.type === 'CallExpression') {
    return stringDeps(context).emitCallExpression(expression, context)
  }

  if (isNullishCoalescingExpression(expression)) {
    context.diagnostics.push(
      diagnostic('CCJS_C_NULLISH', 'nullish coalescing is not supported by the current C backend slice', expression.loc)
    )
    return '""'
  }

  if (stringDeps(context).isMemberAccessExpression(expression)) {
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

  if (expression?.type === 'AwaitExpression') {
    context.diagnostics.push(
      diagnostic('CCJS_C_ASYNC', 'async/await is not supported by the current C backend slice', expression?.loc)
    )
    return '""'
  }

  if (isOptionalChainExpression(expression)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_OPTIONAL_CHAINING',
        'optional chaining is not supported by the current C backend slice',
        expression?.loc
      )
    )
    return '""'
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_C_STRING_EXPR',
      'this string expression is not supported by the current C backend slice',
      expression?.loc
    )
  )
  return '""'
}

export function emitPreparedStringLengthExpression(expression: any, context: CFunctionContext) {
  if (
    expression?.type !== 'MemberExpression' ||
    expression.property !== 'length' ||
    !isStringLengthObject(expression.object, context)
  ) {
    return null
  }

  const operand = emitPreparedStringBytesOperand(expression.object, context, 'ccjs_length_string')
  const length = nextCName(context, 'ccjs_string_length')

  return {
    lines: [
      ...operand.lines,
      `size_t ${length} = ccjs_string_code_point_length_parts(${operand.bytes}, ${operand.length});`
    ],
    expression: `((double)${length})`
  }
}

export function emitPreparedStringCompareExpression(expression: any, context: CFunctionContext) {
  const left = emitPreparedStringBytesOperand(expression.left, context)
  const right = emitPreparedStringBytesOperand(expression.right, context)
  const equals = `(${left.length} == ${right.length} && memcmp(${left.bytes}, ${right.bytes}, ${left.length}) == 0)`

  return {
    lines: [...left.lines, ...right.lines],
    expression: ['===', '=='].includes(expression.operator) ? equals : `(!${equals})`
  }
}

export function emitPreparedStringPredicateCall(expression: any, context: CFunctionContext) {
  const value = emitPreparedStringBytesOperand(expression.callee.object, context, 'ccjs_string_method_value')
  const search = emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_string_method_search')
  const helper = cStringPredicateHelperName(expression.callee.property)

  return {
    lines: [...value.lines, ...search.lines],
    expression: `(${helper}(${value.bytes}, ${value.length}, ${search.bytes}, ${search.length}) ? 1 : 0)`
  }
}

export function emitPreparedStringBytesOperand(
  expression: any,
  context: CFunctionContext,
  tempPrefix = 'ccjs_cmp_string'
) {
  if (expression?.type === 'StringLiteral') {
    return {
      lines: [],
      bytes: cStringLiteral(expression.value),
      length: `${utf8ByteLength(expression.value)}`
    }
  }

  if (expression?.type === 'TemplateLiteral' && !expression.raw.includes('${')) {
    const value = expression.raw.slice(1, -1)

    return {
      lines: [],
      bytes: cStringLiteral(value),
      length: `${utf8ByteLength(value)}`
    }
  }

  if (expression?.type === 'TemplateLiteral') {
    const value = emitCTemplateLiteralValueExpression(expression, context)
    const string = nextCName(context, tempPrefix)

    return {
      lines: [...value.lines, `ccjs_string* ${string} = (ccjs_string*)${value.expression}.as.ref;`],
      bytes: `${string}->bytes`,
      length: `${string}->len`
    }
  }

  if (expression?.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]

    if (context.variables.get(name) === 'string') {
      if (stringDeps(context).isBoxedRuntimeStringName(name, context)) {
        const string = nextCName(context, tempPrefix)

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
    const string = nextCName(context, tempPrefix)

    return {
      lines: [...value.lines, `ccjs_string* ${string} = (ccjs_string*)${value.expression}.as.ref;`],
      bytes: `${string}->bytes`,
      length: `${string}->len`
    }
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_C_STRING_EXPR',
      'this string operand is not supported by the current C backend slice',
      expression?.loc
    )
  )

  return {
    lines: [],
    bytes: '""',
    length: '0'
  }
}

export function emitCStringConcatValueExpression(expression: any, context: CFunctionContext) {
  const left = emitPreparedStringBytesOperand(expression.left, context)
  const right = emitPreparedStringBytesOperand(expression.right, context)
  const temp = nextCName(context, 'ccjs_value')
  registerOwnedValue(context, temp)

  return {
    lines: [
      ...left.lines,
      ...right.lines,
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(
        `ccjs_string_concat_parts(&ccjs_default_allocator, ${left.bytes}, ${left.length}, ${right.bytes}, ${right.length}, &${temp})`,
        context
      )
    ],
    expression: temp
  }
}

export function emitCTemplateLiteralValueExpression(expression: any, context: CFunctionContext) {
  const parts = parseTemplateLiteralParts(expression.raw, context, expression.loc)
  const operands = parts
    .map((part) => {
      if (part.type === 'text') {
        return {
          lines: [],
          bytes: cStringLiteral(part.value),
          length: `${utf8ByteLength(part.value)}`
        }
      }

      const placeholder = parseTemplatePlaceholderExpression(part.value, part.loc, context)

      return placeholder == null ? null : emitPreparedTemplatePlaceholderBytesOperand(placeholder, context)
    })
    .filter((operand) => operand != null)

  if (operands.length === 0) {
    const temp = nextCName(context, 'ccjs_value')
    registerOwnedValue(context, temp)

    return {
      lines: [
        ...emitPrepareOwnedValueWrite(temp),
        emitStatusCheck(`ccjs_string_from_literal(&ccjs_default_allocator, "", 0, &${temp})`, context)
      ],
      expression: temp
    }
  }

  const lines = operands.flatMap((operand) => operand.lines)

  if (operands.length === 1) {
    const [operand] = operands
    const temp = nextCName(context, 'ccjs_value')
    registerOwnedValue(context, temp)

    return {
      lines: [
        ...lines,
        ...emitPrepareOwnedValueWrite(temp),
        emitStatusCheck(
          `ccjs_string_from_literal(&ccjs_default_allocator, ${operand.bytes}, ${operand.length}, &${temp})`,
          context
        )
      ],
      expression: temp
    }
  }

  let current = operands[0]
  let currentValue = ''

  for (const operand of operands.slice(1)) {
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

    lines.push(
      ...emitPrepareOwnedValueWrite(temp),
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

function emitPreparedTemplatePlaceholderBytesOperand(expression: any, context: CFunctionContext) {
  const type = stringDeps(context).inferExpressionType(expression, context)

  if (type === 'string') {
    return emitPreparedStringBytesOperand(expression, context, 'ccjs_template_string')
  }

  if (type === 'number' || type === 'boolean' || type === 'null') {
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

    return {
      lines: [...value.lines, `ccjs_string* ${string} = (ccjs_string*)${value.expression}.as.ref;`],
      bytes: `${string}->bytes`,
      length: `${string}->len`
    }
  }

  context.diagnostics.push(
    diagnostic(
      cUnsupportedExpressionCode(type),
      'template placeholders currently support string, number, boolean and null expressions in C',
      expression?.loc
    )
  )

  return {
    lines: [],
    bytes: '""',
    length: '0'
  }
}

export function emitCStringConversionValueExpression(expression: any, context: CFunctionContext) {
  const [arg] = expression.args
  const type = stringDeps(context).inferExpressionType(arg, context)
  const temp = nextCName(context, 'ccjs_value')
  registerOwnedValue(context, temp)

  if (type === 'string') {
    const value = emitPreparedStringBytesOperand(arg, context, 'ccjs_string_conversion')

    return {
      lines: [
        ...value.lines,
        ...emitPrepareOwnedValueWrite(temp),
        emitStatusCheck(
          `ccjs_string_from_literal(&ccjs_default_allocator, ${value.bytes}, ${value.length}, &${temp})`,
          context
        )
      ],
      expression: temp
    }
  }

  if (type === 'null') {
    return {
      lines: [
        ...emitPrepareOwnedValueWrite(temp),
        emitStatusCheck(`ccjs_string_from_literal(&ccjs_default_allocator, "null", 4, &${temp})`, context)
      ],
      expression: temp
    }
  }

  const value = stringDeps(context).emitPreparedNumberExpression(arg, context)
  const helper =
    type === 'boolean'
      ? `ccjs_string_from_bool(&ccjs_default_allocator, (${value.expression}) != 0, &${temp})`
      : `ccjs_string_from_number(&ccjs_default_allocator, ${value.expression}, &${temp})`

  return {
    lines: [...value.lines, ...emitPrepareOwnedValueWrite(temp), emitStatusCheck(helper, context)],
    expression: temp
  }
}

export function emitCNumberConversionValueExpression(expression: any, context: CFunctionContext) {
  if (!isNumberConversionCall(expression, context)) {
    return null
  }

  const value = emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_number_conversion')
  const temp = nextCName(context, 'ccjs_value')
  registerOwnedValue(context, temp)

  return {
    lines: [
      ...value.lines,
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(`ccjs_string_to_number(${value.bytes}, ${value.length}, &${temp})`, context)
    ],
    expression: temp
  }
}

export function emitCStringTrimValueExpression(expression: any, context: CFunctionContext) {
  const value = emitPreparedStringBytesOperand(expression.callee.object, context, 'ccjs_trim_string')
  const temp = nextCName(context, 'ccjs_value')
  registerOwnedValue(context, temp)

  return {
    lines: [
      ...value.lines,
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(
        `ccjs_string_trim_parts(&ccjs_default_allocator, ${value.bytes}, ${value.length}, &${temp})`,
        context
      )
    ],
    expression: temp
  }
}

export function emitCStringSliceValueExpression(expression: any, context: CFunctionContext) {
  const value = emitPreparedStringBytesOperand(expression.callee.object, context, 'ccjs_slice_string')
  const start = stringDeps(context).emitPreparedNumberExpression(expression.args[0], context)
  const lengthName = nextCName(context, 'ccjs_slice_length')
  const startRaw = nextCName(context, 'ccjs_slice_start_raw')
  const startIndex = nextCName(context, 'ccjs_slice_start')
  const endRaw = nextCName(context, 'ccjs_slice_end_raw')
  const endIndex = nextCName(context, 'ccjs_slice_end')
  const end =
    expression.args[1] == null
      ? {
          lines: [],
          expression: `((double)${lengthName})`
        }
      : stringDeps(context).emitPreparedNumberExpression(expression.args[1], context)
  const temp = nextCName(context, 'ccjs_value')
  registerOwnedValue(context, temp)

  return {
    lines: [
      ...value.lines,
      ...start.lines,
      `size_t ${lengthName} = ccjs_string_code_point_length_parts(${value.bytes}, ${value.length});`,
      ...end.lines,
      `double ${startRaw} = ${start.expression};`,
      `double ${endRaw} = ${end.expression};`,
      ...emitSliceIndexNormalizationLines(startRaw, lengthName, startIndex, context, 'ccjs_slice_start'),
      ...emitSliceIndexNormalizationLines(endRaw, lengthName, endIndex, context, 'ccjs_slice_end'),
      `if (${endIndex} < ${startIndex}) ${endIndex} = ${startIndex};`,
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(
        `ccjs_string_slice_parts(&ccjs_default_allocator, ${value.bytes}, ${value.length}, ${startIndex}, ${endIndex}, &${temp})`,
        context
      )
    ],
    expression: temp
  }
}

export function emitCStringSplitValueExpression(expression: any, context: CFunctionContext) {
  const value = emitPreparedStringBytesOperand(expression.callee.object, context, 'ccjs_split_string')
  const separator = emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_split_separator')
  const temp = nextCName(context, 'ccjs_split_array')
  registerOwnedValue(context, temp)

  return {
    lines: [
      ...value.lines,
      ...separator.lines,
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(
        `ccjs_string_split_parts(&ccjs_default_allocator, ${value.bytes}, ${value.length}, ${separator.bytes}, ${separator.length}, &${temp})`,
        context
      ),
      emitRuntimeValueCheck(temp, 'CCJS_TAG_ARRAY', context)
    ],
    expression: temp,
    elementType: 'string'
  }
}

export function isStringConcatExpression(expression: any, context: CFunctionContext) {
  return (
    expression?.type === 'BinaryExpression' &&
    expression.operator === '+' &&
    stringDeps(context).inferExpressionType(expression.left, context) === 'string' &&
    stringDeps(context).inferExpressionType(expression.right, context) === 'string'
  )
}

export function isRuntimeProducedStringExpression(expression: any, context: CFunctionContext) {
  return (
    (expression?.type === 'CallExpression' && stringDeps(context).inferExpressionType(expression, context) === 'string') ||
    cOsRuntimeConstantName(expression) != null ||
    cPathRuntimeConstantName(expression) != null ||
    cProcessRuntimeStringPropertyName(expression) != null ||
    cProcessRuntimeEnvName(expression) != null ||
    (cProcessRuntimePropertyName(expression) === 'argv' && expression?.type === 'IndexExpression') ||
    (expression?.type === 'AwaitExpression' && stringDeps(context).inferExpressionType(expression, context) === 'string') ||
    isStringConcatExpression(expression, context) ||
    (expression?.type === 'TemplateLiteral' && expression.raw.includes('${')) ||
    (isNullishCoalescingExpression(expression) && stringDeps(context).canLowerCNullishCoalescingExpression(expression, context)) ||
    stringDeps(context).isBoxedRuntimeStringReference(expression, context)
  )
}

export function isRawStringLiteralExpression(expression) {
  return (
    expression?.type === 'StringLiteral' || (expression?.type === 'TemplateLiteral' && !expression.raw.includes('${'))
  )
}

export function isStringConversionCall(expression: any, context: CFunctionContext) {
  if (
    expression?.type !== 'CallExpression' ||
    expression.callee.type !== 'Reference' ||
    expression.callee.path.length !== 1 ||
    expression.callee.path[0] !== 'String' ||
    expression.args.length !== 1
  ) {
    return false
  }

  return ['boolean', 'null', 'number', 'string'].includes(stringDeps(context).inferExpressionType(expression.args[0], context))
}

export function isNumberConversionCall(expression: any, context: CFunctionContext) {
  if (
    expression?.type !== 'CallExpression' ||
    expression.callee.type !== 'Reference' ||
    expression.callee.path.length !== 1 ||
    expression.callee.path[0] !== 'Number' ||
    expression.args.length !== 1
  ) {
    return false
  }

  return stringDeps(context).inferExpressionType(expression.args[0], context) === 'string'
}

export function isStringTrimCall(expression: any, context: CFunctionContext) {
  if (
    expression?.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.property !== 'trim' ||
    expression.args.length !== 0
  ) {
    return false
  }

  return isStringLengthObject(expression.callee.object, context)
}

export function isStringSliceCall(expression: any, context: CFunctionContext) {
  if (
    expression?.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.property !== 'slice' ||
    expression.args.length < 1 ||
    expression.args.length > 2
  ) {
    return false
  }

  return (
    isStringLengthObject(expression.callee.object, context) &&
    expression.args.every((arg) => stringDeps(context).inferExpressionType(arg, context) === 'number')
  )
}

export function isStringSplitCall(expression: any, context: CFunctionContext) {
  if (
    expression?.type !== 'CallExpression' ||
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

export function isStringPredicateCall(expression: any, context: CFunctionContext) {
  if (
    expression?.type !== 'CallExpression' ||
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

function cStringPredicateHelperName(method) {
  if (method === 'startsWith') {
    return 'ccjs_string_starts_with_parts'
  }

  if (method === 'endsWith') {
    return 'ccjs_string_ends_with_parts'
  }

  return 'ccjs_string_includes_parts'
}

function isStringLengthObject(expression: any, context: CFunctionContext) {
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

function parseTemplateLiteralParts(raw: string, context: StringDiagnosticContext, loc: SourceLocation | undefined) {
  const parts: TemplateLiteralPart[] = []
  let text = ''
  let index = 1
  const end = raw.endsWith('`') ? raw.length - 1 : raw.length
  let line = loc?.line ?? 1
  let column = (loc?.column ?? 1) + 1

  while (index < end) {
    const char = raw[index]

    if (char === '\\') {
      text += raw.slice(index, Math.min(index + 2, end))
      advanceTemplateLocation(char)

      if (index + 1 < end) {
        advanceTemplateLocation(raw[index + 1])
      }

      index += 2
      continue
    }

    if (char === '$' && raw[index + 1] === '{') {
      if (text !== '') {
        parts.push({
          type: 'text',
          value: text
        })
        text = ''
      }

      advanceTemplateLocation('$')
      advanceTemplateLocation('{')
      index += 2

      const placeholderStart = index
      const placeholderLoc = currentTemplateLocation()
      let depth = 0
      let quote: string | null = null

      while (index < end) {
        const current = raw[index]

        if (quote != null) {
          advanceTemplateLocation(current)

          if (current === '\\' && index + 1 < end) {
            index += 1
            advanceTemplateLocation(raw[index])
          } else if (current === quote) {
            quote = null
          }

          index += 1
          continue
        }

        if (current === '"' || current === "'" || current === '`') {
          quote = current
          advanceTemplateLocation(current)
          index += 1
          continue
        }

        if (current === '{') {
          depth += 1
          advanceTemplateLocation(current)
          index += 1
          continue
        }

        if (current === '}') {
          if (depth === 0) {
            break
          }

          depth -= 1
          advanceTemplateLocation(current)
          index += 1
          continue
        }

        advanceTemplateLocation(current)
        index += 1
      }

      if (index >= end) {
        context.diagnostics.push(
          diagnostic('CCJS_C_STRING_EXPR', 'unterminated template placeholder in C template literal', loc)
        )
        return parts
      }

      const placeholder = trimTemplatePlaceholder(raw.slice(placeholderStart, index), placeholderLoc)

      parts.push({
        type: 'placeholder',
        value: placeholder.value,
        loc: placeholder.loc
      })
      advanceTemplateLocation('}')
      index += 1
      continue
    }

    text += char
    advanceTemplateLocation(char)
    index += 1
  }

  if (text !== '') {
    parts.push({
      type: 'text',
      value: text
    })
  }

  return parts

  function currentTemplateLocation(): SourceLocation {
    return {
      ...(loc?.file == null ? {} : { file: loc.file }),
      line,
      column
    }
  }

  function advanceTemplateLocation(char: string): void {
    if (char === '\n') {
      line += 1
      column = 1
      return
    }

    column += 1
  }
}

function trimTemplatePlaceholder(value, loc) {
  let index = 0
  let line = loc.line
  let column = loc.column

  while (index < value.length && /\s/.test(value[index])) {
    if (value[index] === '\n') {
      line += 1
      column = 1
    } else {
      column += 1
    }

    index += 1
  }

  return {
    value: value.slice(index).trimEnd(),
    loc: {
      ...(loc.file == null ? {} : { file: loc.file }),
      line,
      column
    }
  }
}

export function collectTemplatePlaceholderExpressions(expression) {
  if (expression?.type !== 'TemplateLiteral' || !expression.raw.includes('${')) {
    return []
  }

  const diagnostics: Diagnostic[] = []
  const parts = parseTemplateLiteralParts(expression.raw, { diagnostics }, expression.loc)
  const result: any[] = []

  for (const part of parts) {
    if (part.type !== 'placeholder' || part.value === '') {
      continue
    }

    const parsed = parseTemplatePlaceholderCaptureExpression(part.value, part.loc)

    if (parsed != null) {
      result.push(parsed)
    }
  }

  return result
}

function parseTemplatePlaceholderCaptureExpression(value, loc) {
  const prefix = 'const __ccjs_template = '

  try {
    const program = parse(tokenize(`${prefix}${value}`, loc?.file == null ? {} : { file: loc.file }))
    const statement = program.body[0]
    const expression = statement?.type === 'VariableDeclaration' ? statement.init : null

    if (program.body.length !== 1 || expression == null) {
      return null
    }

    shiftTemplatePlaceholderExpressionLocations(expression, loc, prefix.length)

    return expression
  } catch (error) {
    if (error instanceof CompileError) {
      return null
    }

    throw error
  }
}

function parseTemplatePlaceholderExpression(value: string, loc: SourceLocation, context: CFunctionContext) {
  if (value === '') {
    context.diagnostics.push(diagnostic('CCJS_C_STRING_EXPR', 'empty template placeholder in C template literal', loc))
    return null
  }

  const prefix = 'const __ccjs_template = '

  try {
    const program = parse(tokenize(`${prefix}${value}`, loc.file == null ? {} : { file: loc.file }))
    const statement = program.body[0]
    const expression = statement?.type === 'VariableDeclaration' ? statement.init : null

    if (program.body.length !== 1 || expression == null) {
      context.diagnostics.push(
        diagnostic('CCJS_C_STRING_EXPR', 'template placeholder must contain exactly one expression', loc)
      )
      return null
    }

    shiftTemplatePlaceholderExpressionLocations(expression, loc, prefix.length)

    return validateTemplatePlaceholderExpressionReferences(expression, context) ? expression : null
  } catch (error) {
    if (error instanceof CompileError) {
      const first = error.diagnostics[0]

      context.diagnostics.push(
        diagnostic(
          first?.code ?? 'CCJS_C_STRING_EXPR',
          first == null
            ? 'invalid template placeholder expression'
            : `invalid template placeholder expression: ${first.message}`,
          loc
        )
      )

      return null
    }

    throw error
  }
}

function validateTemplatePlaceholderExpressionReferences(expression: any, context: CFunctionContext) {
  const reported = new Set<string>()
  let valid = true

  visit(expression, null, '')

  return valid

  function visit(value, parent, key) {
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item, parent, key)
      }

      return
    }

    if (value == null || typeof value !== 'object') {
      return
    }

    if (value.type === 'Reference') {
      const name = value.path[0]

      if (!isKnownTemplatePlaceholderReference(value, parent, key, context)) {
        const reportKey = `${name}:${value.loc?.line ?? 1}:${value.loc?.column ?? 1}`

        if (!reported.has(reportKey)) {
          reported.add(reportKey)
          context.diagnostics.push(diagnostic('CCJS_UNKNOWN_NAME', `unknown name ${name}`, value.loc))
        }

        valid = false
      }
    }

    for (const [childKey, child] of Object.entries(value)) {
      if (childKey === 'loc' || childKey.endsWith('Loc')) {
        continue
      }

      visit(child, value, childKey)
    }
  }
}

function isKnownTemplatePlaceholderReference(
  expression: any,
  parent: any,
  key: string,
  context: CFunctionContext
) {
  const name = expression.path[0]

  return (
    context.variables.has(expression.path.join('.')) ||
    context.variables.has(name) ||
    context.functionNames.has(name) ||
    isCJsGlobalRoot(name, context) ||
    (key === 'callee' &&
      parent?.type === 'CallExpression' &&
      expression.path.length === 1 &&
      ['Number', 'String'].includes(name))
  )
}

function shiftTemplatePlaceholderExpressionLocations(value, loc, prefixLength) {
  if (Array.isArray(value)) {
    for (const item of value) {
      shiftTemplatePlaceholderExpressionLocations(item, loc, prefixLength)
    }

    return
  }

  if (value == null || typeof value !== 'object') {
    return
  }

  if (typeof value.line === 'number' && typeof value.column === 'number') {
    const lineOffset = value.line - 1

    value.line = loc.line + lineOffset
    value.column = lineOffset === 0 ? loc.column + value.column - prefixLength - 1 : value.column

    if (loc.file == null) {
      delete value.file
    } else {
      value.file = loc.file
    }
  }

  for (const child of Object.values(value)) {
    shiftTemplatePlaceholderExpressionLocations(child, loc, prefixLength)
  }
}

export function isCStringRuntimeMethodName(name) {
  return isStringRuntimeMethod(name)
}
