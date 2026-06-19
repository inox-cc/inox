import { isCJsGlobalRoot, usesCJsGlobal } from '../globals.ts'
import { isOptionalChainExpression } from '../syntax.ts'
import type { CFunctionContext } from '../context.ts'
import type { AnyNode } from '../../types.ts'
import type {
  CKnownArrayElement,
  CKnownObjectField,
  CKnownObjectIndexField,
  CPreparedExpression,
  CRuntimeArrayElement
} from '../types.ts'
import { isPresent } from '../../nullish.ts'

export type CExpressionTypeDependencies = {
  binaryRuntimeExpressionReturnType: (expression: AnyNode) => string | null
  cChildProcessRuntimeMethodName: (expression: AnyNode) => string | null
  cDebugRuntimeMethodName: (expression: AnyNode) => string | null
  cFetchRuntimeExpressionMethod: (expression: AnyNode) => string | null
  cFsRuntimeExpressionMethod: (expression: AnyNode) => string | null
  cJsonRuntimeCallName: (callee: AnyNode) => string | null
  cOsRuntimeConstantName: (expression: AnyNode) => string | null
  cOsRuntimeMethodName: (expression: AnyNode) => string | null
  cPathRuntimeConstantName: (expression: AnyNode) => string | null
  cPathRuntimeMethodName: (expression: AnyNode) => string | null
  cProcessRuntimeEnvName: (expression: AnyNode) => string | null
  cProcessRuntimeMethodName: (expression: AnyNode) => string | null
  cProcessRuntimePropertyName: (expression: AnyNode) => string | null
  cProcessRuntimePropertyValueType: (expression: AnyNode) => string | null
  cPromiseRuntimeCallName: (callee: AnyNode) => string | null
  cTimeRuntimeCallName: (callee: AnyNode) => string | null
  cUrlRuntimeMethodName: (expression: AnyNode) => string | null
  collectionConstructorName: (expression: AnyNode) => string | null
  cryptoRuntimeMethodName: (expression: AnyNode) => string | null
  isArrayIsArrayCall: (expression: AnyNode) => boolean
  emitPreparedNetAddressPortExpression: (expression: AnyNode, context: CFunctionContext) => CPreparedExpression | null
  isArrayJoinCall: (expression: AnyNode, context: CFunctionContext) => boolean
  isArrayLengthExpression: (expression: AnyNode, context: CFunctionContext) => boolean
  isBinaryConstructorExpression: (expression: AnyNode) => boolean
  isBinaryRuntimeCall: (expression: AnyNode) => boolean
  isClassConstructorExpression: (expression: AnyNode, context: CFunctionContext) => boolean
  isErrorConstructorExpression: (expression: AnyNode) => boolean
  isFetchAbortControllerConstructorExpression: (expression: AnyNode) => boolean
  isIndexAccessExpression: (expression: AnyNode) => boolean
  isMemberAccessExpression: (expression: AnyNode) => boolean
  isNumberConversionCall: (expression: AnyNode, context: CFunctionContext) => boolean
  isNumberToStringCall: (expression: AnyNode, context: CFunctionContext) => boolean
  isPromiseConstructorExpression: (expression: AnyNode) => boolean
  isPromiseReturningFunctionCallee: (callee: AnyNode, context: CFunctionContext) => boolean
  isStringCaseCall: (expression: AnyNode, context: CFunctionContext) => boolean
  isStringConversionCall: (expression: AnyNode, context: CFunctionContext) => boolean
  isStringPadStartCall: (expression: AnyNode, context: CFunctionContext) => boolean
  isStringPredicateCall: (expression: AnyNode, context: CFunctionContext) => boolean
  isStringSliceCall: (expression: AnyNode, context: CFunctionContext) => boolean
  isStringSplitCall: (expression: AnyNode, context: CFunctionContext) => boolean
  isStringTrimCall: (expression: AnyNode, context: CFunctionContext) => boolean
  knownValueType: (valueType: string | null | undefined) => string | null
  mathRuntimeMethodName: (callee: AnyNode) => string | null
  resolveKnownArrayIndex: (expression: AnyNode, context: CFunctionContext) => CKnownArrayElement | null
  resolveKnownArrayLength: (expression: AnyNode, context: CFunctionContext) => string | null
  resolveKnownObjectIndex: (expression: AnyNode, context: CFunctionContext) => CKnownObjectIndexField | null
  resolveKnownObjectMember: (expression: AnyNode, context: CFunctionContext) => CKnownObjectField | null
  resolveNetAddressStringMember: (expression: AnyNode, context: CFunctionContext) => string | null
  resolvePromiseExpressionValueType: (expression: AnyNode, context: CFunctionContext) => string | null
  resolveRuntimeArrayIndex: (expression: AnyNode, context: CFunctionContext) => CRuntimeArrayElement | null
}

function cValueTypeOrUnknown(expression: AnyNode): string {
  if (expression.valueType !== null && typeof expression.valueType !== 'undefined') {
    return expression.valueType
  }

  return 'unknown'
}

function cStringAt(values: string[], index: number): string {
  return values[index]
}

function cDottedPath(path: string[]): string {
  let output = ''

  for (let index = 0; index < path.length; index = index + 1) {
    if (index === 0) {
      output = cStringAt(path, index)
    } else {
      output = `${output}.${cStringAt(path, index)}`
    }
  }

  return output
}

function isBooleanBinaryOperator(operator: string): boolean {
  if (operator === '===') {
    return true
  }

  if (operator === '!==') {
    return true
  }

  if (operator === '==') {
    return true
  }

  if (operator === '!=') {
    return true
  }

  if (operator === '<') {
    return true
  }

  if (operator === '<=') {
    return true
  }

  if (operator === '>') {
    return true
  }

  if (operator === '>=') {
    return true
  }

  if (operator === '&&') {
    return true
  }

  return operator === '||'
}

function cReferenceExpressionType(expression: AnyNode, context: CFunctionContext): string {
  const variableType = context.variables.get(cDottedPath(expression.path))
  const name = cStringAt(expression.path, 0)
  let metadataType: string | null = null

  if (
    expression.valueType !== null &&
    typeof expression.valueType !== 'undefined' &&
    expression.valueType !== 'unknown'
  ) {
    metadataType = expression.valueType
  }

  const moduleValueType = context.moduleValueTypes.get(name)

  if (moduleValueType !== null && typeof moduleValueType !== 'undefined') {
    return moduleValueType
  }

  if (
    metadataType !== null &&
    typeof metadataType !== 'undefined' &&
    (variableType === null ||
      typeof variableType === 'undefined' ||
      (variableType === 'number' && metadataType !== 'number'))
  ) {
    return metadataType
  }

  if (variableType !== null && typeof variableType !== 'undefined') {
    return variableType
  }

  if (context.functionNames.has(name)) {
    return 'function'
  }

  if (isCJsGlobalRoot(name, context)) {
    return 'js-global'
  }

  if (metadataType !== null && typeof metadataType !== 'undefined') {
    return metadataType
  }

  return 'number'
}

export function inferExpressionType(
  expression: AnyNode,
  context: CFunctionContext,
  deps: CExpressionTypeDependencies
): string {
  const childProcessMethod = deps.cChildProcessRuntimeMethodName(expression)

  if (childProcessMethod !== null && typeof childProcessMethod !== 'undefined') {
    if (childProcessMethod === 'spawnSync') {
      return 'object'
    }

    return 'string'
  }

  if (isPresent(deps.cOsRuntimeConstantName(expression)) || isPresent(deps.cOsRuntimeMethodName(expression))) {
    return 'string'
  }

  const processMethod = deps.cProcessRuntimeMethodName(expression)

  if (processMethod !== null && typeof processMethod !== 'undefined') {
    if (processMethod === 'cwd') {
      return 'string'
    }

    return 'void'
  }

  const processProperty = deps.cProcessRuntimePropertyName(expression)

  if (processProperty === 'argv' && expression.type === 'IndexExpression') {
    return 'string'
  }

  const processPropertyType = deps.cProcessRuntimePropertyValueType(expression)

  if (processPropertyType !== null && typeof processPropertyType !== 'undefined') {
    return processPropertyType
  }

  if (isPresent(deps.cProcessRuntimeEnvName(expression))) {
    return 'string'
  }

  const urlMethod = deps.cUrlRuntimeMethodName(expression)

  if (urlMethod !== null && typeof urlMethod !== 'undefined') {
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

  if (pathConstant !== null && typeof pathConstant !== 'undefined') {
    return 'string'
  }

  const pathMethod = deps.cPathRuntimeMethodName(expression)

  if (pathMethod !== null && typeof pathMethod !== 'undefined') {
    if (pathMethod === 'isAbsolute') {
      return 'boolean'
    }

    if (pathMethod === 'parse') {
      return 'object'
    }

    return 'string'
  }

  if (expression.type === 'CallExpression' && isPresent(deps.cTimeRuntimeCallName(expression.callee))) {
    return 'number'
  }

  if (expression.type === 'CallExpression' && isPresent(deps.cFsRuntimeExpressionMethod(expression))) {
    if (expression.valueType === 'promise') {
      return 'promise'
    }

    return cValueTypeOrUnknown(expression)
  }

  if (expression.type === 'CallExpression' && isPresent(deps.cFetchRuntimeExpressionMethod(expression))) {
    if (expression.valueType === 'promise') {
      return 'promise'
    }

    return cValueTypeOrUnknown(expression)
  }

  if (expression.type === 'CallExpression') {
    const jsonCall = deps.cJsonRuntimeCallName(expression.callee)

    if (jsonCall !== null && typeof jsonCall !== 'undefined') {
      if (expression.valueType !== null && typeof expression.valueType !== 'undefined') {
        return expression.valueType
      }

      if (jsonCall === 'parse') {
        return 'object'
      }

      return 'string'
    }
  }

  const cryptoMethod = deps.cryptoRuntimeMethodName(expression)

  if (cryptoMethod === 'createHash' || cryptoMethod === 'Hash.update') {
    return 'crypto-hash'
  }

  if (cryptoMethod === 'createHmac' || cryptoMethod === 'Hmac.update') {
    return 'crypto-hmac'
  }

  if (cryptoMethod === 'Hash.digest' || cryptoMethod === 'Hmac.digest' || cryptoMethod === 'hash') {
    return cValueTypeOrUnknown(expression)
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
    expression.type === 'CallExpression' &&
    isPresent(deps.cPromiseRuntimeCallName(expression.callee)) &&
    expression.valueType === 'promise'
  ) {
    return 'promise'
  }

  if (deps.isPromiseConstructorExpression(expression)) {
    return 'promise'
  }

  if (expression.type === 'CallExpression' && deps.isPromiseReturningFunctionCallee(expression.callee, context)) {
    return 'promise'
  }

  if (expression.type === 'CallExpression' && isPresent(deps.mathRuntimeMethodName(expression.callee))) {
    return 'number'
  }

  if (expression.type === 'CallExpression') {
    const objectFunctionFieldReturnType = cObjectFunctionFieldCallReturnType(expression, context, deps)

    if (objectFunctionFieldReturnType !== null && typeof objectFunctionFieldReturnType !== 'undefined') {
      return objectFunctionFieldReturnType
    }
  }

  if (deps.isArrayIsArrayCall(expression)) {
    return 'boolean'
  }

  if (deps.isArrayJoinCall(expression, context)) {
    return 'string'
  }

  if (deps.isNumberConversionCall(expression, context)) {
    return 'number'
  }

  if (deps.isNumberToStringCall(expression, context)) {
    return 'string'
  }

  if (deps.isErrorConstructorExpression(expression)) {
    return 'object'
  }

  if (deps.isFetchAbortControllerConstructorExpression(expression)) {
    return 'object'
  }

  if (expression.type === 'NewExpression' && deps.collectionConstructorName(expression) === 'Map') {
    return 'map'
  }

  if (expression.type === 'NewExpression' && deps.collectionConstructorName(expression) === 'Set') {
    return 'set'
  }

  if (deps.isClassConstructorExpression(expression, context)) {
    return 'object'
  }

  if (deps.isStringConversionCall(expression, context)) {
    return 'string'
  }

  if (deps.isStringCaseCall(expression, context)) {
    return 'string'
  }

  if (deps.isStringPadStartCall(expression, context)) {
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
    if (expression.valueType !== null && typeof expression.valueType !== 'undefined') {
      return expression.valueType
    }

    const binaryReturnType = deps.binaryRuntimeExpressionReturnType(expression)

    if (binaryReturnType !== null && typeof binaryReturnType !== 'undefined') {
      return binaryReturnType
    }

    return 'bytes'
  }

  if (deps.isBinaryConstructorExpression(expression)) {
    return 'bytes'
  }

  if (
    expression.type === 'CallExpression' &&
    expression.objectRuntimeMethod !== null &&
    typeof expression.objectRuntimeMethod !== 'undefined'
  ) {
    return cValueTypeOrUnknown(expression)
  }

  if (expression.type === 'CallExpression' && usesCJsGlobal(expression.callee, context)) {
    return 'js-global'
  }

  if (expression.type === 'NewExpression' && usesCJsGlobal(expression.callee, context)) {
    return 'js-global'
  }

  if (expression.type === 'AwaitExpression') {
    let valueType = deps.knownValueType(expression.valueType)

    if (valueType === 'promise') {
      valueType = null
    }

    if (valueType === null || typeof valueType === 'undefined') {
      valueType = deps.resolvePromiseExpressionValueType(expression.argument, context)
    }

    if (valueType !== null && typeof valueType !== 'undefined') {
      return valueType
    }

    const argumentType = inferExpressionType(expression.argument, context, deps)

    if (argumentType === 'promise') {
      return 'unknown'
    }

    return argumentType
  }

  if (expression.type === 'StringLiteral') {
    return 'string'
  }

  if (expression.type === 'TemplateLiteral') {
    return 'string'
  }

  if (expression.type === 'Reference') {
    return cReferenceExpressionType(expression, context)
  }

  if (
    expression.valueType !== null &&
    typeof expression.valueType !== 'undefined' &&
    expression.valueType !== 'unknown'
  ) {
    return expression.valueType
  }

  if (expression.type === 'ArrowFunctionExpression') {
    return 'function'
  }

  if (expression.type === 'BooleanLiteral') {
    return 'boolean'
  }

  if (expression.type === 'UnaryExpression') {
    if (expression.operator === 'typeof') {
      return 'string'
    }

    if (expression.operator === '!') {
      return 'boolean'
    }

    return 'number'
  }

  if (expression.type === 'UpdateExpression') {
    return 'number'
  }

  if (expression.type === 'BinaryExpression') {
    if (isBooleanBinaryOperator(expression.operator)) {
      return 'boolean'
    }

    if (expression.operator === '??') {
      const left = inferExpressionType(expression.left, context, deps)

      if (left === 'null' || left === 'unknown') {
        return inferExpressionType(expression.right, context, deps)
      }

      return left
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

  if (expression.type === 'ArrayLiteral') {
    return 'array'
  }

  if (expression.type === 'ObjectLiteral') {
    return 'object'
  }

  if (deps.isMemberAccessExpression(expression)) {
    if (isPresent(deps.emitPreparedNetAddressPortExpression(expression, context))) {
      return 'number'
    }

    if (isPresent(deps.resolveNetAddressStringMember(expression, context))) {
      return 'string'
    }

    if (deps.isArrayLengthExpression(expression, context)) {
      return 'number'
    }

    const length = deps.resolveKnownArrayLength(expression, context)

    if (length !== null && typeof length !== 'undefined') {
      return 'number'
    }

    const member = deps.resolveKnownObjectMember(expression, context)

    if (member !== null && typeof member !== 'undefined') {
      return member.valueType
    }

    if (expression.type === 'OptionalMemberExpression') {
      return 'optional'
    }

    return 'number'
  }

  if (deps.isIndexAccessExpression(expression)) {
    if (expression.collectionKind === 'map') {
      return cValueTypeOrUnknown(expression)
    }

    const element = deps.resolveKnownArrayIndex(expression, context)
    const field = deps.resolveKnownObjectIndex(expression, context)
    const runtimeElement = deps.resolveRuntimeArrayIndex(expression, context)

    if (element !== null && typeof element !== 'undefined') {
      return element.valueType
    }

    if (field !== null && typeof field !== 'undefined') {
      return field.valueType
    }

    if (runtimeElement !== null && typeof runtimeElement !== 'undefined') {
      return runtimeElement.valueType
    }

    if (expression.type === 'OptionalIndexExpression') {
      return 'optional'
    }

    return 'number'
  }

  if (expression.type === 'CallExpression') {
    if (
      expression.valueType !== null &&
      typeof expression.valueType !== 'undefined' &&
      expression.valueType !== 'unknown'
    ) {
      return expression.valueType
    }

    if (expression.callee.type === 'Reference') {
      const name = cStringAt(expression.callee.path, 0)
      const returnType = context.functionReturnTypes.get(name)

      if (returnType !== null && typeof returnType !== 'undefined') {
        return returnType
      }

      if (expression.valueType === 'unknown') {
        return 'unknown'
      }

      return 'number'
    }

    if (expression.valueType === 'unknown') {
      return 'unknown'
    }

    return 'number'
  }

  if (expression.type === 'NewExpression') {
    return 'class'
  }

  if (isOptionalChainExpression(expression)) {
    return 'optional'
  }

  return 'number'
}

function cObjectFunctionFieldCallReturnType(
  expression: AnyNode,
  context: CFunctionContext,
  deps: CExpressionTypeDependencies
): string | null {
  const callee = expression.callee

  if (callee === null || typeof callee === 'undefined') {
    return null
  }

  let field: CKnownObjectField | null = null

  if (callee.type === 'MemberExpression') {
    field = deps.resolveKnownObjectMember(callee, context)
  } else if (callee.type === 'IndexExpression' && callee.index.type === 'StringLiteral') {
    field = deps.resolveKnownObjectIndex(callee, context)
  }

  if (
    field === null ||
    typeof field === 'undefined' ||
    field.valueType !== 'function' ||
    field.functionType === null ||
    typeof field.functionType === 'undefined'
  ) {
    return null
  }

  return field.functionType.returnType
}
