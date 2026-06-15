import { diagnostic } from '../../diagnostics.ts'
import {
  emitPrepareOwnedValueWrite,
  emitRuntimeTypeCheck,
  emitStatusCheck,
  nextCName,
  registerOwnedValue
} from '../context.ts'
import { cStringLiteral, utf8ByteLength } from '../identifiers.ts'
import { emitRuntimeValueCheck } from '../runtime-values.ts'
import { cRuntimeValueTag, isManagedRuntimeReturnType } from '../value-types.ts'
import { cUnsupportedExpressionCode, isNullishCoalescingExpression } from '../syntax.ts'

type PreparedExpression = {
  lines: string[]
  expression: string
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
