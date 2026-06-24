import { memberExpressionPath } from '../../member-paths.ts'
import { nullableTypeNameFromTypeName } from '../../type-names.ts'
import type { AnyNode } from '../../types.ts'
import type { CFunctionContext } from '../context.ts'
import { isCJsGlobalRoot, usesCJsGlobal } from '../globals.ts'
import { isOptionalChainExpression } from '../syntax.ts'
import type {
  CKnownArrayElement,
  CKnownObjectField,
  CKnownObjectIndexField,
  CPreparedExpression,
  CFunctionType,
  CObjectFieldInfo,
  CRuntimeArrayElement
} from '../types.ts'
import { isNullableScalarType, isOpaqueRuntimeValueType } from '../value-types.ts'

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
  isArrayIncludesCall: (expression: AnyNode) => boolean
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
  resolveObjectExpressionIndex: (expression: AnyNode) => CObjectFieldInfo | null
  resolveObjectExpressionMember: (expression: AnyNode) => CObjectFieldInfo | null
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

function cObjectExpressionPathName(expression: AnyNode): string | null {
  if (expression.type === 'Reference' && expression.path.length === 1) {
    return expression.path[0]
  }

  if (expression.type === 'ThisExpression') {
    return 'this'
  }

  if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
    const objectName = cObjectExpressionPathName(expression.object)

    if (objectName !== null && typeof objectName !== 'undefined') {
      return `${objectName}_${expression.property}`
    }
  }

  if (
    (expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression') &&
    expression.index.type === 'StringLiteral'
  ) {
    const objectName = cObjectExpressionPathName(expression.object)

    if (objectName !== null && typeof objectName !== 'undefined') {
      return `${objectName}_${expression.index.value}`
    }
  }

  return null
}

function contextObjectShapeFieldValueType(
  objectExpression: AnyNode,
  fieldName: string,
  context: CFunctionContext
): string | null {
  const objectName = cObjectExpressionPathName(objectExpression)

  if (objectName === null || typeof objectName === 'undefined') {
    return null
  }

  const fields = context.objectShapes.get(objectName)

  if (fields === null || typeof fields === 'undefined') {
    return null
  }

  const fieldValueTypes: Map<string, string> = new Map()

  for (let index = 0; index < fields.length; index = index + 1) {
    const field = fields[index]

    fieldValueTypes.set(field.name, field.valueType)
  }

  const valueType = fieldValueTypes.get(fieldName)

  if (valueType !== null && typeof valueType !== 'undefined') {
    return valueType
  }

  return null
}

function narrowedNullableScalarExpressionType(
  expression: AnyNode,
  context: CFunctionContext,
  deps: CExpressionTypeDependencies
): string | null {
  const path = memberExpressionPath(expression)

  if (path.length === 0) {
    return null
  }

  if (!context.narrowedNullableScalars.has(cDottedPath(path))) {
    return null
  }

  const valueType = narrowedNullableScalarMetadataType(expression, context, deps)

  if (isNullableScalarType(valueType)) {
    return valueType
  }

  return null
}

function narrowedNullableScalarMetadataType(
  expression: AnyNode,
  context: CFunctionContext,
  deps: CExpressionTypeDependencies
): string | null {
  if (
    expression.valueType !== null &&
    typeof expression.valueType !== 'undefined' &&
    expression.valueType !== 'unknown'
  ) {
    return expression.valueType
  }

  const path = memberExpressionPath(expression)
  const pathName = cDottedPath(path)
  const variableType = context.variables.get(pathName)

  if (variableType !== null && typeof variableType !== 'undefined') {
    return variableType
  }

  if (deps.isMemberAccessExpression(expression)) {
    const member = deps.resolveKnownObjectMember(expression, context)

    if (member !== null && typeof member !== 'undefined') {
      return narrowedNullableScalarFieldType(member)
    }

    const contextShapeValueType = contextObjectShapeFieldValueType(expression.object, expression.property, context)

    if (contextShapeValueType !== null && typeof contextShapeValueType !== 'undefined') {
      return contextShapeValueType
    }

    const shapeField = deps.resolveObjectExpressionMember(expression)

    if (shapeField !== null && typeof shapeField !== 'undefined') {
      return narrowedNullableScalarFieldType(shapeField)
    }
  }

  if (deps.isIndexAccessExpression(expression)) {
    const field = deps.resolveKnownObjectIndex(expression, context)

    if (field !== null && typeof field !== 'undefined') {
      return narrowedNullableScalarFieldType(field)
    }

    if (expression.index.type === 'StringLiteral') {
      const contextShapeValueType = contextObjectShapeFieldValueType(expression.object, expression.index.value, context)

      if (contextShapeValueType !== null && typeof contextShapeValueType !== 'undefined') {
        return contextShapeValueType
      }
    }

    const shapeField = deps.resolveObjectExpressionIndex(expression)

    if (shapeField !== null && typeof shapeField !== 'undefined') {
      return narrowedNullableScalarFieldType(shapeField)
    }
  }

  if (expression.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]
    const valueType = context.variables.get(name)

    if (valueType !== null && typeof valueType !== 'undefined') {
      return valueType
    }
  }

  return null
}

function narrowedNullableScalarFieldType(field: CObjectFieldInfo): string | null {
  if (isNullableScalarType(field.valueType)) {
    return field.valueType
  }

  const declaredType = field.declaredType

  if (declaredType === null || typeof declaredType === 'undefined') {
    return null
  }

  const nullableType = nullableTypeNameFromTypeName(declaredType)

  if (isNullableScalarType(nullableType)) {
    return nullableType
  }

  return null
}

function isBooleanBinaryOperator(operator: string): boolean {
  if (operator === '===') {
    return true
  }

  if (operator === '!==') {
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

function cReferenceExpressionType(
  expression: AnyNode,
  context: CFunctionContext,
  deps: CExpressionTypeDependencies
): string {
  const variableType = context.variables.get(cDottedPath(expression.path))
  const name = cStringAt(expression.path, 0)
  const localName = expression.path.length === 1 && context.localValueNames.has(name)
  let metadataType: string | null = null

  if (
    expression.valueType !== null &&
    typeof expression.valueType !== 'undefined' &&
    expression.valueType !== 'unknown'
  ) {
    metadataType = expression.valueType
  }

  const moduleValueType = context.moduleValueTypes.get(name)

  if (!localName && moduleValueType !== null && typeof moduleValueType !== 'undefined') {
    if (moduleValueType === 'unknown') {
      if (
        variableType === 'number' ||
        variableType === 'string' ||
        variableType === 'boolean' ||
        variableType === 'function'
      ) {
        return variableType
      }

      if (metadataType === 'string') {
        return 'string'
      }
    }

    return moduleValueType
  }

  if (
    (variableType === null || typeof variableType === 'undefined') &&
    (context.runtimeArrayElementTypes.has(name) || context.arrayShapes.has(name))
  ) {
    return 'array'
  }

  if (shouldPreferReferenceMetadataType(variableType, metadataType)) {
    const resolvedMetadataType = metadataType

    if (resolvedMetadataType !== null && typeof resolvedMetadataType !== 'undefined') {
      return resolvedMetadataType
    }
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

function shouldPreferReferenceMetadataType(
  variableType: string | null | undefined,
  metadataType: string | null | undefined
): boolean {
  if (metadataType === null || typeof metadataType === 'undefined') {
    return false
  }

  if (variableType === null || typeof variableType === 'undefined') {
    return true
  }

  if (isUnionMetadataType(metadataType) && isConcreteContextValueType(variableType)) {
    return false
  }

  if (variableType === 'number' && metadataType !== 'number') {
    return true
  }

  return isOpaqueRuntimeValueType(variableType)
}

function isUnionMetadataType(valueType: string | null | undefined): boolean {
  return valueType !== null && typeof valueType !== 'undefined' && valueType.startsWith('union<')
}

function isConcreteContextValueType(valueType: string | null | undefined): boolean {
  return (
    valueType !== null &&
    typeof valueType !== 'undefined' &&
    valueType !== 'unknown' &&
    !isUnionMetadataType(valueType)
  )
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

  if (deps.cOsRuntimeConstantName(expression) || deps.cOsRuntimeMethodName(expression)) {
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

  if (deps.cProcessRuntimeEnvName(expression)) {
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

  if (expression.type === 'CallExpression' && deps.cTimeRuntimeCallName(expression.callee)) {
    return 'number'
  }

  if (expression.type === 'CallExpression' && deps.cFsRuntimeExpressionMethod(expression)) {
    if (expression.valueType === 'promise') {
      return 'promise'
    }

    return cValueTypeOrUnknown(expression)
  }

  if (expression.type === 'CallExpression' && deps.cFetchRuntimeExpressionMethod(expression)) {
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
    deps.cPromiseRuntimeCallName(expression.callee) &&
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

  if (expression.type === 'CallExpression' && deps.mathRuntimeMethodName(expression.callee)) {
    return 'number'
  }

  if (expression.type === 'CallExpression') {
    const objectFunctionFieldReturnType = cObjectFunctionFieldCallReturnType(expression, context, deps)

    if (objectFunctionFieldReturnType !== null && typeof objectFunctionFieldReturnType !== 'undefined') {
      return objectFunctionFieldReturnType
    }
  }

  if (expression.type === 'OptionalCallExpression') {
    const functionType = optionalCallFunctionType(expression.callee, context)

    if (functionType !== null && typeof functionType !== 'undefined') {
      return functionType.returnType
    }
  }

  if (deps.isArrayIsArrayCall(expression)) {
    return 'boolean'
  }

  if (deps.isArrayIncludesCall(expression)) {
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

  if (expression.type === 'ConditionalExpression') {
    const knownType = deps.knownValueType(expression.valueType)

    if (knownType !== null && typeof knownType !== 'undefined') {
      return knownType
    }

    const consequentType = inferExpressionType(expression.consequent, context, deps)
    const alternateType = inferExpressionType(expression.alternate, context, deps)

    return inferConditionalExpressionType(consequentType, alternateType)
  }

  if (expression.type === 'StringLiteral') {
    return 'string'
  }

  if (expression.type === 'TemplateLiteral') {
    return 'string'
  }

  if (expression.type === 'Reference') {
    return cReferenceExpressionType(expression, context, deps)
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
    const narrowedType = narrowedNullableScalarExpressionType(expression, context, deps)

    if (narrowedType !== null && typeof narrowedType !== 'undefined') {
      return narrowedType
    }

    if (deps.emitPreparedNetAddressPortExpression(expression, context)) {
      return 'number'
    }

    if (deps.resolveNetAddressStringMember(expression, context)) {
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

    const contextShapeValueType = contextObjectShapeFieldValueType(expression.object, expression.property, context)

    if (contextShapeValueType !== null && typeof contextShapeValueType !== 'undefined') {
      return contextShapeValueType
    }

    const shapeField = deps.resolveObjectExpressionMember(expression)

    if (shapeField !== null && typeof shapeField !== 'undefined') {
      return shapeField.valueType
    }

    if (expression.type === 'OptionalMemberExpression') {
      return 'optional'
    }

    const anyNodeValueType = anyNodeLikeObjectAccessValueType(expression, context)

    if (anyNodeValueType !== null && typeof anyNodeValueType !== 'undefined') {
      return anyNodeValueType
    }

    return 'number'
  }

  if (deps.isIndexAccessExpression(expression)) {
    const narrowedType = narrowedNullableScalarExpressionType(expression, context, deps)

    if (narrowedType !== null && typeof narrowedType !== 'undefined') {
      return narrowedType
    }

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

    if (expression.index.type === 'StringLiteral') {
      const contextShapeValueType = contextObjectShapeFieldValueType(expression.object, expression.index.value, context)

      if (contextShapeValueType !== null && typeof contextShapeValueType !== 'undefined') {
        return contextShapeValueType
      }
    }

    const shapeField = deps.resolveObjectExpressionIndex(expression)

    if (shapeField !== null && typeof shapeField !== 'undefined') {
      return shapeField.valueType
    }

    if (runtimeElement !== null && typeof runtimeElement !== 'undefined') {
      return runtimeElement.valueType
    }

    if (expression.type === 'OptionalIndexExpression') {
      return 'optional'
    }

    const anyNodeValueType = anyNodeLikeObjectAccessValueType(expression, context)

    if (anyNodeValueType !== null && typeof anyNodeValueType !== 'undefined') {
      return anyNodeValueType
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

function inferConditionalExpressionType(consequentType: string, alternateType: string): string {
  if (consequentType === alternateType) {
    return consequentType
  }

  if (consequentType === 'null') {
    return alternateType
  }

  if (alternateType === 'null') {
    return consequentType
  }

  if (consequentType === 'unknown') {
    return alternateType
  }

  if (alternateType === 'unknown') {
    return consequentType
  }

  return 'unknown'
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

function optionalCallFunctionType(callee: AnyNode, context: CFunctionContext): CFunctionType | null {
  if (callee.functionType !== null && typeof callee.functionType !== 'undefined') {
    return callee.functionType
  }

  if (callee.type !== 'Reference' || callee.path.length !== 1) {
    return null
  }

  const name = callee.path[0]
  const functionType = context.functionTypes.get(name)

  if (functionType !== null && typeof functionType !== 'undefined') {
    return functionType
  }

  return null
}

function anyNodeLikeObjectAccessValueType(expression: AnyNode, context: CFunctionContext): string | null {
  const rootName = objectAccessRootName(expression)

  if (rootName === null || typeof rootName === 'undefined') {
    return null
  }

  const declaredType = context.objectDeclaredTypes.get(rootName)

  if (declaredType === null || typeof declaredType === 'undefined') {
    return null
  }

  if (!isAnyNodeLikeDeclaredType(declaredType)) {
    return null
  }

  const fieldName = objectAccessFieldName(expression)

  if (fieldName === null || typeof fieldName === 'undefined') {
    return 'unknown'
  }

  return anyNodeLikeFieldValueType(fieldName)
}

function objectAccessRootName(expression: AnyNode): string | null {
  let current = expression

  while (
    current.type === 'MemberExpression' ||
    current.type === 'OptionalMemberExpression' ||
    current.type === 'IndexExpression' ||
    current.type === 'OptionalIndexExpression'
  ) {
    current = current.object
  }

  if (current.type === 'Reference' && current.path.length === 1) {
    return current.path[0]
  }

  return null
}

export function isAnyNodeLikeDeclaredType(value: string): boolean {
  const nullableType = nullableTypeNameFromTypeName(value)

  if (nullableType !== null && typeof nullableType !== 'undefined') {
    return isAnyNodeLikeDeclaredType(nullableType)
  }

  return (
    value === 'AnyNode' ||
    value === 'CompilerAnyNode' ||
    value === 'CompilerFieldMetadata' ||
    value === 'CompilerObjectShapeInfo' ||
    value.endsWith('Node') ||
    value.endsWith('AstNode')
  )
}

function objectAccessFieldName(expression: AnyNode): string | null {
  if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
    return expression.property
  }

  if (
    (expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression') &&
    expression.index.type === 'StringLiteral'
  ) {
    return expression.index.value
  }

  return null
}

function anyNodeLikeFieldValueType(fieldName: string): string {
  if (anyNodeLikeStringFields().includes(fieldName)) {
    return 'string'
  }

  if (anyNodeLikeBooleanFields().includes(fieldName)) {
    return 'boolean'
  }

  if (anyNodeLikeArrayFields().includes(fieldName)) {
    return 'array'
  }

  if (anyNodeLikeObjectFields().includes(fieldName)) {
    return 'object'
  }

  return 'unknown'
}

export function isAnyNodeLikeArrayFieldName(fieldName: string): boolean {
  return anyNodeLikeArrayFields().includes(fieldName)
}

export function anyNodeLikeObjectFieldDeclaredType(fieldName: string): string | null {
  if (
    fieldName === 'argument' ||
    fieldName === 'block' ||
    fieldName === 'callee' ||
    fieldName === 'condition' ||
    fieldName === 'consequent' ||
    fieldName === 'defaultValue' ||
    fieldName === 'discriminant' ||
    fieldName === 'dynamicField' ||
    fieldName === 'alternate' ||
    fieldName === 'expression' ||
    fieldName === 'finalizer' ||
    fieldName === 'handler' ||
    fieldName === 'index' ||
    fieldName === 'init' ||
    fieldName === 'iterable' ||
    fieldName === 'left' ||
    fieldName === 'mapValueShape' ||
    fieldName === 'object' ||
    fieldName === 'paramLoc' ||
    fieldName === 'returnShape' ||
    fieldName === 'right' ||
    fieldName === 'shape' ||
    fieldName === 'staticLoc' ||
    fieldName === 'target' ||
    fieldName === 'test' ||
    fieldName === 'update'
  ) {
    return 'AnyNode'
  }

  if (fieldName === 'loc') {
    return 'SourceLocation'
  }

  return null
}

function anyNodeLikeStringFields(): string[] {
  return [
    'type',
    'builtin',
    'imported',
    'kind',
    'local',
    'name',
    'ownership',
    'property',
    'operator',
    'declaredType',
    'valueType',
    'arrayElementType',
    'arrayElementDeclaredType',
    'mapKeyType',
    'mapValueType',
    'promiseValueType',
    'promiseRejectionValueType',
    'setElementType',
    'propertyValueType',
    'pathRuntimeMethod',
    'pathRuntimeConstant',
    'processRuntimeMethod',
    'processRuntimeProperty',
    'processRuntimeEnvName',
    'dgramMessageHandlerName',
    'urlRuntimeMethod',
    'urlRuntimeField',
    'httpHandlerName',
    'binaryRuntimeMethod',
    'bufferRuntimeConstant',
    'childProcessRuntimeMethod',
    'cryptoHashDigestEncoding',
    'cryptoRuntimeMethod',
    'debugRuntimeMethod',
    'fetchRuntimeMethod',
    'fsRuntimeConstant',
    'fsRuntimeMethod',
    'jsonRuntimeMethod',
    'mathRuntimeMethod',
    'osRuntimeConstant',
    'osRuntimeMethod',
    'objectRuntimeMethod',
    'stringRuntimeMethod',
    'timeRuntimeMethod',
    'timerRuntimeMethod',
    'numericCast',
    'returnType',
    'declaredReturnType',
    'returnArrayElementType',
    'returnArrayElementDeclaredType',
    'returnMapKeyType',
    'returnMapValueType',
    'returnPromiseValueType',
    'returnSetElementType',
    'className',
    'collectionKind',
    'param',
    'functionTypeOwnership',
    'shapeOwnership'
  ]
}

function anyNodeLikeBooleanFields(): string[] {
  return [
    'async',
    'default',
    'exported',
    'expressionBody',
    'fsBytes',
    'fsDirents',
    'fsForce',
    'fsRecursive',
    'nullable',
    'optional',
    'optionalChainProtected',
    'readonly',
    'readonlyField',
    'returnNullable',
    'static',
    'typeOnly',
    'weakTypeValidated'
  ]
}

function anyNodeLikeArrayFields(): string[] {
  return [
    'args',
    'cases',
    'elements',
    'expressions',
    'fields',
    'methods',
    'params',
    'path',
    'properties',
    'specifiers'
  ]
}

function anyNodeLikeObjectFields(): string[] {
  return [
    'argument',
    'block',
    'callee',
    'condition',
    'consequent',
    'discriminant',
    'alternate',
    'defaultValue',
    'dynamicField',
    'expression',
    'finalizer',
    'functionType',
    'handler',
    'index',
    'init',
    'iterable',
    'left',
    'mapValueShape',
    'loc',
    'object',
    'paramLoc',
    'returnShape',
    'right',
    'shape',
    'staticLoc',
    'target',
    'test',
    'update'
  ]
}
