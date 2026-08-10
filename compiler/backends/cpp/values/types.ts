import { memberExpressionPath } from '../../../member-paths.ts'
import { nullableTypeNameFromTypeName } from '../../../type-names.ts'
import type { AnyNode } from '../../../types.ts'
import type { CFunctionContext } from '../context.ts'
import { isCJsGlobalRoot, usesCJsGlobal } from '../globals.ts'
import { isOptionalChainExpression } from '../syntax.ts'
import type {
  CKnownObjectField,
  CKnownObjectIndexField,
  CFunctionType,
  CObjectFieldInfo
} from '../types.ts'
import { isNullableScalarType, isOpaqueRuntimeValueType } from '../value-types.ts'
import {
  compilerAnyNodeArrayFields,
  compilerAnyNodeBooleanFields,
  compilerAnyNodeObjectFields,
  compilerAnyNodeStringArrayFields,
  compilerAnyNodeStringFields
} from './any-node-fields.ts'
export type CExpressionTypeDependencies = {
  isClassConstructorExpression: (expression: AnyNode, context: CFunctionContext) => boolean
  isIndexAccessExpression: (expression: AnyNode) => boolean
  isMemberAccessExpression: (expression: AnyNode) => boolean
  isAsyncResultReturningFunctionCallee: (callee: AnyNode, context: CFunctionContext) => boolean
  knownValueType: (valueType: string | null | undefined) => string | null
  resolveKnownObjectIndex: (expression: AnyNode, context: CFunctionContext) => CKnownObjectIndexField | null
  resolveKnownObjectMember: (expression: AnyNode, context: CFunctionContext) => CKnownObjectField | null
  resolveObjectExpressionIndex: (expression: AnyNode) => CObjectFieldInfo | null
  resolveObjectExpressionMember: (expression: AnyNode) => CObjectFieldInfo | null
  resolveAsyncResultExpressionValueType: (expression: AnyNode, context: CFunctionContext) => string | null
}

function cValueTypeOrUnknown(expression: AnyNode): string {
  if (expression.valueType !== null && typeof expression.valueType !== 'undefined') {
    return expression.valueType
  }

  return 'unknown'
}

function cExpressionChild(value: AnyNode | null | undefined): AnyNode | null {
  if (value === null || typeof value === 'undefined') {
    return null
  }

  return value
}

function cDottedPath(path: string[]): string {
  let output = ''

  for (let index = 0; index < path.length; index = index + 1) {
    if (index === 0) {
      output = path[index]
    } else {
      output = `${output}.${path[index]}`
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
  const directValueType = contextObjectShapeNameFieldValueType(objectName, fieldName, context)

  if (directValueType !== null && typeof directValueType !== 'undefined') {
    return directValueType
  }

  const aliasedObjectName = cAliasedObjectExpressionPathName(objectExpression, context)

  if (aliasedObjectName === objectName) {
    return null
  }

  return contextObjectShapeNameFieldValueType(aliasedObjectName, fieldName, context)
}

function contextObjectShapeNameFieldValueType(
  objectName: string | null,
  fieldName: string,
  context: CFunctionContext
): string | null {
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

function cAliasedObjectExpressionPathName(expression: AnyNode, context: CFunctionContext): string | null {
  if (expression.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]
    const alias = context.objectAliases.get(name)

    if (alias !== null && typeof alias !== 'undefined') {
      return alias
    }

    return name
  }

  if (expression.type === 'ThisExpression') {
    return 'this'
  }

  if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
    const objectName = cAliasedObjectExpressionPathName(expression.object, context)

    if (objectName !== null && typeof objectName !== 'undefined') {
      const path = `${objectName}_${expression.property}`
      const alias = context.objectAliases.get(path)

      if (alias !== null && typeof alias !== 'undefined') {
        return alias
      }

      return path
    }
  }

  if (
    (expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression') &&
    expression.index.type === 'StringLiteral'
  ) {
    const objectName = cAliasedObjectExpressionPathName(expression.object, context)

    if (objectName !== null && typeof objectName !== 'undefined') {
      const path = `${objectName}_${expression.index.value}`
      const alias = context.objectAliases.get(path)

      if (alias !== null && typeof alias !== 'undefined') {
        return alias
      }

      return path
    }
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

    if (
      contextShapeValueType !== null &&
      typeof contextShapeValueType !== 'undefined' &&
      contextShapeValueType !== 'unknown'
    ) {
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

function cReferenceExpressionType(expression: AnyNode, context: CFunctionContext): string {
  const variableType = context.variables.get(cDottedPath(expression.path))
  const name = expression.path[0] ?? ''
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

      if (metadataType !== null && typeof metadataType !== 'undefined' && isConcreteContextValueType(metadataType)) {
        return metadataType
      }
    }

    return moduleValueType
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

  if (
    expression.path.length === 1 &&
    name === 'undefined' &&
    !context.variables.has(name) &&
    !context.moduleValueNames.has(name) &&
    !context.functionNames.has(name)
  ) {
    return 'unknown'
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

  if (variableType === 'unknown' && metadataType === 'void') {
    return false
  }

  if (variableType === 'unknown' && isConcreteContextValueType(metadataType)) {
    return true
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
    valueType !== null && typeof valueType !== 'undefined' && valueType !== 'unknown' && !isUnionMetadataType(valueType)
  )
}

export function inferExpressionType(
  expression: AnyNode,
  context: CFunctionContext,
  deps: CExpressionTypeDependencies
): string {
  if (expression.libraryOperationId !== null && typeof expression.libraryOperationId !== 'undefined') {
    return cValueTypeOrUnknown(expression)
  }

  if (expression.type === 'CallExpression' && deps.isAsyncResultReturningFunctionCallee(expression.callee, context)) {
    return 'async-result'
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

  if (deps.isClassConstructorExpression(expression, context)) {
    return 'object'
  }

  if (expression.type === 'CallExpression' && usesCJsGlobal(expression.callee, context)) {
    return 'js-global'
  }

  if (expression.type === 'NewExpression' && usesCJsGlobal(expression.callee, context)) {
    return 'js-global'
  }

  if (expression.type === 'AwaitExpression') {
    let valueType = deps.knownValueType(expression.valueType)

    if (valueType === 'async-result') {
      valueType = null
    }

    if (valueType === null || typeof valueType === 'undefined') {
      valueType = deps.resolveAsyncResultExpressionValueType(expression.argument, context)
    }

    if (valueType !== null && typeof valueType !== 'undefined') {
      return valueType
    }

    const argumentType = inferExpressionType(expression.argument, context, deps)

    if (argumentType === 'async-result') {
      return 'unknown'
    }

    return argumentType
  }

  if (expression.type === 'ConditionalExpression') {
    const knownType = deps.knownValueType(expression.valueType)

    if (knownType !== null && typeof knownType !== 'undefined') {
      return knownType
    }

    const consequent = cExpressionChild(expression.consequent)
    const alternate = cExpressionChild(expression.alternate)

    if (consequent === null || alternate === null) {
      return 'unknown'
    }

    const consequentType = inferExpressionType(consequent, context, deps)
    const alternateType = inferExpressionType(alternate, context, deps)

    if (isUndefinedReferenceExpression(consequent)) {
      return alternateType
    }

    if (isUndefinedReferenceExpression(alternate)) {
      return consequentType
    }

    return inferConditionalExpressionType(consequentType, alternateType)
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

    if (expression.operator === 'void') {
      return 'unknown'
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
      const right = inferExpressionType(expression.right, context, deps)

      return inferConditionalExpressionType(left, right)
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
    return expression.valueType ?? 'unknown'
  }

  if (expression.type === 'ObjectLiteral') {
    return 'object'
  }

  if (deps.isMemberAccessExpression(expression)) {
    const narrowedType = narrowedNullableScalarExpressionType(expression, context, deps)

    if (narrowedType !== null && typeof narrowedType !== 'undefined') {
      return narrowedType
    }

    const member = deps.resolveKnownObjectMember(expression, context)

    if (
      member !== null &&
      typeof member !== 'undefined' &&
      member.valueType !== 'unknown'
    ) {
      return member.valueType
    }

    const contextShapeValueType = contextObjectShapeFieldValueType(expression.object, expression.property, context)

    if (contextShapeValueType !== null && typeof contextShapeValueType !== 'undefined') {
      return contextShapeValueType
    }

    const shapeField = deps.resolveObjectExpressionMember(expression)

    if (
      shapeField !== null &&
      typeof shapeField !== 'undefined' &&
      shapeField.valueType !== 'unknown'
    ) {
      return shapeField.valueType
    }

    const anyNodeValueType = anyNodeLikeObjectAccessValueType(expression, context)

    if (anyNodeValueType !== null && typeof anyNodeValueType !== 'undefined') {
      return anyNodeValueType
    }

    if (member !== null && typeof member !== 'undefined') {
      return member.valueType
    }

    if (contextShapeValueType !== null && typeof contextShapeValueType !== 'undefined') {
      return contextShapeValueType
    }

    if (shapeField !== null && typeof shapeField !== 'undefined') {
      return shapeField.valueType
    }

    if (expression.type === 'OptionalMemberExpression') {
      return 'optional'
    }

    if (expression.templatePlaceholder === true && expression.valueType === 'unknown') {
      return 'unknown'
    }

    if (expression.declaredType === 'any') {
      return 'unknown'
    }

    return 'number'
  }

  if (deps.isIndexAccessExpression(expression)) {
    const narrowedType = narrowedNullableScalarExpressionType(expression, context, deps)

    if (narrowedType !== null && typeof narrowedType !== 'undefined') {
      return narrowedType
    }

    const field = deps.resolveKnownObjectIndex(expression, context)

    if (
      field !== null &&
      typeof field !== 'undefined' &&
      field.valueType !== 'unknown'
    ) {
      return field.valueType
    }

    let contextShapeValueType: string | null = null

    if (expression.index.type === 'StringLiteral') {
      contextShapeValueType = contextObjectShapeFieldValueType(expression.object, expression.index.value, context)

      if (
        contextShapeValueType !== null &&
        typeof contextShapeValueType !== 'undefined' &&
        contextShapeValueType !== 'unknown'
      ) {
        return contextShapeValueType
      }
    }

    const shapeField = deps.resolveObjectExpressionIndex(expression)

    if (
      shapeField !== null &&
      typeof shapeField !== 'undefined' &&
      shapeField.valueType !== 'unknown'
    ) {
      return shapeField.valueType
    }

    const anyNodeValueType = anyNodeLikeObjectAccessValueType(expression, context)

    if (anyNodeValueType !== null && typeof anyNodeValueType !== 'undefined') {
      return anyNodeValueType
    }

    if (field !== null && typeof field !== 'undefined') {
      return field.valueType
    }

    if (
      expression.index.type === 'StringLiteral' &&
      contextShapeValueType !== null &&
      typeof contextShapeValueType !== 'undefined'
    ) {
      return contextShapeValueType
    }

    if (shapeField !== null && typeof shapeField !== 'undefined') {
      return shapeField.valueType
    }

    if (expression.type === 'OptionalIndexExpression') {
      return 'optional'
    }

    if (expression.templatePlaceholder === true && expression.valueType === 'unknown') {
      return 'unknown'
    }

    if (expression.declaredType === 'any') {
      return 'unknown'
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
      const name = expression.callee.path[0] ?? ''
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

function isUndefinedReferenceExpression(expression: AnyNode): boolean {
  return (
    expression.type === 'Reference' &&
    expression.path.length === 1 &&
    expression.path[0] === 'undefined' &&
    expression.valueType === 'unknown' &&
    expression.nullable === true
  )
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

  if (consequentType === 'unknown' || alternateType === 'unknown') {
    return 'unknown'
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

  const fieldName = objectAccessFieldName(expression)

  if (fieldName === null || typeof fieldName === 'undefined') {
    return 'unknown'
  }

  return anyNodeLikeDeclaredObjectFieldValueType(declaredType, fieldName)
}

export function anyNodeLikeDeclaredObjectFieldValueType(
  declaredType: string | null | undefined,
  fieldName: string
): string | null {
  if (
    declaredType === null ||
    typeof declaredType === 'undefined' ||
    !isAnyNodeLikeDeclaredType(declaredType)
  ) {
    return null
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
  if (compilerAnyNodeStringFields.includes(fieldName)) {
    return 'string'
  }

  if (compilerAnyNodeBooleanFields.includes(fieldName)) {
    return 'boolean'
  }

  if (compilerAnyNodeArrayFields.includes(fieldName)) {
    return 'object'
  }

  if (compilerAnyNodeObjectFields.includes(fieldName)) {
    return 'object'
  }

  return 'unknown'
}

export function isAnyNodeLikeArrayFieldName(fieldName: string): boolean {
  return compilerAnyNodeArrayFields.includes(fieldName)
}

export function anyNodeLikeArrayFieldElementValueType(fieldName: string): string | null {
  if (!isAnyNodeLikeArrayFieldName(fieldName)) {
    return null
  }

  if (compilerAnyNodeStringArrayFields.includes(fieldName)) {
    return 'string'
  }

  return 'object'
}

export function anyNodeLikeObjectFieldDeclaredType(fieldName: string): string | null {
  if (
    fieldName === 'argument' ||
    fieldName === 'block' ||
    fieldName === 'callee' ||
    fieldName === 'condition' ||
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
