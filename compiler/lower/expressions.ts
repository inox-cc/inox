import { typeRefIterableElementValueType } from '../extensions/type-ref-compatibility.ts'
import type { TypeRef } from '../extensions/types.ts'
import type { AnyNode, ArrayBindingElement } from '../types.ts'
import type { LowerContext, LowerResolvedType } from './type-resolution.ts'
import { resolveDeclaredType } from './type-resolution.ts'

type LowerExpressionNode = AnyNode

export type LowerStatementFn = (statement: LowerExpressionNode, context: LowerContext) => LowerExpressionNode

export type LowerExpressionContext = LowerContext & {
  lowerStatement?: LowerStatementFn
}

export function lowerExpression(expression: LowerExpressionNode, context: LowerExpressionContext): LowerExpressionNode {
  const lowered = lowerExpressionWithContext(expression, context)

  return lowered
}

function lowerExpressionWithContext(
  expression: LowerExpressionNode,
  context: LowerExpressionContext
): LowerExpressionNode {
  if (expression.type === 'StringLiteral') {
    return cloneStringLiteral(expression)
  }

  if (expression.type === 'RegExpLiteral') {
    return cloneRegExpLiteral(expression)
  }

  if (expression.type === 'TemplateLiteral') {
    return cloneTemplateLiteral(expression, context)
  }

  if (expression.type === 'NumberLiteral') {
    return cloneNumberLiteral(expression)
  }

  if (expression.type === 'BooleanLiteral') {
    return cloneBooleanLiteral(expression)
  }

  if (expression.type === 'NullLiteral') {
    return cloneNullLiteral(expression)
  }

  if (expression.type === 'TypeAssertionExpression') {
    return lowerTypeAssertionExpression(expression, context)
  }

  if (expression.type === 'ThisExpression') {
    return cloneThisExpression(expression)
  }

  if (expression.type === 'Reference') {
    const variable = findReferenceVariable(expression, context)
    const reference = cloneReferenceExpression(expression, variable)

    return reference
  }

  if (expression.type === 'MemberExpression') {
    const object = lowerExpressionWithContext(expression.object, context)
    const valueType = memberExpressionValueType(expression, object)
    const member = cloneMemberExpression(expression, object, valueType)

    return member
  }

  if (expression.type === 'IndexExpression') {
    const object = lowerExpressionWithContext(expression.object, context)
    const index = lowerExpressionWithContext(expression.index, context)
    const valueType = indexExpressionValueType(expression, object, context)
    const indexed = cloneIndexExpression(expression, object, index, valueType)

    return indexed
  }

  if (expression.type === 'OptionalMemberExpression') {
    const object = lowerExpressionWithContext(expression.object, context)
    const valueType = fallbackString(expression.valueType, 'unknown')
    const member = cloneMemberExpression(expression, object, valueType)

    return member
  }

  if (expression.type === 'OptionalIndexExpression') {
    const object = lowerExpressionWithContext(expression.object, context)
    const index = lowerExpressionWithContext(expression.index, context)
    const valueType = fallbackString(expression.valueType, 'unknown')
    const indexed = cloneIndexExpression(expression, object, index, valueType)

    return indexed
  }

  if (expression.type === 'OptionalCallExpression') {
    const callee = lowerExpressionWithContext(expression.callee, context)
    const args = lowerExpressionList(expression.args, context)
    const valueType = callExpressionValueType(expression, callee)
    const call = cloneCallExpression(expression, callee, args, valueType)

    return call
  }

  if (expression.type === 'CallExpression') {
    const callee = lowerExpressionWithContext(expression.callee, context)
    const args = lowerExpressionList(expression.args, context)
    const valueType = callExpressionValueType(expression, callee)
    const call = cloneCallExpression(expression, callee, args, valueType)

    return call
  }

  if (expression.type === 'NewExpression') {
    const callee = lowerExpressionWithContext(expression.callee, context)
    const args = lowerExpressionList(expression.args, context)
    const valueType = fallbackString(expression.valueType, 'object')
    const call = cloneCallExpression(expression, callee, args, valueType)

    return call
  }

  if (expression.type === 'AwaitExpression') {
    const argument = lowerExpressionWithContext(expression.argument, context)
    const valueType = fallbackString(expression.valueType, 'unknown')
    const awaited = cloneAwaitExpression(expression, argument, valueType)

    return awaited
  }

  if (expression.type === 'ArrowFunctionExpression') {
    const body = lowerArrowFunctionBody(expression, context)
    const arrow = cloneArrowFunctionExpression(expression, body)

    return arrow
  }

  if (expression.type === 'AssignmentExpression') {
    const value = lowerExpressionWithContext(expression.value, context)
    const target = lowerExpressionWithContext(expression.target, context)
    const assignment = cloneAssignmentExpression(expression, target, value)

    return assignment
  }

  if (expression.type === 'UpdateExpression') {
    const argument = lowerExpressionWithContext(expression.argument, context)
    const update = cloneUpdateExpression(expression, argument)

    return update
  }

  if (expression.type === 'BinaryExpression') {
    const left = lowerExpressionWithContext(expression.left, context)
    const right = lowerExpressionWithContext(expression.right, context)
    const valueType = inferBinaryExpressionType(expression.operator, left, right)
    const binary = cloneBinaryExpression(expression, left, right, valueType)

    return binary
  }

  if (expression.type === 'ConditionalExpression') {
    const test = lowerExpressionWithContext(expression.test, context)
    const consequent = lowerExpressionWithContext(expression.consequent, context)
    const alternate = lowerExpressionWithContext(expression.alternate, context)
    const valueType = inferConditionalExpressionType(consequent, alternate)
    const conditional = cloneConditionalExpression(expression, test, consequent, alternate, valueType)

    return conditional
  }

  if (expression.type === 'UnaryExpression') {
    const argument = lowerExpressionWithContext(expression.argument, context)
    const valueType = unaryExpressionValueType(expression)
    const unary = cloneUnaryExpression(expression, argument, valueType)

    return unary
  }

  if (expression.type === 'ArrayLiteral') {
    const elements = lowerExpressionList(expression.elements, context)
    const loweredArray = cloneArrayLiteralExpression(expression, elements)

    return loweredArray
  }

  if (expression.type === 'SpreadElement') {
    const argument = lowerExpressionWithContext(expression.argument, context)

    return {
      type: 'SpreadElement',
      argument,
      valueType: 'array',
      loc: expression.loc
    }
  }

  if (expression.type === 'ObjectLiteral') {
    const properties = lowerObjectProperties(expression.properties, context)
    const object = cloneObjectLiteralExpression(expression, properties)

    return object
  }

  return cloneUnknownExpression(expression)
}

function lowerTypeAssertionExpression(
  expression: LowerExpressionNode,
  context: LowerExpressionContext
): LowerExpressionNode {
  const lowered = lowerExpressionWithContext(expression.expression, context)
  let declaredType = fallbackString(expression.valueType, 'unknown')
  const expressionDeclaredType = expression.declaredType

  if (expressionDeclaredType !== null && typeof expressionDeclaredType !== 'undefined') {
    declaredType = expressionDeclaredType
  }

  if (declaredType === 'const') {
    return lowered
  }

  const declared = resolveDeclaredType(declaredType, context)

  return applyResolvedTypeAssertion(lowered, declaredType, declared)
}

function applyResolvedTypeAssertion(
  expression: LowerExpressionNode,
  declaredType: string,
  declared: LowerResolvedType
): LowerExpressionNode {
  let promiseValueType: string | null = expression.promiseValueType
  let shape: LowerExpressionNode | null = expression.shape
  let functionType: LowerExpressionNode | null = expression.functionType
  let valueType = expression.valueType

  const declaredPromiseValueType = nullableString(declared.promiseValueType)

  if (declaredPromiseValueType !== null && typeof declaredPromiseValueType !== 'undefined') {
    promiseValueType = declaredPromiseValueType
  }

  if (declared.shape !== null && typeof declared.shape !== 'undefined') {
    shape = declared.shape
  }

  if (declared.functionType !== null && typeof declared.functionType !== 'undefined') {
    functionType = declared.functionType
  }

  const declaredValueType = nullableString(declared.valueType)

  if (declaredValueType !== null && typeof declaredValueType !== 'undefined') {
    valueType = declaredValueType
  }

  expression.declaredType = declaredType
  expression.nullable = declared.nullable
  expression.promiseValueType = promiseValueType
  expression.shape = shape
  expression.functionType = functionType
  expression.valueType = valueType

  return expression
}

function fallbackString(value: string | null | undefined, fallback: string): string {
  if (value !== null && typeof value !== 'undefined' && value.length > 0) {
    return value
  }

  return fallback
}

function nullableString(value: string | null | undefined): string | null {
  if (value !== null && typeof value !== 'undefined' && value.length > 0) {
    return value
  }

  return null
}

function nullableNode(value: LowerExpressionNode | null | undefined): LowerExpressionNode | null {
  if (value !== null && typeof value !== 'undefined') {
    return value
  }

  return null
}

function copyRuntimeMetadata(target: LowerExpressionNode, source: LowerExpressionNode): LowerExpressionNode {
  const declaredType = nullableString(source.declaredType)
  if (declaredType !== null && typeof declaredType !== 'undefined') {
    target.declaredType = declaredType
  }

  const typeRef = source.typeRef
  if (typeRef !== null && typeof typeRef === 'object') {
    target.typeRef = typeRef
  }

  const libraryRuntimeCallbackFunctionType = source.libraryRuntimeCallbackFunctionType
  if (libraryRuntimeCallbackFunctionType !== null && typeof libraryRuntimeCallbackFunctionType === 'object') {
    target.libraryRuntimeCallbackFunctionType = libraryRuntimeCallbackFunctionType
  }

  const libraryArgumentNarrowing = source.libraryArgumentNarrowing
  if (libraryArgumentNarrowing !== null && typeof libraryArgumentNarrowing === 'object') {
    target.libraryArgumentNarrowing = libraryArgumentNarrowing
  }

  const libraryBindingId = nullableString(source.libraryBindingId)
  if (libraryBindingId !== null && typeof libraryBindingId !== 'undefined') {
    target.libraryBindingId = libraryBindingId
  }

  const libraryOperationId = nullableString(source.libraryOperationId)
  if (libraryOperationId !== null && typeof libraryOperationId !== 'undefined') {
    target.libraryOperationId = libraryOperationId
  }

  const libraryIntrinsicRole = nullableString(source.libraryIntrinsicRole)
  if (libraryIntrinsicRole !== null && typeof libraryIntrinsicRole !== 'undefined') {
    target.libraryIntrinsicRole = libraryIntrinsicRole
  }

  const libraryReceiverTypeId = nullableString(source.libraryReceiverTypeId)
  if (libraryReceiverTypeId !== null && typeof libraryReceiverTypeId !== 'undefined') {
    target.libraryReceiverTypeId = libraryReceiverTypeId
  }

  const libraryResultTypeId = nullableString(source.libraryResultTypeId)
  if (libraryResultTypeId !== null && typeof libraryResultTypeId !== 'undefined') {
    target.libraryResultTypeId = libraryResultTypeId
  }

  const libraryCCallStyle = nullableString(source.libraryCCallStyle)
  if (libraryCCallStyle !== null && typeof libraryCCallStyle !== 'undefined') {
    target.libraryCCallStyle = libraryCCallStyle
  }

  const libraryCResultMode = nullableString(source.libraryCResultMode)
  if (libraryCResultMode !== null && typeof libraryCResultMode !== 'undefined') {
    target.libraryCResultMode = libraryCResultMode
  }

  const libraryCReceiverAdapter = nullableString(source.libraryCReceiverAdapter)
  if (libraryCReceiverAdapter !== null && typeof libraryCReceiverAdapter !== 'undefined') {
    target.libraryCReceiverAdapter = libraryCReceiverAdapter
  }

  const libraryCResultAdapter = nullableString(source.libraryCResultAdapter)
  if (libraryCResultAdapter !== null && typeof libraryCResultAdapter !== 'undefined') {
    target.libraryCResultAdapter = libraryCResultAdapter
  }

  const libraryCFailureMode = nullableString(source.libraryCFailureMode)
  if (libraryCFailureMode !== null && typeof libraryCFailureMode !== 'undefined') {
    target.libraryCFailureMode = libraryCFailureMode
  }

  const libraryCExpression = nullableString(source.libraryCExpression)
  if (libraryCExpression !== null && typeof libraryCExpression !== 'undefined') {
    target.libraryCExpression = libraryCExpression
  }

  const libraryCLowering = nullableString(source.libraryCLowering)
  if (libraryCLowering !== null && typeof libraryCLowering !== 'undefined') {
    target.libraryCLowering = libraryCLowering
  }

  const libraryCClassFormatExpression = nullableString(source.libraryCClassFormatExpression)
  if (libraryCClassFormatExpression !== null && typeof libraryCClassFormatExpression !== 'undefined') {
    target.libraryCClassFormatExpression = libraryCClassFormatExpression
  }

  const libraryCallbackLifetime = nullableString(source.libraryCallbackLifetime)
  if (libraryCallbackLifetime !== null && typeof libraryCallbackLifetime !== 'undefined') {
    target.libraryCallbackLifetime = libraryCallbackLifetime
  }

  copyStringMetadataArray(target, source, 'libraryCArgumentAdapters')
  copyStringMetadataArray(target, source, 'libraryCArgumentKinds')
  copyStringMetadataArray(target, source, 'libraryCArgumentMethodNames')
  copyStringMetadataArray(target, source, 'libraryCResultShapeFields')
  copyMetadataArray(target, source, 'libraryCArgumentSources')

  const arrayElementTypeId = nullableString(source.arrayElementTypeId)
  if (arrayElementTypeId !== null && typeof arrayElementTypeId !== 'undefined') {
    target.arrayElementTypeId = arrayElementTypeId
  }

  const libraryCppType = nullableString(source.libraryCppType)
  if (libraryCppType !== null && typeof libraryCppType !== 'undefined') {
    target.libraryCppType = libraryCppType
  }

  const libraryConstantValue = nullableString(source.libraryConstantValue)
  if (libraryConstantValue !== null && typeof libraryConstantValue !== 'undefined') {
    target.libraryConstantValue = libraryConstantValue
  }

  if (source.libraryOwned === true) {
    target.libraryOwned = true
  }

  if (source.templatePlaceholder === true) {
    target.templatePlaceholder = true
  }

  copyStringMetadataArray(target, source, 'libraryRuntimeRequirements')
  copyStringMetadataArray(target, source, 'libraryCapabilities')
  copyStringMetadataArray(target, source, 'narrowingTrueNames')
  copyStringMetadataArray(target, source, 'narrowingFalseNames')

  const numericCast = nullableString(source.numericCast)
  if (numericCast !== null && typeof numericCast !== 'undefined') {
    target.numericCast = numericCast
  }

  const returnType = nullableString(source.returnType)
  if (returnType !== null && typeof returnType !== 'undefined') {
    target.returnType = returnType
  }

  const declaredReturnType = nullableString(source.declaredReturnType)
  if (declaredReturnType !== null && typeof declaredReturnType !== 'undefined') {
    target.declaredReturnType = declaredReturnType
  }

  if (source.returnNullable === true) {
    target.returnNullable = true
  }

  const returnPromiseValueType = nullableString(source.returnPromiseValueType)
  if (returnPromiseValueType !== null && typeof returnPromiseValueType !== 'undefined') {
    target.returnPromiseValueType = returnPromiseValueType
  }

  const promiseRejectionValueType = nullableString(source.promiseRejectionValueType)
  if (promiseRejectionValueType !== null && typeof promiseRejectionValueType !== 'undefined') {
    target.promiseRejectionValueType = promiseRejectionValueType
  }

  const promiseRejectionIntrinsicRole = nullableString(source.promiseRejectionIntrinsicRole)
  if (promiseRejectionIntrinsicRole !== null && typeof promiseRejectionIntrinsicRole !== 'undefined') {
    target.promiseRejectionIntrinsicRole = promiseRejectionIntrinsicRole
  }

  const returnShape = nullableNode(source.returnShape)
  if (returnShape !== null && typeof returnShape !== 'undefined') {
    target.returnShape = returnShape
  }

  return target
}

function copyStringMetadataArray(target: LowerExpressionNode, source: LowerExpressionNode, field: string): void {
  const values = source[field]

  if (!Array.isArray(values)) {
    return
  }

  const copied: string[] = []

  for (let index = 0; index < values.length; index = index + 1) {
    copied.push(values[index])
  }

  target[field] = copied
}

function copyMetadataArray(target: LowerExpressionNode, source: LowerExpressionNode, field: string): void {
  const values = source[field]

  if (!Array.isArray(values)) {
    return
  }

  const copied: unknown[] = []

  for (let index = 0; index < values.length; index = index + 1) {
    copied.push(values[index])
  }

  target[field] = copied
}

function cloneStringLiteral(expression: LowerExpressionNode): LowerExpressionNode {
  return copyRuntimeMetadata(
    {
      type: 'StringLiteral',
      value: expression.value,
      valueType: 'string',
      loc: expression.loc
    },
    expression
  )
}

function cloneRegExpLiteral(expression: LowerExpressionNode): LowerExpressionNode {
  const pattern = typeof expression.pattern === 'string' ? expression.pattern : ''
  const flags = typeof expression.flags === 'string' ? expression.flags : ''

  return copyRuntimeMetadata(
    {
      type: 'RegExpLiteral',
      raw: expression.raw,
      pattern,
      flags,
      args: [
        { type: 'StringLiteral', value: pattern, valueType: 'string', loc: expression.loc },
        { type: 'StringLiteral', value: flags, valueType: 'string', loc: expression.loc }
      ],
      valueType: expression.valueType,
      shape: expression.shape,
      nullable: expression.nullable === true,
      loc: expression.loc
    },
    expression
  )
}

function cloneTemplateLiteral(expression: LowerExpressionNode, context: LowerExpressionContext): LowerExpressionNode {
  let expressions: LowerExpressionNode[] = []

  if (Array.isArray(expression.expressions)) {
    expressions = lowerExpressionList(expression.expressions, context)
  }

  return copyRuntimeMetadata(
    {
      type: 'TemplateLiteral',
      raw: expression.raw,
      expressions,
      valueType: 'string',
      loc: expression.loc
    },
    expression
  )
}

function cloneNumberLiteral(expression: LowerExpressionNode): LowerExpressionNode {
  return copyRuntimeMetadata(
    {
      type: 'NumberLiteral',
      value: expression.value,
      valueType: 'number',
      loc: expression.loc
    },
    expression
  )
}

function cloneBooleanLiteral(expression: LowerExpressionNode): LowerExpressionNode {
  return copyRuntimeMetadata(
    {
      type: 'BooleanLiteral',
      value: expression.value,
      valueType: 'boolean',
      loc: expression.loc
    },
    expression
  )
}

function cloneNullLiteral(expression: LowerExpressionNode): LowerExpressionNode {
  return copyRuntimeMetadata(
    {
      type: 'NullLiteral',
      value: null,
      valueType: 'null',
      loc: expression.loc
    },
    expression
  )
}

function cloneThisExpression(expression: LowerExpressionNode): LowerExpressionNode {
  return copyRuntimeMetadata(
    {
      type: 'ThisExpression',
      valueType: 'object',
      nullable: expression.nullable === true,
      shape: nullableNode(expression.shape),
      className: nullableString(expression.className),
      loc: expression.loc
    },
    expression
  )
}

function findReferenceVariable(
  expression: LowerExpressionNode,
  context: LowerExpressionContext
): LowerExpressionNode | null {
  if (expression.path.length !== 1) {
    return null
  }

  const variable = context.variables.get(expression.path[0])

  if (variable === null || typeof variable === 'undefined') {
    return null
  }

  return variable
}

function cloneReferenceExpression(
  expression: LowerExpressionNode,
  variable: LowerExpressionNode | null
): LowerExpressionNode {
  const path = cloneReferencePath(expression.path)
  const valueType = referenceValueType(expression, variable)
  const nullable = referenceNullable(expression, variable)
  const promiseValueType = referencePromiseValueType(expression, variable)
  const functionType = referenceFunctionType(expression, variable)
  const shape = referenceShape(expression, variable)
  const className = referenceClassName(expression, variable)
  const loc = nullableNode(expression.loc)
  const target: LowerExpressionNode = {
    type: 'Reference',
    path,
    functionStorage: nullableString(expression.functionStorage),
    valueType,
    nullable,
    promiseValueType,
    functionType,
    shape,
    className,
    loc
  }
  const result = copyRuntimeMetadata(target, expression)

  if (
    (result.typeRef === null || typeof result.typeRef === 'undefined') &&
    variable !== null &&
    typeof variable !== 'undefined' &&
    variable.typeRef !== null &&
    typeof variable.typeRef === 'object'
  ) {
    result.typeRef = variable.typeRef
  }

  return result
}

function referenceNullable(expression: LowerExpressionNode, variable: LowerExpressionNode | null): boolean {
  if (typeof expression.nullable === 'boolean') {
    return expression.nullable
  }

  return referenceVariableNullable(variable)
}

function cloneReferencePath(source: string[]): string[] {
  const result: string[] = []

  for (let index = 0; index < source.length; index = index + 1) {
    result.push(source[index])
  }

  return result
}

function referenceValueType(expression: LowerExpressionNode, variable: LowerExpressionNode | null): string {
  const known = knownValueType(expression.valueType)

  if (known !== null && typeof known !== 'undefined') {
    return known
  }

  if (variable !== null && typeof variable !== 'undefined') {
    const variableValueType = nullableString(variable.valueType)

    if (variableValueType !== null && typeof variableValueType !== 'undefined') {
      return variableValueType
    }
  }

  return 'unknown'
}

function referenceVariableNullable(variable: LowerExpressionNode | null): boolean {
  return variable !== null && typeof variable !== 'undefined' && variable.nullable === true
}

function referencePromiseValueType(
  expression: LowerExpressionNode,
  variable: LowerExpressionNode | null
): string | null {
  const expressionPromiseValueType = nullableString(expression.promiseValueType)

  if (expressionPromiseValueType !== null && typeof expressionPromiseValueType !== 'undefined') {
    return expressionPromiseValueType
  }

  if (variable !== null && typeof variable !== 'undefined') {
    const variablePromiseValueType = nullableString(variable.promiseValueType)

    if (variablePromiseValueType !== null && typeof variablePromiseValueType !== 'undefined') {
      return variablePromiseValueType
    }
  }

  return null
}

function referenceClassName(expression: LowerExpressionNode, variable: LowerExpressionNode | null): string | null {
  const expressionClassName = nullableString(expression.className)

  if (expressionClassName !== null && typeof expressionClassName !== 'undefined') {
    return expressionClassName
  }

  if (variable !== null && typeof variable !== 'undefined') {
    const variableClassName = nullableString(variable.className)

    if (variableClassName !== null && typeof variableClassName !== 'undefined') {
      return variableClassName
    }
  }

  return null
}

function referenceFunctionType(
  expression: LowerExpressionNode,
  variable: LowerExpressionNode | null
): LowerExpressionNode | null {
  if (expression.functionType !== null && typeof expression.functionType !== 'undefined') {
    return expression.functionType
  }

  if (variable !== null && typeof variable !== 'undefined') {
    if (variable.functionType !== null && typeof variable.functionType !== 'undefined') {
      return variable.functionType
    }
  }

  return null
}

function referenceShape(
  expression: LowerExpressionNode,
  variable: LowerExpressionNode | null
): LowerExpressionNode | null {
  if (expression.shape !== null && typeof expression.shape !== 'undefined') {
    return expression.shape
  }

  if (variable !== null && typeof variable !== 'undefined') {
    if (variable.shape !== null && typeof variable.shape !== 'undefined') {
      return variable.shape
    }
  }

  return null
}

function memberExpressionValueType(expression: LowerExpressionNode, object: LowerExpressionNode): string {
  const known = knownValueType(expression.valueType)

  if (known !== null && typeof known !== 'undefined') {
    return known
  }

  return inferMemberExpressionType(expression.property, object)
}

function indexExpressionValueType(
  expression: LowerExpressionNode,
  object: LowerExpressionNode,
  context: LowerExpressionContext
): string {
  const known = knownValueType(expression.valueType)

  if (known !== null && typeof known !== 'undefined') {
    return known
  }

  return inferIndexExpressionType(object, context)
}

function cloneMemberExpression(
  expression: LowerExpressionNode,
  object: LowerExpressionNode,
  valueType: string
): LowerExpressionNode {
  const isLengthProperty = expression.property === 'length'
  let promiseValueType: string | null = null
  let functionType: LowerExpressionNode | null = null
  let shape: LowerExpressionNode | null = null
  let className: string | null = null
  let collectionKind: string | null = null

  if (!isLengthProperty) {
    promiseValueType = nullableString(expression.promiseValueType)
    functionType = nullableNode(expression.functionType)
    shape = nullableNode(expression.shape)
    className = nullableString(expression.className)
    collectionKind = nullableString(expression.collectionKind)
  }

  const target: LowerExpressionNode = {
    type: expression.type,
    object,
    property: expression.property,
    valueType,
    nullable: expression.nullable === true,
    promiseValueType,
    functionType,
    shape,
    className,
    collectionKind,
    loc: expression.loc
  }

  return copyRuntimeMetadata(target, expression)
}

function cloneIndexExpression(
  expression: LowerExpressionNode,
  object: LowerExpressionNode,
  index: LowerExpressionNode,
  valueType: string
): LowerExpressionNode {
  return copyRuntimeMetadata(
    {
      type: expression.type,
      object,
      index,
      valueType,
      nullable: expression.nullable === true,
      collectionKind: nullableString(expression.collectionKind),
      promiseValueType: nullableString(expression.promiseValueType),
      functionType: nullableNode(expression.functionType),
      shape: nullableNode(expression.shape),
      className: nullableString(expression.className),
      loc: expression.loc
    },
    expression
  )
}

function cloneCallExpression(
  expression: LowerExpressionNode,
  callee: LowerExpressionNode,
  args: LowerExpressionNode[],
  valueType: string
): LowerExpressionNode {
  const shape = callExpressionShape(expression, callee, valueType)
  const target: LowerExpressionNode = {
    type: expression.type,
    callee,
    args,
    valueType,
    nullable: expression.nullable === true,
    promiseValueType: nullableString(expression.promiseValueType),
    functionType: nullableNode(expression.functionType),
    shape,
    className: nullableString(expression.className),
    collectionKind: nullableString(expression.collectionKind),
    loc: expression.loc
  }
  const result = copyRuntimeMetadata(target, expression)

  return result
}

function callExpressionShape(
  expression: LowerExpressionNode,
  callee: LowerExpressionNode,
  valueType: string
): LowerExpressionNode | null {
  const expressionShape = nullableNode(expression.shape)

  if (expressionShape !== null && typeof expressionShape !== 'undefined') {
    return expressionShape
  }

  return null
}

function cloneAwaitExpression(
  expression: LowerExpressionNode,
  argument: LowerExpressionNode,
  valueType: string
): LowerExpressionNode {
  const shape = awaitExpressionShape(expression, argument, valueType)

  return copyRuntimeMetadata(
    {
      type: 'AwaitExpression',
      argument,
      valueType,
      nullable: expression.nullable === true,
      promiseValueType: nullableString(expression.promiseValueType),
      functionType: nullableNode(expression.functionType),
      shape,
      className: nullableString(expression.className),
      collectionKind: nullableString(expression.collectionKind),
      loc: expression.loc
    },
    expression
  )
}

function awaitExpressionShape(
  expression: LowerExpressionNode,
  argument: LowerExpressionNode,
  valueType: string
): LowerExpressionNode | null {
  const expressionShape = nullableNode(expression.shape)

  if (expressionShape !== null && typeof expressionShape !== 'undefined') {
    return expressionShape
  }

  if (valueType === 'object') {
    return nullableNode(argument.shape)
  }

  return null
}

function cloneArrowFunctionExpression(
  expression: LowerExpressionNode,
  body: LowerExpressionNode | LowerExpressionNode[]
): LowerExpressionNode {
  const functionType = arrowFunctionType(expression, body)
  const hasBindingDeclarations = arrowBindingDeclarations(expression).length > 0

  return copyRuntimeMetadata(
    {
      type: 'ArrowFunctionExpression',
      async: expression.async === true,
      params: expression.params,
      body,
      expressionBody: expression.expressionBody === true && !hasBindingDeclarations,
      valueType: 'function',
      nullable: expression.nullable === true,
      functionType,
      shape: nullableNode(expression.shape),
      loc: expression.loc
    },
    expression
  )
}

function lowerArrowFunctionBody(
  expression: LowerExpressionNode,
  context: LowerExpressionContext
): LowerExpressionNode | LowerExpressionNode[] {
  const bindingDeclarations = arrowBindingDeclarations(expression)

  if (expression.expressionBody === true) {
    const body = lowerExpressionWithContext(expression.body, context)

    if (bindingDeclarations.length === 0) {
      return body
    }

    bindingDeclarations.push({
      type: 'ReturnStatement',
      argument: body,
      loc: expression.loc
    })
    return bindingDeclarations
  }

  const body: LowerExpressionNode[] = bindingDeclarations

  for (const statement of expression.body) {
    body.push(lowerBlockBodyStatement(statement, context))
  }

  return body
}

function arrowBindingDeclarations(expression: LowerExpressionNode): LowerExpressionNode[] {
  const declarations: LowerExpressionNode[] = []

  for (const param of expression.params) {
    const bindingElements: ArrayBindingElement[] = param.bindingElements ?? []

    for (const binding of bindingElements) {
      declarations.push({
        type: 'VariableDeclaration',
        kind: 'const',
        exported: false,
        name: binding.name,
        loc: binding.loc,
        declaredType: binding.declaredType ?? null,
        inferredDeclaredType: binding.declaredType ?? binding.valueType ?? 'unknown',
        valueType: fallbackString(binding.valueType, 'unknown'),
        typeRef: nullableNode(binding.typeRef),
        nullable: binding.nullable === true,
        promiseValueType: nullableString(binding.promiseValueType),
        functionType: nullableNode(binding.functionType),
        shape: nullableNode(binding.shape),
        init: {
          type: 'IndexExpression',
          object: {
            type: 'Reference',
            path: [param.name],
            loc: param.loc,
            valueType: fallbackString(param.valueType, 'array'),
            typeRef: nullableNode(param.typeRef)
          },
          index: {
            type: 'NumberLiteral',
            value: `${binding.index}`,
            loc: binding.loc,
            valueType: 'number'
          },
          loc: binding.loc,
          valueType: fallbackString(binding.valueType, 'unknown'),
          typeRef: nullableNode(binding.typeRef),
          nullable: binding.nullable === true,
          promiseValueType: nullableString(binding.promiseValueType),
          functionType: nullableNode(binding.functionType),
          shape: nullableNode(binding.shape)
        }
      })
    }
  }

  return declarations
}

function arrowFunctionType(
  expression: LowerExpressionNode,
  body: LowerExpressionNode | LowerExpressionNode[]
): LowerExpressionNode | null {
  const existing = nullableNode(expression.functionType)

  if (existing !== null && typeof existing !== 'undefined') {
    return existing
  }

  const returnType = arrowFunctionReturnType(expression, body)

  if (returnType === null || typeof returnType === 'undefined') {
    return null
  }

  const params: LowerExpressionNode[] = []

  for (const param of expression.params) {
    params.push(param)
  }

  return {
    kind: 'function',
    params,
    returnType,
    returnTypeRef: nullableNode(expression.returnTypeRef),
    returnNullable: arrowFunctionReturnNullable(expression, body),
    returnPromiseValueType: arrowFunctionReturnStringMetadata(expression, body, 'promiseValueType'),
    returnShape: arrowFunctionReturnShape(expression, body)
  }
}

function arrowFunctionReturnType(
  expression: LowerExpressionNode,
  body: LowerExpressionNode | LowerExpressionNode[]
): string | null {
  const declared = nullableString(expression.returnType)

  if (declared !== null && typeof declared !== 'undefined') {
    return declared
  }

  if (!Array.isArray(body)) {
    return nullableString(body.valueType)
  }

  return null
}

function arrowFunctionReturnNullable(
  expression: LowerExpressionNode,
  body: LowerExpressionNode | LowerExpressionNode[]
): boolean {
  if (expression.returnNullable === true) {
    return true
  }

  return !Array.isArray(body) && body.nullable === true
}

function arrowFunctionReturnStringMetadata(
  expression: LowerExpressionNode,
  body: LowerExpressionNode | LowerExpressionNode[],
  key: string
): string | null {
  const expressionValue = nullableString(expression[key])

  if (expressionValue !== null && typeof expressionValue !== 'undefined') {
    return expressionValue
  }

  if (!Array.isArray(body)) {
    return nullableString(body[key])
  }

  return null
}

function arrowFunctionReturnShape(
  expression: LowerExpressionNode,
  body: LowerExpressionNode | LowerExpressionNode[]
): LowerExpressionNode | null {
  const expressionShape = nullableNode(expression.returnShape)

  if (expressionShape !== null && typeof expressionShape !== 'undefined') {
    return expressionShape
  }

  if (!Array.isArray(body)) {
    return nullableNode(body.shape)
  }

  return null
}

function cloneAssignmentExpression(
  expression: LowerExpressionNode,
  target: LowerExpressionNode,
  value: LowerExpressionNode
): LowerExpressionNode {
  return copyRuntimeMetadata(
    {
      type: 'AssignmentExpression',
      target,
      value,
      valueType: fallbackString(value.valueType, 'unknown'),
      nullable: expression.nullable === true,
      promiseValueType: nullableString(expression.promiseValueType),
      functionType: nullableNode(expression.functionType),
      shape: nullableNode(expression.shape),
      className: nullableString(expression.className),
      loc: expression.loc
    },
    expression
  )
}

function cloneUpdateExpression(expression: LowerExpressionNode, argument: LowerExpressionNode): LowerExpressionNode {
  return copyRuntimeMetadata(
    {
      type: 'UpdateExpression',
      operator: expression.operator,
      argument,
      prefix: expression.prefix === true,
      valueType: 'number',
      nullable: expression.nullable === true,
      loc: expression.loc
    },
    expression
  )
}

function cloneBinaryExpression(
  expression: LowerExpressionNode,
  left: LowerExpressionNode,
  right: LowerExpressionNode,
  valueType: string
): LowerExpressionNode {
  return copyRuntimeMetadata(
    {
      type: 'BinaryExpression',
      operator: expression.operator,
      left,
      right,
      valueType,
      nullable: expression.nullable === true,
      promiseValueType: nullableString(expression.promiseValueType),
      functionType: nullableNode(expression.functionType),
      shape: nullableNode(expression.shape),
      className: nullableString(expression.className),
      loc: expression.loc
    },
    expression
  )
}

function cloneConditionalExpression(
  expression: LowerExpressionNode,
  test: LowerExpressionNode,
  consequent: LowerExpressionNode,
  alternate: LowerExpressionNode,
  valueType: string
): LowerExpressionNode {
  return copyRuntimeMetadata(
    {
      type: 'ConditionalExpression',
      test,
      consequent,
      alternate,
      valueType,
      nullable: expression.nullable === true || consequent.nullable === true || alternate.nullable === true,
      promiseValueType: commonNullableString(consequent.promiseValueType, alternate.promiseValueType),
      functionType: nullableNode(expression.functionType),
      shape: nullableNode(expression.shape),
      className: commonNullableString(consequent.className, alternate.className),
      loc: expression.loc
    },
    expression
  )
}

function cloneUnaryExpression(
  expression: LowerExpressionNode,
  argument: LowerExpressionNode,
  valueType: string
): LowerExpressionNode {
  return copyRuntimeMetadata(
    {
      type: 'UnaryExpression',
      operator: expression.operator,
      argument,
      valueType,
      nullable: expression.nullable === true,
      promiseValueType: nullableString(expression.promiseValueType),
      functionType: nullableNode(expression.functionType),
      shape: nullableNode(expression.shape),
      className: nullableString(expression.className),
      loc: expression.loc
    },
    expression
  )
}

function unaryExpressionValueType(expression: LowerExpressionNode): string {
  if (expression.operator === 'typeof') {
    return 'string'
  }

  if (expression.operator === '!') {
    return 'boolean'
  }

  return 'number'
}

function lowerExpressionList(
  expressions: LowerExpressionNode[],
  context: LowerExpressionContext
): LowerExpressionNode[] {
  const lowered: LowerExpressionNode[] = []

  for (let index = 0; index < expressions.length; index = index + 1) {
    const expression = expressions[index]
    const loweredExpression = lowerExpressionWithContext(expression, context)

    lowered.push(loweredExpression)
  }

  return lowered
}

function cloneArrayLiteralExpression(
  expression: LowerExpressionNode,
  elements: LowerExpressionNode[]
): LowerExpressionNode {
  return copyRuntimeMetadata(
    {
      type: 'ArrayLiteral',
      elements,
      valueType: 'array',
      nullable: expression.nullable === true,
      loc: expression.loc
    },
    expression
  )
}

function lowerObjectProperties(
  properties: LowerExpressionNode[],
  context: LowerExpressionContext
): LowerExpressionNode[] {
  const lowered: LowerExpressionNode[] = []

  for (const property of properties) {
    lowered.push(cloneObjectProperty(property, lowerExpressionWithContext(property.value, context)))
  }

  return lowered
}

function cloneObjectProperty(property: LowerExpressionNode, value: LowerExpressionNode): LowerExpressionNode {
  const cloned: LowerExpressionNode = {
    key: property.key,
    value,
    loc: property.loc
  }

  if (property.spread === true) {
    cloned.spread = true
  }

  return cloned
}

function cloneObjectLiteralExpression(
  expression: LowerExpressionNode,
  properties: LowerExpressionNode[]
): LowerExpressionNode {
  return copyRuntimeMetadata(
    {
      type: 'ObjectLiteral',
      properties,
      valueType: 'object',
      nullable: expression.nullable === true,
      promiseValueType: nullableString(expression.promiseValueType),
      functionType: nullableNode(expression.functionType),
      shape: nullableNode(expression.shape),
      className: nullableString(expression.className),
      loc: expression.loc
    },
    expression
  )
}

function cloneUnknownExpression(expression: LowerExpressionNode): LowerExpressionNode {
  return copyRuntimeMetadata(
    {
      type: expression.type,
      valueType: 'unknown',
      nullable: expression.nullable === true,
      loc: expression.loc
    },
    expression
  )
}

function lowerBlockBodyStatement(statement: LowerExpressionNode, context: LowerExpressionContext): LowerExpressionNode {
  if (context.lowerStatement === null || typeof context.lowerStatement === 'undefined') {
    return statement
  }

  return context.lowerStatement(statement, context)
}

function inferBinaryExpressionType(operator: string, left: LowerExpressionNode, right: LowerExpressionNode): string {
  if (isBooleanBinaryOperator(operator)) {
    return 'boolean'
  }

  if (operator === '??') {
    return inferNullishBinaryExpressionType(left, right)
  }

  if (operator === '+' && (left.valueType === 'string' || right.valueType === 'string')) {
    return 'string'
  }

  return 'number'
}

function callExpressionValueType(expression: LowerExpressionNode, callee: LowerExpressionNode): string {
  const known = knownCallExpressionValueType(expression.valueType)

  if (known !== null && typeof known !== 'undefined') {
    return known
  }

  const functionType = nullableNode(callee.functionType)

  if (functionType !== null && typeof functionType !== 'undefined') {
    const returnType = nullableString(functionType.returnType)

    if (returnType !== null && typeof returnType !== 'undefined') {
      return returnType
    }
  }

  return fallbackString(expression.valueType, 'unknown')
}

function knownCallExpressionValueType(value: string | null | undefined): string | null {
  const known = nullableString(value)

  if (known !== null && typeof known !== 'undefined' && known !== 'unknown') {
    return known
  }

  return null
}

function isBooleanBinaryOperator(operator: string): boolean {
  if (operator === '===' || operator === '!==') {
    return true
  }

  if (operator === '<' || operator === '<=' || operator === '>' || operator === '>=') {
    return true
  }

  return operator === '&&' || operator === '||'
}

function inferNullishBinaryExpressionType(left: LowerExpressionNode, right: LowerExpressionNode): string {
  const leftType = fallbackString(left.valueType, 'unknown')
  const rightType = fallbackString(right.valueType, 'unknown')

  if (leftType === 'null' || leftType === 'unknown') {
    return rightType
  }

  if (rightType === 'null' || rightType === 'unknown' || rightType === leftType) {
    return leftType
  }

  return 'unknown'
}

function inferConditionalExpressionType(consequent: LowerExpressionNode, alternate: LowerExpressionNode): string {
  const consequentType = fallbackString(consequent.valueType, 'unknown')
  const alternateType = fallbackString(alternate.valueType, 'unknown')

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

function commonNullableString(left: string | null | undefined, right: string | null | undefined): string | null {
  const leftValue = nullableString(left)
  const rightValue = nullableString(right)

  if (leftValue !== null && typeof leftValue !== 'undefined' && leftValue === rightValue) {
    return leftValue
  }

  return null
}

function inferMemberExpressionType(property: string, object: LowerExpressionNode): string {
  if (property === 'length' && (object.valueType === 'array' || object.valueType === 'string')) {
    return 'number'
  }

  return 'unknown'
}

function inferIndexExpressionType(object: LowerExpressionNode, context: LowerExpressionContext): string {
  if (object.valueType === 'array') {
    return (
      typeRefIterableElementValueType(
        object.typeRef as TypeRef | null | undefined,
        context.libraries
      ) ?? 'unknown'
    )
  }

  if (object.valueType === 'string') {
    return 'string'
  }

  return 'unknown'
}

function knownValueType(valueType: string | null | undefined): string | null {
  if (valueType === null || typeof valueType === 'undefined' || valueType.length === 0 || valueType === 'unknown') {
    return null
  }

  return valueType
}
