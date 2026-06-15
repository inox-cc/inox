import { diagnostic } from '../../diagnostics.ts'
import {
  emitPrepareOwnedValueWrite,
  emitRuntimeTypeCheck,
  emitStatusCheck,
  nextCName,
  registerOwnedValue,
  withNullableScalarNarrowing
} from '../context.ts'
import { cStringLiteral, utf8ByteLength } from '../identifiers.ts'
import { emitRuntimeValueCheck } from '../runtime-values.ts'
import { cRuntimeValueTag, isManagedRuntimeReturnType } from '../value-types.ts'
import {
  cUnsupportedExpressionCode,
  emitCOperator,
  isNullishCoalescingExpression,
  isOptionalChainExpression
} from '../syntax.ts'
import {
  canLowerCScalarNullishCoalescingExpression,
  isNarrowedNullableScalarReference,
  isNullableRuntimeExpression,
  isNullableScalarRuntimeExpression,
  resolveNullableScalarConditionNarrowing
} from './nullable.ts'

type PreparedExpression = {
  lines: string[]
  expression: string
}

export type CScalarExpressionDependencies = {
  cFsRuntimeConstantExpression: (expression: any) => string | null
  emitCAwaitValueExpression: (expression: any, context: any) => PreparedExpression
  emitCValueExpression: (expression: any, context: any) => PreparedExpression
  emitObjectValueReference: (name: string, context: any) => string
  emitPreparedArrayLengthExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedBinaryNumberCallExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedBytesIndexExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedBytesLengthExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedCallExpression: (expression: any, context: any) => PreparedExpression
  emitPreparedClassMethodCallExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedCollectionCallExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedCollectionSizeExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedCryptoNumberCallExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedDgramAddressPortExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedJsonScalarParseExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedNetAddressPortExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedPathBooleanCallExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedProcessNumberExpression: (expression: any) => PreparedExpression | null
  emitPreparedRuntimeArrayIndexValue: (
    expression: any,
    element: any,
    context: any,
    tempPrefix?: string
  ) => PreparedExpression
  emitPreparedStringCompareExpression: (expression: any, context: any) => PreparedExpression
  emitPreparedStringLengthExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedStringPredicateCall: (expression: any, context: any) => PreparedExpression
  emitPreparedUrlSearchParamsCallExpression: (expression: any, context: any) => (PreparedExpression & { valueType?: string }) | null
  emitReference: (expression: any, context: any) => string
  emitStringExpression: (expression: any, context: any) => string
  inferExpressionType: (expression: any, context: any) => string
  isIndexAccessExpression: (expression: any) => boolean
  isMemberAccessExpression: (expression: any) => boolean
  isStringPredicateCall: (expression: any, context: any) => boolean
  reportCJsGlobalDiagnostic: (diagnostics: any, loc: any) => void
  resolveKnownArrayIndex: (expression: any, context: any) => any | null
  resolveKnownObjectIndex: (expression: any, context: any) => any | null
  resolveKnownObjectMember: (expression: any, context: any) => any | null
  resolveRuntimeArrayIndex: (expression: any, context: any) => any | null
}

export function emitCExpression(expression: any, context: any, deps: CScalarExpressionDependencies): string {
  if (isNullishCoalescingExpression(expression)) {
    context.diagnostics.push(
      diagnostic('CCJS_C_NULLISH', 'nullish coalescing is not supported by the current C backend slice', expression.loc)
    )
    return '0'
  }

  const type = deps.inferExpressionType(expression, context)

  if (type === 'string') {
    return deps.emitStringExpression(expression, context)
  }

  if (type === 'function') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_FUNCTION_VALUE',
        'function values are not supported by the current C backend slice',
        expression?.loc
      )
    )
    return '0'
  }

  if (type === 'timer') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_TIMER_HANDLE',
        'timer handles can only be stored or passed to clear timer functions in the current C backend slice',
        expression?.loc
      )
    )
    return '0'
  }

  if (type === 'crypto-hash') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_CRYPTO_HASH',
        'crypto hash handles can only be stored or used through Hash.update() and Hash.digest() in the current C backend slice',
        expression?.loc
      )
    )
    return '0'
  }

  if (type === 'crypto-hmac') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_CRYPTO_HMAC',
        'crypto hmac handles can only be stored or used through Hmac.update() and Hmac.digest() in the current C backend slice',
        expression?.loc
      )
    )
    return '0'
  }

  if (type === 'optional') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_OPTIONAL_CHAINING',
        'optional chaining is not supported by the current C backend slice',
        expression?.loc
      )
    )
    return '0'
  }

  if (type === 'js-global') {
    deps.reportCJsGlobalDiagnostic(context.diagnostics, expression?.loc)
    return '0'
  }

  return emitPreparedNumberExpression(expression, context, deps).expression
}

export function emitPreparedNumberExpression(
  expression: any,
  context: any,
  deps: CScalarExpressionDependencies
): PreparedExpression {
  const classMethodCall = deps.emitPreparedClassMethodCallExpression(expression, context)

  if (classMethodCall != null && classMethodCall.expression !== '') {
    return classMethodCall
  }

  const fsConstant = deps.cFsRuntimeConstantExpression(expression)

  if (fsConstant != null) {
    return {
      lines: [],
      expression: fsConstant
    }
  }

  if (expression?.bufferRuntimeConstant === 'MAX_LENGTH') {
    return {
      lines: [],
      expression: '((double)((size_t)-1))'
    }
  }

  const pathBooleanCall = deps.emitPreparedPathBooleanCallExpression(expression, context)

  if (pathBooleanCall != null) {
    return pathBooleanCall
  }

  const urlSearchParamsCall = deps.emitPreparedUrlSearchParamsCallExpression(expression, context)

  if (urlSearchParamsCall != null && urlSearchParamsCall.valueType === 'boolean') {
    return urlSearchParamsCall
  }

  const processNumber = deps.emitPreparedProcessNumberExpression(expression)

  if (processNumber != null) {
    return processNumber
  }

  if (expression?.type === 'NumberLiteral') {
    return {
      lines: [],
      expression: expression.value
    }
  }

  if (isNarrowedNullableScalarReference(expression, context)) {
    const name = expression.path[0]
    const valueType = context.variables.get(name)

    return {
      lines: [],
      expression: valueType === 'boolean' ? `(${name}.as.boolean ? 1 : 0)` : `${name}.as.number`
    }
  }

  if (isNullableScalarRuntimeExpression(expression, context)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_NULLISH',
        'nullable scalar values must be narrowed with ?? before scalar use in the current C backend slice',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: '0'
    }
  }

  if (expression?.type === 'Reference') {
    return {
      lines: [],
      expression: deps.emitReference(expression, context)
    }
  }

  if (expression?.type === 'BooleanLiteral') {
    return {
      lines: [],
      expression: expression.value ? '1' : '0'
    }
  }

  if (expression?.type === 'UnaryExpression') {
    const argument = emitPreparedNumberExpression(expression.argument, context, deps)

    return {
      lines: argument.lines,
      expression: `(${expression.operator}${argument.expression})`
    }
  }

  if (expression?.type === 'UpdateExpression') {
    return emitPreparedUpdateExpression(expression, context, deps)
  }

  if (expression?.type === 'BinaryExpression') {
    const scalarNullish = emitPreparedScalarNullishCoalescingExpression(expression, context, deps)

    if (scalarNullish != null) {
      return scalarNullish
    }

    if (isNullishCoalescingExpression(expression)) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_NULLISH',
          'nullish coalescing is not supported by the current C backend slice',
          expression.loc
        )
      )

      return {
        lines: [],
        expression: '0'
      }
    }

    const leftType = deps.inferExpressionType(expression.left, context)
    const rightType = deps.inferExpressionType(expression.right, context)
    const nullableNullCompare = emitPreparedNullableNullCompareExpression(expression, context, deps)

    if (nullableNullCompare != null) {
      return nullableNullCompare
    }

    if (['===', '!==', '==', '!='].includes(expression.operator) && leftType === 'string' && rightType === 'string') {
      return deps.emitPreparedStringCompareExpression(expression, context)
    }

    if (leftType === 'string' || rightType === 'string') {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_STRING_EXPR',
          'string binary expressions are not supported by the current C backend slice',
          expression.loc
        )
      )

      return {
        lines: [],
        expression: '0'
      }
    }

    if (['&&', '||'].includes(expression.operator)) {
      return emitPreparedLogicalExpression(expression, context, deps)
    }

    const left = emitPreparedNumberExpression(expression.left, context, deps)
    const right = emitPreparedNumberExpression(expression.right, context, deps)

    return {
      lines: [...left.lines, ...right.lines],
      expression: `(${left.expression} ${emitCOperator(expression.operator)} ${right.expression})`
    }
  }

  if (expression?.type === 'AssignmentExpression') {
    const value = emitPreparedNumberExpression(expression.value, context, deps)

    return {
      lines: value.lines,
      expression: `(${deps.emitReference(expression.target, context)} = ${value.expression})`
    }
  }

  if (expression?.type === 'CallExpression') {
    const jsonScalarParse = deps.emitPreparedJsonScalarParseExpression(expression, context)

    if (jsonScalarParse != null) {
      return jsonScalarParse
    }

    const binaryCall = deps.emitPreparedBinaryNumberCallExpression(expression, context)

    if (binaryCall != null) {
      return binaryCall
    }

    const cryptoCall = deps.emitPreparedCryptoNumberCallExpression(expression, context)

    if (cryptoCall != null) {
      return cryptoCall
    }

    const numericCast = emitPreparedNumericCastExpression(expression, context, deps)

    if (numericCast != null) {
      return numericCast
    }

    if (deps.isStringPredicateCall(expression, context)) {
      return deps.emitPreparedStringPredicateCall(expression, context)
    }

    const collectionCall = deps.emitPreparedCollectionCallExpression(expression, context)

    if (collectionCall != null) {
      return collectionCall
    }

    return deps.emitPreparedCallExpression(expression, context)
  }

  if (deps.isMemberAccessExpression(expression)) {
    const dgramAddressPort = deps.emitPreparedDgramAddressPortExpression(expression, context)

    if (dgramAddressPort != null) {
      return dgramAddressPort
    }

    const netAddressPort = deps.emitPreparedNetAddressPortExpression(expression, context)

    if (netAddressPort != null) {
      return netAddressPort
    }

    const stringLength = deps.emitPreparedStringLengthExpression(expression, context)

    if (stringLength != null) {
      return stringLength
    }

    const length = deps.emitPreparedArrayLengthExpression(expression, context)

    if (length != null) {
      return length
    }

    const collectionSize = deps.emitPreparedCollectionSizeExpression(expression, context)

    if (collectionSize != null) {
      return collectionSize
    }

    const bytesLength = deps.emitPreparedBytesLengthExpression(expression, context)

    if (bytesLength != null) {
      return bytesLength
    }

    const member = deps.resolveKnownObjectMember(expression, context)

    if (member != null && ['number', 'boolean'].includes(member.valueType)) {
      return emitPreparedRuntimeNumberValue(
        member.valueType,
        (temp) =>
          `ccjs_object_get_known(${deps.emitObjectValueReference(member.objectName, context)}, ${member.index}, &${temp})`,
        context
      )
    }
  }

  if (deps.isIndexAccessExpression(expression)) {
    const element = deps.resolveKnownArrayIndex(expression, context)

    if (element != null && ['number', 'boolean'].includes(element.valueType)) {
      return emitPreparedRuntimeNumberValue(
        element.valueType,
        (temp) => `ccjs_array_get(${element.arrayName}, ${element.index}, &${temp})`,
        context
      )
    }

    const field = deps.resolveKnownObjectIndex(expression, context)

    if (field != null && ['number', 'boolean'].includes(field.valueType)) {
      return emitPreparedRuntimeNumberValue(
        field.valueType,
        (temp) =>
          `ccjs_object_get(${deps.emitObjectValueReference(field.objectName, context)}, ${cStringLiteral(field.key)}, ${utf8ByteLength(field.key)}, &${temp})`,
        context
      )
    }

    const runtimeElement = deps.resolveRuntimeArrayIndex(expression, context)

    if (runtimeElement != null && ['number', 'boolean'].includes(runtimeElement.valueType)) {
      const value = deps.emitPreparedRuntimeArrayIndexValue(expression, runtimeElement, context, 'ccjs_expr_value')

      return {
        lines: value.lines,
        expression:
          runtimeElement.valueType === 'boolean'
            ? `(${value.expression}.as.boolean ? 1 : 0)`
            : `${value.expression}.as.number`
      }
    }

    const bytesIndex = deps.emitPreparedBytesIndexExpression(expression, context)

    if (bytesIndex != null) {
      return bytesIndex
    }
  }

  if (expression?.type === 'AwaitExpression') {
    const valueType = deps.inferExpressionType(expression, context)
    const awaited = deps.emitCAwaitValueExpression(expression, context)

    return {
      lines: awaited.lines,
      expression:
        valueType === 'boolean' ? `(${awaited.expression}.as.boolean ? 1 : 0)` : `${awaited.expression}.as.number`
    }
  }

  if (isOptionalChainExpression(expression)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_OPTIONAL_CHAINING',
        'optional chaining is not supported by the current C backend slice',
        expression?.loc
      )
    )
    return {
      lines: [],
      expression: '0'
    }
  }

  context.diagnostics.push(
    diagnostic('CCJS_C_NUMBER_EXPR', 'this number expression is not supported by the current C backend slice')
  )

  return {
    lines: [],
    expression: '0'
  }
}

function emitPreparedLogicalExpression(
  expression: any,
  context: any,
  deps: CScalarExpressionDependencies
): PreparedExpression {
  const left = emitPreparedNumberExpression(expression.left, context, deps)
  const leftNarrowing = resolveNullableScalarConditionNarrowing(expression.left, context)
  const rightNarrowed = expression.operator === '&&' ? leftNarrowing.trueNames : leftNarrowing.falseNames
  const right = withNullableScalarNarrowing(context, rightNarrowed, () =>
    emitPreparedNumberExpression(expression.right, context, deps)
  )
  const temp = nextCName(context, 'ccjs_logical')

  if (expression.operator === '&&') {
    return {
      lines: [
        ...left.lines,
        `double ${temp} = 0;`,
        `if ${emitCConditionClause(left.expression)} {`,
        ...right.lines.map((line) => `  ${line}`),
        `  ${temp} = ${right.expression};`,
        '}'
      ],
      expression: temp
    }
  }

  return {
    lines: [
      ...left.lines,
      `double ${temp} = 0;`,
      `if ${emitCConditionClause(left.expression)} {`,
      `  ${temp} = 1;`,
      '} else {',
      ...right.lines.map((line) => `  ${line}`),
      `  ${temp} = ${right.expression};`,
      '}'
    ],
    expression: temp
  }
}

function emitPreparedScalarNullishCoalescingExpression(
  expression: any,
  context: any,
  deps: CScalarExpressionDependencies
): PreparedExpression | null {
  if (!canLowerCScalarNullishCoalescingExpression(expression, context)) {
    return null
  }

  const valueType = deps.inferExpressionType(expression, context)
  const expectedTag = cRuntimeValueTag(valueType)
  const left = deps.emitCValueExpression(expression.left, context)
  const right = emitPreparedNumberExpression(expression.right, context, deps)
  const temp = nextCName(context, 'ccjs_nullable_scalar')
  const leftValue = valueType === 'boolean' ? `(${left.expression}.as.boolean ? 1 : 0)` : `${left.expression}.as.number`

  return {
    lines: [
      ...left.lines,
      `double ${temp} = 0;`,
      `if (${left.expression}.tag == CCJS_TAG_NULL) {`,
      ...right.lines.map((line) => `  ${line}`),
      `  ${temp} = ${right.expression};`,
      '} else {',
      `  ${emitRuntimeTypeCheck(`${left.expression}.tag != ${expectedTag}`, context)}`,
      `  ${temp} = ${leftValue};`,
      '}'
    ],
    expression: temp
  }
}

function emitPreparedNullableNullCompareExpression(
  expression: any,
  context: any,
  deps: CScalarExpressionDependencies
): PreparedExpression | null {
  if (!['===', '!==', '==', '!='].includes(expression.operator)) {
    return null
  }

  const nullable = expression.left?.type === 'NullLiteral' ? expression.right : expression.left
  const maybeNull = expression.left?.type === 'NullLiteral' ? expression.left : expression.right

  if (maybeNull?.type !== 'NullLiteral' || !isNullableRuntimeExpression(nullable, context)) {
    return null
  }

  const value = deps.emitCValueExpression(nullable, context)
  const equals = `(${value.expression}.tag == CCJS_TAG_NULL)`

  return {
    lines: value.lines,
    expression: ['===', '=='].includes(expression.operator) ? equals : `(!${equals})`
  }
}

function emitPreparedNumericCastExpression(
  expression: any,
  context: any,
  deps: CScalarExpressionDependencies
): PreparedExpression | null {
  if (!isNumericCastCall(expression, context, deps)) {
    return null
  }

  const cast = expression.callee.path[0]
  const value = emitPreparedNumberExpression(expression.args[0], context, deps)

  if (cast === 'f64') {
    return value
  }

  if (cast === 'f32') {
    const result = nextCName(context, 'ccjs_f32')

    return {
      lines: [...value.lines, `double ${result} = (double)((float)${value.expression});`],
      expression: result
    }
  }

  const limits = numericIntegerCastLimits(cast)

  if (limits == null) {
    return null
  }

  const raw = nextCName(context, `ccjs_${cast}_value`)
  const truncated = nextCName(context, `ccjs_${cast}_truncated`)
  const result = nextCName(context, `ccjs_${cast}`)

  return {
    lines: [
      ...value.lines,
      `double ${raw} = ${value.expression};`,
      emitRuntimeTypeCheck(`${raw} != ${raw} || (${raw} - ${raw}) != 0`, context),
      emitRuntimeTypeCheck(`${raw} <= ${limits.preMin} || ${raw} >= ${limits.preMax}`, context),
      `long long ${truncated} = (long long)${raw};`,
      emitRuntimeTypeCheck(`${truncated} < ${limits.min}LL || ${truncated} > ${limits.max}LL`, context),
      `double ${result} = (double)${truncated};`
    ],
    expression: result
  }
}

function isNumericCastCall(expression: any, context: any, deps: CScalarExpressionDependencies): boolean {
  if (
    expression?.type !== 'CallExpression' ||
    expression.callee.type !== 'Reference' ||
    expression.callee.path.length !== 1 ||
    !['i32', 'u32', 'u64', 'f32', 'f64'].includes(expression.callee.path[0]) ||
    expression.args.length !== 1
  ) {
    return false
  }

  return deps.inferExpressionType(expression.args[0], context) === 'number'
}

function numericIntegerCastLimits(cast: string): { preMin: string; preMax: string; min: string; max: string } | null {
  if (cast === 'i32') {
    return {
      preMin: '-2147483649.0',
      preMax: '2147483648.0',
      min: '-2147483648',
      max: '2147483647'
    }
  }

  if (cast === 'u32') {
    return {
      preMin: '-1.0',
      preMax: '4294967296.0',
      min: '0',
      max: '4294967295'
    }
  }

  if (cast === 'u64') {
    return {
      preMin: '-1.0',
      preMax: '9007199254740992.0',
      min: '0',
      max: '9007199254740991'
    }
  }

  return null
}

export function emitPreparedUpdateExpression(
  expression: any,
  context: any,
  deps: CScalarExpressionDependencies
): PreparedExpression {
  const reference = deps.emitReference(expression.argument, context)
  const operator = expression.operator === '--' ? '--' : '++'

  if (expression.prefix !== false) {
    return {
      lines: [],
      expression: `(${operator}${reference})`
    }
  }

  const previous = nextCName(context, 'ccjs_update_previous')

  return {
    lines: [`double ${previous} = ${reference};`, `${reference}${operator};`],
    expression: previous
  }
}

function emitPreparedRuntimeNumberValue(
  valueType: string,
  emitGetCall: (temp: string) => string,
  context: any
): PreparedExpression {
  const value = nextCName(context, 'ccjs_expr_value')
  registerOwnedValue(context, value)

  return {
    lines: [...emitPrepareOwnedValueWrite(value), emitStatusCheck(emitGetCall(value), context)],
    expression: valueType === 'boolean' ? `(${value}.as.boolean ? 1 : 0)` : `${value}.as.number`
  }
}

export type CValueExpressionDependencies = {
  emitCArrayLiteralValueExpression: (expression: any, context: any) => PreparedExpression
  emitCAwaitValueExpression: (expression: any, context: any) => PreparedExpression
  emitCClassObjectValueExpression: (expression: any, context: any) => PreparedExpression
  emitCErrorObjectValueExpression: (expression: any, context: any) => PreparedExpression
  emitCNullishCoalescingValueExpression: (expression: any, context: any) => PreparedExpression
  emitCNumberConversionValueExpression: (expression: any, context: any) => PreparedExpression | null
  emitCObjectLiteralValueExpression: (expression: any, context: any) => PreparedExpression
  emitCOptionalIndexValueExpression: (expression: any, context: any) => PreparedExpression
  emitCOptionalMemberValueExpression: (expression: any, context: any) => PreparedExpression
  emitCStringConcatValueExpression: (expression: any, context: any) => PreparedExpression
  emitCStringConversionValueExpression: (expression: any, context: any) => PreparedExpression
  emitCStringSliceValueExpression: (expression: any, context: any) => PreparedExpression
  emitCStringSplitValueExpression: (expression: any, context: any) => PreparedExpression
  emitCStringTrimValueExpression: (expression: any, context: any) => PreparedExpression
  emitCTemplateLiteralValueExpression: (expression: any, context: any) => PreparedExpression
  emitOptionalRuntimeCallbackCallValueExpression: (expression: any, context: any) => PreparedExpression
  emitPreparedArrayPopCallExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedBinaryValueExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedCallExpression: (expression: any, context: any) => PreparedExpression
  emitPreparedChildProcessCallExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedClassMethodCallExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedCollectionCallExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedCryptoCallExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedDebugMemoryCallExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedFetchHeadersCallExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedFsSyncValueExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedJsonCallExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedKnownArrayIndexValueExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedKnownObjectIndexValueExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedKnownObjectMemberValueExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedMapIndexGetExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedNullableScalarRuntimeValueExpression: (expression: any, context: any) => PreparedExpression
  emitPreparedOsConstantExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedOsStringCallExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedPathConstantExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedPathObjectCallExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedPathStringCallExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedProcessStringExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedRuntimeArrayIndexValueExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedUrlObjectExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedUrlSearchParamsCallExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedUrlSearchParamsObjectExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedUrlStringCallExpression: (expression: any, context: any) => PreparedExpression | null
  inferExpressionType: (expression: any, context: any) => string
  isBoxedRuntimeValueName: (name: string, context: any) => boolean
  isClassConstructorExpression: (expression: any, context: any) => boolean
  isErrorConstructorExpression: (expression: any) => boolean
  isIndexAccessExpression: (expression: any) => boolean
  isMemberAccessExpression: (expression: any) => boolean
  isNullableRuntimeExpression: (expression: any, context: any) => boolean
  isNullableScalarRuntimeExpression: (expression: any, context: any) => boolean
  isStringConcatExpression: (expression: any, context: any) => boolean
  isStringConversionCall: (expression: any, context: any) => boolean
  isStringSliceCall: (expression: any, context: any) => boolean
  isStringSplitCall: (expression: any, context: any) => boolean
  isStringTrimCall: (expression: any, context: any) => boolean
}

export function emitCValueExpression(
  expression: any,
  context: any,
  deps: CValueExpressionDependencies
): PreparedExpression {
  if (isNullishCoalescingExpression(expression)) {
    return deps.emitCNullishCoalescingValueExpression(expression, context)
  }

  if (expression?.type === 'AwaitExpression') {
    return deps.emitCAwaitValueExpression(expression, context)
  }

  const childProcessCall = deps.emitPreparedChildProcessCallExpression(expression, context)

  if (childProcessCall != null) {
    return childProcessCall
  }

  const osConstant = deps.emitPreparedOsConstantExpression(expression, context)

  if (osConstant != null) {
    return osConstant
  }

  const osStringCall = deps.emitPreparedOsStringCallExpression(expression, context)

  if (osStringCall != null) {
    return osStringCall
  }

  const processString = deps.emitPreparedProcessStringExpression(expression, context)

  if (processString != null) {
    return processString
  }

  const urlStringCall = deps.emitPreparedUrlStringCallExpression(expression, context)

  if (urlStringCall != null) {
    return urlStringCall
  }

  const urlObject = deps.emitPreparedUrlObjectExpression(expression, context)

  if (urlObject != null) {
    return urlObject
  }

  const urlSearchParamsObject = deps.emitPreparedUrlSearchParamsObjectExpression(expression, context)

  if (urlSearchParamsObject != null) {
    return urlSearchParamsObject
  }

  const pathConstant = deps.emitPreparedPathConstantExpression(expression, context)

  if (pathConstant != null) {
    return pathConstant
  }

  const pathObject = deps.emitPreparedPathObjectCallExpression(expression, context)

  if (pathObject != null) {
    return pathObject
  }

  const pathCall = deps.emitPreparedPathStringCallExpression(expression, context)

  if (pathCall != null) {
    return pathCall
  }

  const fsSyncValue = deps.emitPreparedFsSyncValueExpression(expression, context)

  if (fsSyncValue != null) {
    return fsSyncValue
  }

  const fetchHeadersCall = deps.emitPreparedFetchHeadersCallExpression(expression, context)

  if (fetchHeadersCall != null) {
    return fetchHeadersCall
  }

  const urlSearchParamsCall = deps.emitPreparedUrlSearchParamsCallExpression(expression, context)

  if (urlSearchParamsCall != null) {
    return urlSearchParamsCall
  }

  const jsonCall = deps.emitPreparedJsonCallExpression(expression, context)

  if (jsonCall != null) {
    return jsonCall
  }

  const debugMemoryCall = deps.emitPreparedDebugMemoryCallExpression(expression, context)

  if (debugMemoryCall != null) {
    return debugMemoryCall
  }

  const cryptoCall = deps.emitPreparedCryptoCallExpression(expression, context)

  if (cryptoCall != null) {
    return cryptoCall
  }

  const binaryValue = deps.emitPreparedBinaryValueExpression(expression, context)

  if (binaryValue != null) {
    return binaryValue
  }

  const arrayPopCall = deps.emitPreparedArrayPopCallExpression(expression, context)

  if (arrayPopCall != null) {
    return arrayPopCall
  }

  const mapIndexGet = deps.emitPreparedMapIndexGetExpression(expression, context)

  if (mapIndexGet != null) {
    return mapIndexGet
  }

  if (deps.isErrorConstructorExpression(expression)) {
    return deps.emitCErrorObjectValueExpression(expression, context)
  }

  if (deps.isClassConstructorExpression(expression, context)) {
    return deps.emitCClassObjectValueExpression(expression, context)
  }

  if (expression?.type === 'OptionalCallExpression' && deps.isNullableRuntimeExpression(expression, context)) {
    return deps.emitOptionalRuntimeCallbackCallValueExpression(expression, context)
  }

  const numberConversion = deps.emitCNumberConversionValueExpression(expression, context)

  if (numberConversion != null) {
    return numberConversion
  }

  if (deps.isNullableScalarRuntimeExpression(expression, context)) {
    return deps.emitPreparedNullableScalarRuntimeValueExpression(expression, context)
  }

  if (deps.isStringConversionCall(expression, context)) {
    return deps.emitCStringConversionValueExpression(expression, context)
  }

  if (deps.isStringTrimCall(expression, context)) {
    return deps.emitCStringTrimValueExpression(expression, context)
  }

  if (deps.isStringSliceCall(expression, context)) {
    return deps.emitCStringSliceValueExpression(expression, context)
  }

  if (deps.isStringSplitCall(expression, context)) {
    return deps.emitCStringSplitValueExpression(expression, context)
  }

  if (deps.isStringConcatExpression(expression, context)) {
    return deps.emitCStringConcatValueExpression(expression, context)
  }

  if (expression?.type === 'TemplateLiteral') {
    return deps.emitCTemplateLiteralValueExpression(expression, context)
  }

  if (expression?.type === 'ArrayLiteral') {
    return deps.emitCArrayLiteralValueExpression(expression, context)
  }

  if (expression?.type === 'ObjectLiteral') {
    return deps.emitCObjectLiteralValueExpression(expression, context)
  }

  if (expression?.type === 'StringLiteral') {
    const temp = nextCName(context, 'ccjs_value')
    registerOwnedValue(context, temp)

    return {
      lines: [
        ...emitPrepareOwnedValueWrite(temp),
        emitStatusCheck(
          `ccjs_string_from_literal(&ccjs_default_allocator, ${cStringLiteral(expression.value)}, ${utf8ByteLength(expression.value)}, &${temp})`,
          context
        )
      ],
      expression: temp
    }
  }

  if (expression?.type === 'NumberLiteral') {
    return {
      lines: [],
      expression: `ccjs_number_value(${expression.value})`
    }
  }

  if (expression?.type === 'BooleanLiteral') {
    return {
      lines: [],
      expression: `ccjs_bool_value(${expression.value ? 'true' : 'false'})`
    }
  }

  if (expression?.type === 'NullLiteral') {
    return {
      lines: [],
      expression: 'ccjs_null_value()'
    }
  }

  if (expression?.type === 'Reference') {
    const name = expression.path.join('_')
    const type = context.variables.get(name)

    if (context.nullableVariables.has(name)) {
      return {
        lines: [],
        expression: name
      }
    }

    if (deps.isBoxedRuntimeValueName(name, context)) {
      const tag = type === 'string' ? 'CCJS_TAG_STRING' : 'CCJS_TAG_OBJECT'

      return {
        lines: [emitRuntimeTypeCheck(`(*${name}).tag != ${tag} || (*${name}).as.ref == 0`, context)],
        expression: `(*${name})`
      }
    }

    if (type === 'string' && context.runtimeStrings.has(name)) {
      const temp = nextCName(context, 'ccjs_value')

      return {
        lines: [
          `ccjs_value ${temp};`,
          `${temp}.tag = CCJS_TAG_STRING;`,
          `${temp}.as.ref = (ccjs_ref*)&${name}->header;`
        ],
        expression: temp
      }
    }

    if (type === 'bytes' || type === 'object' || type === 'array') {
      return {
        lines: [],
        expression: name
      }
    }

    if (type === 'map' || type === 'set') {
      return {
        lines: [],
        expression: name
      }
    }

    if (type === 'number') {
      return {
        lines: [],
        expression: `ccjs_number_value(${name})`
      }
    }

    if (type === 'boolean') {
      return {
        lines: [],
        expression: `ccjs_bool_value(${name})`
      }
    }
  }

  if (expression?.type === 'OptionalMemberExpression') {
    return deps.emitCOptionalMemberValueExpression(expression, context)
  }

  if (expression?.type === 'OptionalIndexExpression') {
    return deps.emitCOptionalIndexValueExpression(expression, context)
  }

  if (deps.isMemberAccessExpression(expression)) {
    const memberValue = deps.emitPreparedKnownObjectMemberValueExpression(expression, context)

    if (memberValue != null) {
      return memberValue
    }
  }

  if (deps.isIndexAccessExpression(expression)) {
    const arrayValue = deps.emitPreparedKnownArrayIndexValueExpression(expression, context)

    if (arrayValue != null) {
      return arrayValue
    }

    const runtimeArrayValue = deps.emitPreparedRuntimeArrayIndexValueExpression(expression, context)

    if (runtimeArrayValue != null) {
      return runtimeArrayValue
    }

    const objectValue = deps.emitPreparedKnownObjectIndexValueExpression(expression, context)

    if (objectValue != null) {
      return objectValue
    }
  }

  if (expression?.type === 'CallExpression' && isManagedRuntimeReturnType(deps.inferExpressionType(expression, context))) {
    const valueType = deps.inferExpressionType(expression, context)
    const collectionCall = deps.emitPreparedCollectionCallExpression(expression, context)

    if (collectionCall != null) {
      return collectionCall
    }

    const classMethodCall = deps.emitPreparedClassMethodCallExpression(expression, context)

    if (classMethodCall != null) {
      return classMethodCall
    }

    const temp = nextCName(context, 'ccjs_value')
    const tag = cRuntimeValueTag(valueType)
    registerOwnedValue(context, temp)
    const call = deps.emitPreparedCallExpression(expression, context)

    return {
      lines: [
        ...call.lines,
        ...emitPrepareOwnedValueWrite(temp),
        `${temp} = ${call.expression};`,
        emitRuntimeValueCheck(temp, tag, context)
      ],
      expression: temp
    }
  }

  const unsupportedType = deps.inferExpressionType(expression, context)
  context.diagnostics.push(
    diagnostic(
      cUnsupportedExpressionCode(unsupportedType),
      unsupportedType === 'function'
        ? 'stored callback values need delayed closure lifetime support and are not supported by the current C backend slice'
        : 'this object field expression is not supported by the current C backend slice',
      expression?.loc
    )
  )

  return {
    lines: [],
    expression: 'ccjs_undefined_value()'
  }
}

export function emitCConditionClause(expression: string): string {
  const trimmed = expression.trim()

  return isWrappedCExpression(trimmed) ? trimmed : `(${trimmed})`
}

export function emitCNegatedConditionClause(expression: string): string {
  return `(!${emitCConditionClause(expression)})`
}

function isWrappedCExpression(expression: string): boolean {
  if (!expression.startsWith('(') || !expression.endsWith(')')) {
    return false
  }

  let depth = 0

  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index]

    if (char === '(') {
      depth += 1
    } else if (char === ')') {
      depth -= 1

      if (depth === 0 && index < expression.length - 1) {
        return false
      }
    }

    if (depth < 0) {
      return false
    }
  }

  return depth === 0
}
