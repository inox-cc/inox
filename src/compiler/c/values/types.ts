import { isCJsGlobalRoot, usesCJsGlobal } from '../globals.ts'
import { isOptionalChainExpression } from '../syntax.ts'
import type { CFunctionContext } from '../context.ts'

export type CExpressionTypeDependencies = {
  binaryRuntimeExpressionReturnType: (expression: any) => string | null
  cChildProcessRuntimeMethodName: (expression: any) => string | null
  cDebugRuntimeMethodName: (expression: any) => string | null
  cFetchRuntimeExpressionMethod: (expression: any) => string | null
  cFsRuntimeExpressionMethod: (expression: any) => string | null
  cJsonRuntimeCallName: (callee: any) => string | null
  cOsRuntimeConstantName: (expression: any) => string | null
  cOsRuntimeMethodName: (expression: any) => string | null
  cPathRuntimeConstantName: (expression: any) => string | null
  cPathRuntimeMethodName: (expression: any) => string | null
  cProcessRuntimeEnvName: (expression: any) => string | null
  cProcessRuntimeMethodName: (expression: any) => string | null
  cProcessRuntimePropertyName: (expression: any) => string | null
  cProcessRuntimePropertyValueType: (expression: any) => string | null
  cPromiseRuntimeCallName: (callee: any) => string | null
  cTimeRuntimeCallName: (callee: any) => string | null
  cUrlRuntimeMethodName: (expression: any) => string | null
  collectionConstructorName: (expression: any) => string | null
  cryptoRuntimeMethodName: (expression: any) => string | null
  emitPreparedNetAddressPortExpression: (expression: any, context: CFunctionContext) => any | null
  isArrayLengthExpression: (expression: any, context: CFunctionContext) => boolean
  isBinaryConstructorExpression: (expression: any) => boolean
  isBinaryRuntimeCall: (expression: any) => boolean
  isClassConstructorExpression: (expression: any, context: CFunctionContext) => boolean
  isErrorConstructorExpression: (expression: any) => boolean
  isFetchAbortControllerConstructorExpression: (expression: any) => boolean
  isIndexAccessExpression: (expression: any) => boolean
  isMemberAccessExpression: (expression: any) => boolean
  isNumberConversionCall: (expression: any, context: CFunctionContext) => boolean
  isPromiseConstructorExpression: (expression: any) => boolean
  isStringConversionCall: (expression: any, context: CFunctionContext) => boolean
  isStringPredicateCall: (expression: any, context: CFunctionContext) => boolean
  isStringSliceCall: (expression: any, context: CFunctionContext) => boolean
  isStringSplitCall: (expression: any, context: CFunctionContext) => boolean
  isStringTrimCall: (expression: any, context: CFunctionContext) => boolean
  knownValueType: (valueType: any) => string | null
  mathRuntimeMethodName: (callee: any) => string | null
  resolveKnownArrayIndex: (expression: any, context: CFunctionContext) => any | null
  resolveKnownArrayLength: (expression: any, context: CFunctionContext) => any | null
  resolveKnownObjectIndex: (expression: any, context: CFunctionContext) => any | null
  resolveKnownObjectMember: (expression: any, context: CFunctionContext) => any | null
  resolveNetAddressStringMember: (expression: any, context: CFunctionContext) => string | null
  resolvePromiseExpressionValueType: (expression: any, context: CFunctionContext) => string | null
  resolveRuntimeArrayIndex: (expression: any, context: CFunctionContext) => any | null
}

export function inferExpressionType(
  expression: any,
  context: CFunctionContext,
  deps: CExpressionTypeDependencies
): string {
  const childProcessMethod = deps.cChildProcessRuntimeMethodName(expression)

  if (childProcessMethod != null) {
    return childProcessMethod === 'spawnSync' ? 'object' : 'string'
  }

  if (deps.cOsRuntimeConstantName(expression) != null || deps.cOsRuntimeMethodName(expression) != null) {
    return 'string'
  }

  const processMethod = deps.cProcessRuntimeMethodName(expression)

  if (processMethod != null) {
    return processMethod === 'cwd' ? 'string' : 'void'
  }

  const processProperty = deps.cProcessRuntimePropertyName(expression)

  if (processProperty === 'argv' && expression?.type === 'IndexExpression') {
    return 'string'
  }

  const processPropertyType = deps.cProcessRuntimePropertyValueType(expression)

  if (processPropertyType != null) {
    return processPropertyType
  }

  if (deps.cProcessRuntimeEnvName(expression) != null) {
    return 'string'
  }

  const urlMethod = deps.cUrlRuntimeMethodName(expression)

  if (urlMethod != null) {
    if (
      urlMethod === 'fileURLToPath' ||
      urlMethod === 'URLSearchParams.get' ||
      urlMethod === 'URLSearchParams.toString'
    ) {
      return 'string'
    }

    if (urlMethod === 'URLSearchParams.has') {
      return 'boolean'
    }

    if (
      urlMethod === 'URLSearchParams.append' ||
      urlMethod === 'URLSearchParams.delete' ||
      urlMethod === 'URLSearchParams.set'
    ) {
      return 'void'
    }

    return 'object'
  }

  const pathConstant = deps.cPathRuntimeConstantName(expression)

  if (pathConstant != null) {
    return 'string'
  }

  const pathMethod = deps.cPathRuntimeMethodName(expression)

  if (pathMethod != null) {
    return pathMethod === 'isAbsolute' ? 'boolean' : pathMethod === 'parse' ? 'object' : 'string'
  }

  if (expression?.type === 'CallExpression' && deps.cTimeRuntimeCallName(expression.callee) != null) {
    return 'number'
  }

  if (expression?.type === 'CallExpression' && deps.cFsRuntimeExpressionMethod(expression) != null) {
    return expression.valueType === 'promise' ? 'promise' : (expression.valueType ?? 'unknown')
  }

  if (expression?.type === 'CallExpression' && deps.cFetchRuntimeExpressionMethod(expression) != null) {
    return expression.valueType === 'promise' ? 'promise' : (expression.valueType ?? 'unknown')
  }

  if (expression?.type === 'CallExpression' && deps.cJsonRuntimeCallName(expression.callee) != null) {
    return expression.valueType ?? (deps.cJsonRuntimeCallName(expression.callee) === 'parse' ? 'object' : 'string')
  }

  const cryptoMethod = deps.cryptoRuntimeMethodName(expression)

  if (cryptoMethod === 'createHash' || cryptoMethod === 'Hash.update') {
    return 'crypto-hash'
  }

  if (cryptoMethod === 'createHmac' || cryptoMethod === 'Hmac.update') {
    return 'crypto-hmac'
  }

  if (cryptoMethod === 'Hash.digest' || cryptoMethod === 'Hmac.digest' || cryptoMethod === 'hash') {
    return expression.valueType ?? 'unknown'
  }

  if (cryptoMethod === 'getHashes') {
    return 'array'
  }

  if (cryptoMethod === 'getRandomValues' || cryptoMethod === 'randomBytes' || cryptoMethod === 'randomFillSync') {
    return 'bytes'
  }

  if (cryptoMethod === 'randomInt') {
    return 'number'
  }

  if (cryptoMethod === 'timingSafeEqual') {
    return 'boolean'
  }

  if (cryptoMethod === 'randomUUID') {
    return 'string'
  }

  if (deps.cDebugRuntimeMethodName(expression) === 'memory') {
    return 'object'
  }

  if (
    expression?.type === 'CallExpression' &&
    deps.cPromiseRuntimeCallName(expression.callee) != null &&
    expression.valueType === 'promise'
  ) {
    return 'promise'
  }

  if (deps.isPromiseConstructorExpression(expression)) {
    return 'promise'
  }

  if (expression?.type === 'CallExpression' && deps.mathRuntimeMethodName(expression.callee) != null) {
    return 'number'
  }

  if (deps.isNumberConversionCall(expression, context)) {
    return 'number'
  }

  if (deps.isErrorConstructorExpression(expression)) {
    return 'object'
  }

  if (deps.isFetchAbortControllerConstructorExpression(expression)) {
    return 'object'
  }

  if (expression?.type === 'NewExpression' && deps.collectionConstructorName(expression) === 'Map') {
    return 'map'
  }

  if (expression?.type === 'NewExpression' && deps.collectionConstructorName(expression) === 'Set') {
    return 'set'
  }

  if (deps.isClassConstructorExpression(expression, context)) {
    return 'object'
  }

  if (deps.isStringConversionCall(expression, context)) {
    return 'string'
  }

  if (deps.isStringTrimCall(expression, context)) {
    return 'string'
  }

  if (deps.isStringSliceCall(expression, context)) {
    return 'string'
  }

  if (deps.isStringSplitCall(expression, context)) {
    return 'array'
  }

  if (deps.isStringPredicateCall(expression, context)) {
    return 'boolean'
  }

  if (deps.isBinaryRuntimeCall(expression)) {
    return expression.valueType ?? deps.binaryRuntimeExpressionReturnType(expression) ?? 'bytes'
  }

  if (deps.isBinaryConstructorExpression(expression)) {
    return 'bytes'
  }

  if (expression?.type === 'CallExpression' && usesCJsGlobal(expression.callee, context)) {
    return 'js-global'
  }

  if (expression?.type === 'NewExpression' && usesCJsGlobal(expression.callee, context)) {
    return 'js-global'
  }

  if (expression?.valueType != null && expression.valueType !== 'unknown') {
    return expression.valueType
  }

  if (expression?.type === 'StringLiteral') {
    return 'string'
  }

  if (expression?.type === 'TemplateLiteral') {
    return 'string'
  }

  if (expression?.type === 'Reference') {
    return (
      context.variables.get(expression.path.join('.')) ??
      (context.functionNames.has(expression.path[0])
        ? 'function'
        : isCJsGlobalRoot(expression.path[0], context)
          ? 'js-global'
          : 'number')
    )
  }

  if (expression?.type === 'ArrowFunctionExpression') {
    return 'function'
  }

  if (expression?.type === 'BooleanLiteral') {
    return 'boolean'
  }

  if (expression?.type === 'UnaryExpression') {
    return expression.operator === '!' ? 'boolean' : 'number'
  }

  if (expression?.type === 'UpdateExpression') {
    return 'number'
  }

  if (expression?.type === 'BinaryExpression') {
    if (['===', '!==', '==', '!=', '<', '<=', '>', '>=', '&&', '||'].includes(expression.operator)) {
      return 'boolean'
    }

    if (expression.operator === '??') {
      const left = inferExpressionType(expression.left, context, deps)

      return left === 'null' || left === 'unknown' ? inferExpressionType(expression.right, context, deps) : left
    }

    if (
      expression.operator === '+' &&
      (inferExpressionType(expression.left, context, deps) === 'string' ||
        inferExpressionType(expression.right, context, deps) === 'string')
    ) {
      return 'string'
    }

    return 'number'
  }

  if (expression?.type === 'ArrayLiteral') {
    return 'array'
  }

  if (expression?.type === 'ObjectLiteral') {
    return 'object'
  }

  if (deps.isMemberAccessExpression(expression)) {
    if (deps.emitPreparedNetAddressPortExpression(expression, context) != null) {
      return 'number'
    }

    if (deps.resolveNetAddressStringMember(expression, context) != null) {
      return 'string'
    }

    if (deps.isArrayLengthExpression(expression, context)) {
      return 'number'
    }

    const length = deps.resolveKnownArrayLength(expression, context)

    if (length != null) {
      return 'number'
    }

    const member = deps.resolveKnownObjectMember(expression, context)

    if (member != null) {
      return member.valueType
    }

    return expression.type === 'OptionalMemberExpression' ? 'optional' : 'number'
  }

  if (deps.isIndexAccessExpression(expression)) {
    if (expression.collectionKind === 'map') {
      return expression.valueType ?? 'unknown'
    }

    const element = deps.resolveKnownArrayIndex(expression, context)
    const field = deps.resolveKnownObjectIndex(expression, context)
    const runtimeElement = deps.resolveRuntimeArrayIndex(expression, context)

    if (element != null) {
      return element.valueType
    }

    if (field != null) {
      return field.valueType
    }

    if (runtimeElement != null) {
      return runtimeElement.valueType
    }

    return expression.type === 'OptionalIndexExpression' ? 'optional' : 'number'
  }

  if (expression?.type === 'CallExpression') {
    if (expression.valueType != null && expression.valueType !== 'unknown') {
      return expression.valueType
    }

    if (expression.callee.type === 'Reference') {
      return context.functionReturnTypes.get(expression.callee.path[0]) ?? 'number'
    }

    return 'number'
  }

  if (expression?.type === 'NewExpression') {
    return 'class'
  }

  if (expression?.type === 'AwaitExpression') {
    const valueType =
      deps.knownValueType(expression.valueType) ?? deps.resolvePromiseExpressionValueType(expression.argument, context)

    if (valueType != null) {
      return valueType
    }

    const argumentType = inferExpressionType(expression.argument, context, deps)

    return argumentType === 'promise' ? 'unknown' : argumentType
  }

  if (isOptionalChainExpression(expression)) {
    return 'optional'
  }

  return 'number'
}
