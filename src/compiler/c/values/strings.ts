import { diagnostic } from '../../diagnostics.ts'
import { emitRuntimeTypeCheck, nextCName } from '../context.ts'
import { cStringLiteral, utf8ByteLength } from '../identifiers.ts'
import { emitRuntimeValueCheck } from '../runtime-values.ts'
import { isBinaryRuntimeCall } from '../stdlib/binary.ts'
import { cOsRuntimeConstantName } from '../stdlib/os.ts'
import { cPathRuntimeConstantName } from '../stdlib/path.ts'
import {
  cProcessRuntimeEnvName,
  cProcessRuntimePropertyName,
  cProcessRuntimeStringPropertyName
} from '../stdlib/process.ts'
import { cUnsupportedExpressionCode, isNullishCoalescingExpression, isOptionalChainExpression } from '../syntax.ts'
import { isStringPredicateMethod, isStringRuntimeMethod } from '../../stdlib/descriptors/collections.ts'

type PreparedExpression = {
  lines: string[]
  expression: string
}

export type StringLoweringDependencies = {
  canLowerCNullishCoalescingExpression: (expression: any, context: any) => boolean
  emitCallExpression: (expression: any, context: any) => string
  emitCTemplateLiteralValueExpression: (expression: any, context: any) => PreparedExpression
  emitCValueExpression: (expression: any, context: any) => PreparedExpression
  emitReference: (expression: any, context: any) => string
  inferExpressionType: (expression: any, context: any) => string
  isBoxedRuntimeStringName: (name: string, context: any) => boolean
  isBoxedRuntimeStringReference: (expression: any, context: any) => boolean
  isMemberAccessExpression: (expression: any) => boolean
  resolveKnownObjectMember: (expression: any, context: any) => any | null
  resolveNetAddressStringMember: (expression: any, context: any) => string | null
}

function stringDeps(context: any): StringLoweringDependencies {
  return context.stringLoweringDependencies
}

export function resolveRuntimeStringReference(expression, context) {
  if (expression?.type !== 'Reference' || expression.path.length !== 1) {
    return null
  }

  const name = expression.path[0]

  return context.runtimeStrings.has(name) ? name : null
}

export function emitStringExpression(expression, context) {
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

export function emitPreparedStringLengthExpression(expression, context) {
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

export function emitPreparedStringCompareExpression(expression, context) {
  const left = emitPreparedStringBytesOperand(expression.left, context)
  const right = emitPreparedStringBytesOperand(expression.right, context)
  const equals = `(${left.length} == ${right.length} && memcmp(${left.bytes}, ${right.bytes}, ${left.length}) == 0)`

  return {
    lines: [...left.lines, ...right.lines],
    expression: ['===', '=='].includes(expression.operator) ? equals : `(!${equals})`
  }
}

export function emitPreparedStringPredicateCall(expression, context) {
  const value = emitPreparedStringBytesOperand(expression.callee.object, context, 'ccjs_string_method_value')
  const search = emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_string_method_search')
  const helper = cStringPredicateHelperName(expression.callee.property)

  return {
    lines: [...value.lines, ...search.lines],
    expression: `(${helper}(${value.bytes}, ${value.length}, ${search.bytes}, ${search.length}) ? 1 : 0)`
  }
}

export function emitPreparedStringBytesOperand(expression, context, tempPrefix = 'ccjs_cmp_string') {
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
    const value = stringDeps(context).emitCTemplateLiteralValueExpression(expression, context)
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

export function isStringConcatExpression(expression, context) {
  return (
    expression?.type === 'BinaryExpression' &&
    expression.operator === '+' &&
    stringDeps(context).inferExpressionType(expression.left, context) === 'string' &&
    stringDeps(context).inferExpressionType(expression.right, context) === 'string'
  )
}

export function isRuntimeProducedStringExpression(expression, context) {
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

export function isStringConversionCall(expression, context) {
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

export function isStringTrimCall(expression, context) {
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

export function isStringSliceCall(expression, context) {
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

export function isStringSplitCall(expression, context) {
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

export function isStringPredicateCall(expression, context) {
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

function isStringLengthObject(expression, context) {
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

export function isBytesToStringCall(expression, context) {
  return (
    isBinaryRuntimeCall(expression) &&
    expression.binaryRuntimeMethod === 'toString' &&
    stringDeps(context).inferExpressionType(expression.callee.object, context) === 'bytes'
  )
}

export function isCStringRuntimeMethodName(name) {
  return isStringRuntimeMethod(name)
}
