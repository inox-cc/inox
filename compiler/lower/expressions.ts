import type { AnyNode } from '../types.ts'
import type { LowerContext, LowerResolvedType } from './type-resolution.ts'
import { resolveDeclaredType } from './type-resolution.ts'

type LowerExpressionNode = AnyNode

export type LowerStatementFn = (statement: LowerExpressionNode, context: LowerContext) => LowerExpressionNode

export type LowerExpressionContext = LowerContext & {
  lowerStatement?: LowerStatementFn
}

export function lowerExpression(expression: LowerExpressionNode, context: LowerExpressionContext): LowerExpressionNode {
  return lowerExpressionWithContext(expression, context)
}

function lowerExpressionWithContext(
  expression: LowerExpressionNode,
  context: LowerExpressionContext
): LowerExpressionNode {
  if (expression.type === 'StringLiteral') {
    return cloneStringLiteral(expression)
  }

  if (expression.type === 'TemplateLiteral') {
    return cloneTemplateLiteral(expression)
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
    return cloneReferenceExpression(expression, findReferenceVariable(expression, context))
  }

  if (expression.type === 'MemberExpression') {
    const object = lowerExpressionWithContext(expression.object, context)

    return cloneMemberExpression(expression, object, memberExpressionValueType(expression, object))
  }

  if (expression.type === 'IndexExpression') {
    const object = lowerExpressionWithContext(expression.object, context)

    return cloneIndexExpression(
      expression,
      object,
      lowerExpressionWithContext(expression.index, context),
      indexExpressionValueType(expression, object)
    )
  }

  if (expression.type === 'OptionalMemberExpression') {
    return cloneMemberExpression(
      expression,
      lowerExpressionWithContext(expression.object, context),
      fallbackString(expression.valueType, 'unknown')
    )
  }

  if (expression.type === 'OptionalIndexExpression') {
    return cloneIndexExpression(
      expression,
      lowerExpressionWithContext(expression.object, context),
      lowerExpressionWithContext(expression.index, context),
      fallbackString(expression.valueType, 'unknown')
    )
  }

  if (expression.type === 'OptionalCallExpression') {
    const callee = lowerExpressionWithContext(expression.callee, context)

    return cloneCallExpression(
      expression,
      callee,
      lowerExpressionList(expression.args, context),
      callExpressionValueType(expression, callee)
    )
  }

  if (expression.type === 'CallExpression') {
    const callee = lowerExpressionWithContext(expression.callee, context)

    return cloneCallExpression(
      expression,
      callee,
      lowerExpressionList(expression.args, context),
      callExpressionValueType(expression, callee)
    )
  }

  if (expression.type === 'NewExpression') {
    return cloneCallExpression(
      expression,
      lowerExpressionWithContext(expression.callee, context),
      lowerExpressionList(expression.args, context),
      fallbackString(expression.valueType, 'object')
    )
  }

  if (expression.type === 'AwaitExpression') {
    return cloneAwaitExpression(
      expression,
      lowerExpressionWithContext(expression.argument, context),
      fallbackString(expression.valueType, 'unknown')
    )
  }

  if (expression.type === 'ArrowFunctionExpression') {
    return cloneArrowFunctionExpression(expression, lowerArrowFunctionBody(expression, context))
  }

  if (expression.type === 'AssignmentExpression') {
    const value = lowerExpressionWithContext(expression.value, context)

    return cloneAssignmentExpression(expression, lowerExpressionWithContext(expression.target, context), value)
  }

  if (expression.type === 'UpdateExpression') {
    return cloneUpdateExpression(expression, lowerExpressionWithContext(expression.argument, context))
  }

  if (expression.type === 'BinaryExpression') {
    const left = lowerExpressionWithContext(expression.left, context)
    const right = lowerExpressionWithContext(expression.right, context)

    return cloneBinaryExpression(expression, left, right, inferBinaryExpressionType(expression.operator, left, right))
  }

  if (expression.type === 'ConditionalExpression') {
    const consequent = lowerExpressionWithContext(expression.consequent, context)
    const alternate = lowerExpressionWithContext(expression.alternate, context)

    return cloneConditionalExpression(
      expression,
      lowerExpressionWithContext(expression.test, context),
      consequent,
      alternate,
      inferConditionalExpressionType(consequent, alternate)
    )
  }

  if (expression.type === 'UnaryExpression') {
    return cloneUnaryExpression(
      expression,
      lowerExpressionWithContext(expression.argument, context),
      unaryExpressionValueType(expression)
    )
  }

  if (expression.type === 'ArrayLiteral') {
    const elements = lowerExpressionList(expression.elements, context)
    const elementType = commonArrayElementTypeFromElements(elements)

    return cloneArrayLiteralExpression(
      expression,
      elements,
      elementType,
      arrayLiteralDeclaredElementType(expression, elementType)
    )
  }

  if (expression.type === 'ObjectLiteral') {
    return cloneObjectLiteralExpression(expression, lowerObjectProperties(expression.properties, context))
  }

  return cloneUnknownExpression(expression)
}

function lowerTypeAssertionExpression(
  expression: LowerExpressionNode,
  context: LowerExpressionContext
): LowerExpressionNode {
  const lowered = lowerExpressionWithContext(expression.expression, context)
  let declaredType: string = expression.valueType
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
  let arrayElementType = expression.arrayElementType
  let arrayElementDeclaredType = expression.arrayElementDeclaredType
  let mapKeyType = expression.mapKeyType
  let mapValueType = expression.mapValueType
  let promiseValueType = expression.promiseValueType
  let setElementType = expression.setElementType
  let shape = expression.shape
  let functionType = expression.functionType
  let valueType = expression.valueType

  const declaredArrayElementType = nullableString(declared.arrayElementType)

  if (declaredArrayElementType !== null && typeof declaredArrayElementType !== 'undefined') {
    arrayElementType = declaredArrayElementType
  }

  const declaredArrayElementDeclaredType = nullableString(declared.arrayElementDeclaredType)

  if (declaredArrayElementDeclaredType !== null && typeof declaredArrayElementDeclaredType !== 'undefined') {
    arrayElementDeclaredType = declaredArrayElementDeclaredType
  }

  const declaredMapKeyType = nullableString(declared.mapKeyType)

  if (declaredMapKeyType !== null && typeof declaredMapKeyType !== 'undefined') {
    mapKeyType = declaredMapKeyType
  }

  const declaredMapValueType = nullableString(declared.mapValueType)

  if (declaredMapValueType !== null && typeof declaredMapValueType !== 'undefined') {
    mapValueType = declaredMapValueType
  }

  const declaredPromiseValueType = nullableString(declared.promiseValueType)

  if (declaredPromiseValueType !== null && typeof declaredPromiseValueType !== 'undefined') {
    promiseValueType = declaredPromiseValueType
  }

  const declaredSetElementType = nullableString(declared.setElementType)

  if (declaredSetElementType !== null && typeof declaredSetElementType !== 'undefined') {
    setElementType = declaredSetElementType
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
  expression.arrayElementType = arrayElementType
  expression.arrayElementDeclaredType = arrayElementDeclaredType
  expression.mapKeyType = mapKeyType
  expression.mapValueType = mapValueType
  expression.promiseValueType = promiseValueType
  expression.setElementType = setElementType
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
  target.binaryRuntimeMethod = nullableString(source.binaryRuntimeMethod)
  target.bufferRuntimeConstant = nullableString(source.bufferRuntimeConstant)
  target.childProcessRuntimeMethod = nullableString(source.childProcessRuntimeMethod)
  target.cryptoHashDigestEncoding = nullableString(source.cryptoHashDigestEncoding)
  target.cryptoRuntimeMethod = nullableString(source.cryptoRuntimeMethod)
  target.debugRuntimeMethod = nullableString(source.debugRuntimeMethod)
  target.fetchRuntimeMethod = nullableString(source.fetchRuntimeMethod)
  target.fsRuntimeConstant = nullableString(source.fsRuntimeConstant)
  target.fsRuntimeMethod = nullableString(source.fsRuntimeMethod)
  target.jsonRuntimeMethod = nullableString(source.jsonRuntimeMethod)
  target.mathRuntimeMethod = nullableString(source.mathRuntimeMethod)
  target.osRuntimeConstant = nullableString(source.osRuntimeConstant)
  target.osRuntimeMethod = nullableString(source.osRuntimeMethod)
  target.objectRuntimeMethod = nullableString(source.objectRuntimeMethod)
  target.pathRuntimeConstant = nullableString(source.pathRuntimeConstant)
  target.pathRuntimeMethod = nullableString(source.pathRuntimeMethod)
  target.processRuntimeEnvName = nullableString(source.processRuntimeEnvName)
  target.processRuntimeMethod = nullableString(source.processRuntimeMethod)
  target.processRuntimeProperty = nullableString(source.processRuntimeProperty)
  target.stringRuntimeMethod = nullableString(source.stringRuntimeMethod)
  target.timerRuntimeMethod = nullableString(source.timerRuntimeMethod)
  target.urlRuntimeField = nullableString(source.urlRuntimeField)
  target.urlRuntimeMethod = nullableString(source.urlRuntimeMethod)
  target.numericCast = nullableString(source.numericCast)
  target.returnType = nullableString(source.returnType)
  target.declaredReturnType = nullableString(source.declaredReturnType)
  target.returnNullable = source.returnNullable === true
  target.returnArrayElementType = nullableString(source.returnArrayElementType)
  target.returnMapKeyType = nullableString(source.returnMapKeyType)
  target.returnMapValueType = nullableString(source.returnMapValueType)
  target.returnPromiseValueType = nullableString(source.returnPromiseValueType)
  target.returnSetElementType = nullableString(source.returnSetElementType)

  if (source.fsRecursive === true) {
    target.fsRecursive = true
  }

  if (source.fsForce === true) {
    target.fsForce = true
  }

  return target
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

function cloneTemplateLiteral(expression: LowerExpressionNode): LowerExpressionNode {
  return copyRuntimeMetadata(
    {
      type: 'TemplateLiteral',
      raw: expression.raw,
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
  return copyRuntimeMetadata(
    {
      type: 'Reference',
      path: expression.path,
      valueType: referenceValueType(expression, variable),
      nullable: expression.nullable === true || referenceVariableNullable(variable),
      arrayElementType: referenceArrayElementType(expression, variable),
      arrayElementDeclaredType: referenceArrayElementDeclaredType(expression, variable),
      mapKeyType: referenceMapKeyType(expression, variable),
      mapValueType: referenceMapValueType(expression, variable),
      promiseValueType: referencePromiseValueType(expression, variable),
      setElementType: referenceSetElementType(expression, variable),
      functionType: referenceFunctionType(expression, variable),
      shape: referenceShape(expression, variable),
      className: referenceClassName(expression, variable),
      loc: expression.loc
    },
    expression
  )
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

function referenceArrayElementType(
  expression: LowerExpressionNode,
  variable: LowerExpressionNode | null
): string | null {
  const expressionArrayElementType = nullableString(expression.arrayElementType)

  if (expressionArrayElementType !== null && typeof expressionArrayElementType !== 'undefined') {
    return expressionArrayElementType
  }

  if (variable !== null && typeof variable !== 'undefined') {
    const variableArrayElementType = nullableString(variable.arrayElementType)

    if (variableArrayElementType !== null && typeof variableArrayElementType !== 'undefined') {
      return variableArrayElementType
    }
  }

  return null
}

function referenceArrayElementDeclaredType(
  expression: LowerExpressionNode,
  variable: LowerExpressionNode | null
): string | null {
  const expressionArrayElementDeclaredType = nullableString(expression.arrayElementDeclaredType)

  if (expressionArrayElementDeclaredType !== null && typeof expressionArrayElementDeclaredType !== 'undefined') {
    return expressionArrayElementDeclaredType
  }

  if (variable !== null && typeof variable !== 'undefined') {
    const variableArrayElementDeclaredType = nullableString(variable.arrayElementDeclaredType)

    if (variableArrayElementDeclaredType !== null && typeof variableArrayElementDeclaredType !== 'undefined') {
      return variableArrayElementDeclaredType
    }
  }

  return null
}

function referenceMapKeyType(expression: LowerExpressionNode, variable: LowerExpressionNode | null): string | null {
  const expressionMapKeyType = nullableString(expression.mapKeyType)

  if (expressionMapKeyType !== null && typeof expressionMapKeyType !== 'undefined') {
    return expressionMapKeyType
  }

  if (variable !== null && typeof variable !== 'undefined') {
    const variableMapKeyType = nullableString(variable.mapKeyType)

    if (variableMapKeyType !== null && typeof variableMapKeyType !== 'undefined') {
      return variableMapKeyType
    }
  }

  return null
}

function referenceMapValueType(expression: LowerExpressionNode, variable: LowerExpressionNode | null): string | null {
  const expressionMapValueType = nullableString(expression.mapValueType)

  if (expressionMapValueType !== null && typeof expressionMapValueType !== 'undefined') {
    return expressionMapValueType
  }

  if (variable !== null && typeof variable !== 'undefined') {
    const variableMapValueType = nullableString(variable.mapValueType)

    if (variableMapValueType !== null && typeof variableMapValueType !== 'undefined') {
      return variableMapValueType
    }
  }

  return null
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

function referenceSetElementType(expression: LowerExpressionNode, variable: LowerExpressionNode | null): string | null {
  const expressionSetElementType = nullableString(expression.setElementType)

  if (expressionSetElementType !== null && typeof expressionSetElementType !== 'undefined') {
    return expressionSetElementType
  }

  if (variable !== null && typeof variable !== 'undefined') {
    const variableSetElementType = nullableString(variable.setElementType)

    if (variableSetElementType !== null && typeof variableSetElementType !== 'undefined') {
      return variableSetElementType
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

function indexExpressionValueType(expression: LowerExpressionNode, object: LowerExpressionNode): string {
  const known = knownValueType(expression.valueType)

  if (known !== null && typeof known !== 'undefined') {
    return known
  }

  return inferIndexExpressionType(object)
}

function cloneMemberExpression(
  expression: LowerExpressionNode,
  object: LowerExpressionNode,
  valueType: string
): LowerExpressionNode {
  return copyRuntimeMetadata(
    {
      type: expression.type,
      object,
      property: expression.property,
      valueType,
      nullable: expression.nullable === true,
      arrayElementType: nullableString(expression.arrayElementType),
      arrayElementDeclaredType: nullableString(expression.arrayElementDeclaredType),
      mapKeyType: nullableString(expression.mapKeyType),
      mapValueType: nullableString(expression.mapValueType),
      promiseValueType: nullableString(expression.promiseValueType),
      setElementType: nullableString(expression.setElementType),
      functionType: nullableNode(expression.functionType),
      shape: nullableNode(expression.shape),
      className: nullableString(expression.className),
      collectionKind: nullableString(expression.collectionKind),
      loc: expression.loc
    },
    expression
  )
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
      arrayElementType: nullableString(expression.arrayElementType),
      arrayElementDeclaredType: nullableString(expression.arrayElementDeclaredType),
      mapKeyType: nullableString(expression.mapKeyType),
      mapValueType: nullableString(expression.mapValueType),
      promiseValueType: nullableString(expression.promiseValueType),
      setElementType: nullableString(expression.setElementType),
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
  return copyRuntimeMetadata(
    {
      type: expression.type,
      callee,
      args,
      valueType,
      nullable: expression.nullable === true,
      arrayElementType: nullableString(expression.arrayElementType),
      arrayElementDeclaredType: nullableString(expression.arrayElementDeclaredType),
      mapKeyType: nullableString(expression.mapKeyType),
      mapValueType: nullableString(expression.mapValueType),
      promiseValueType: nullableString(expression.promiseValueType),
      setElementType: nullableString(expression.setElementType),
      functionType: nullableNode(expression.functionType),
      shape: nullableNode(expression.shape),
      className: nullableString(expression.className),
      collectionKind: nullableString(expression.collectionKind),
      loc: expression.loc
    },
    expression
  )
}

function cloneAwaitExpression(
  expression: LowerExpressionNode,
  argument: LowerExpressionNode,
  valueType: string
): LowerExpressionNode {
  return copyRuntimeMetadata(
    {
      type: 'AwaitExpression',
      argument,
      valueType,
      nullable: expression.nullable === true,
      arrayElementType: nullableString(expression.arrayElementType),
      arrayElementDeclaredType: nullableString(expression.arrayElementDeclaredType),
      mapKeyType: nullableString(expression.mapKeyType),
      mapValueType: nullableString(expression.mapValueType),
      promiseValueType: nullableString(expression.promiseValueType),
      setElementType: nullableString(expression.setElementType),
      functionType: nullableNode(expression.functionType),
      shape: nullableNode(expression.shape),
      className: nullableString(expression.className),
      collectionKind: nullableString(expression.collectionKind),
      loc: expression.loc
    },
    expression
  )
}

function cloneArrowFunctionExpression(
  expression: LowerExpressionNode,
  body: LowerExpressionNode | LowerExpressionNode[]
): LowerExpressionNode {
  const functionType = arrowFunctionType(expression, body)

  return copyRuntimeMetadata(
    {
      type: 'ArrowFunctionExpression',
      async: expression.async === true,
      params: expression.params,
      body,
      expressionBody: expression.expressionBody === true,
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
  if (expression.expressionBody === true) {
    return lowerExpressionWithContext(expression.body, context)
  }

  const body: LowerExpressionNode[] = []

  for (const statement of expression.body) {
    body.push(lowerBlockBodyStatement(statement, context))
  }

  return body
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
    returnNullable: arrowFunctionReturnNullable(expression, body),
    returnArrayElementType: arrowFunctionReturnStringMetadata(expression, body, 'arrayElementType'),
    returnArrayElementDeclaredType: arrowFunctionReturnStringMetadata(expression, body, 'arrayElementDeclaredType'),
    returnMapKeyType: arrowFunctionReturnStringMetadata(expression, body, 'mapKeyType'),
    returnMapValueType: arrowFunctionReturnStringMetadata(expression, body, 'mapValueType'),
    returnPromiseValueType: arrowFunctionReturnStringMetadata(expression, body, 'promiseValueType'),
    returnSetElementType: arrowFunctionReturnStringMetadata(expression, body, 'setElementType'),
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
      arrayElementType: nullableString(expression.arrayElementType),
      arrayElementDeclaredType: nullableString(expression.arrayElementDeclaredType),
      mapKeyType: nullableString(expression.mapKeyType),
      mapValueType: nullableString(expression.mapValueType),
      promiseValueType: nullableString(expression.promiseValueType),
      setElementType: nullableString(expression.setElementType),
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
      arrayElementType: nullableString(expression.arrayElementType),
      arrayElementDeclaredType: nullableString(expression.arrayElementDeclaredType),
      mapKeyType: nullableString(expression.mapKeyType),
      mapValueType: nullableString(expression.mapValueType),
      promiseValueType: nullableString(expression.promiseValueType),
      setElementType: nullableString(expression.setElementType),
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
      arrayElementType: commonNullableString(consequent.arrayElementType, alternate.arrayElementType),
      arrayElementDeclaredType: commonNullableString(
        consequent.arrayElementDeclaredType,
        alternate.arrayElementDeclaredType
      ),
      mapKeyType: commonNullableString(consequent.mapKeyType, alternate.mapKeyType),
      mapValueType: commonNullableString(consequent.mapValueType, alternate.mapValueType),
      promiseValueType: commonNullableString(consequent.promiseValueType, alternate.promiseValueType),
      setElementType: commonNullableString(consequent.setElementType, alternate.setElementType),
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
      arrayElementType: nullableString(expression.arrayElementType),
      arrayElementDeclaredType: nullableString(expression.arrayElementDeclaredType),
      mapKeyType: nullableString(expression.mapKeyType),
      mapValueType: nullableString(expression.mapValueType),
      promiseValueType: nullableString(expression.promiseValueType),
      setElementType: nullableString(expression.setElementType),
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

  for (const expression of expressions) {
    lowered.push(lowerExpressionWithContext(expression, context))
  }

  return lowered
}

function cloneArrayLiteralExpression(
  expression: LowerExpressionNode,
  elements: LowerExpressionNode[],
  arrayElementType: string,
  arrayElementDeclaredType: string
): LowerExpressionNode {
  return copyRuntimeMetadata(
    {
      type: 'ArrayLiteral',
      elements,
      valueType: 'array',
      nullable: expression.nullable === true,
      arrayElementType,
      arrayElementDeclaredType,
      mapKeyType: nullableString(expression.mapKeyType),
      mapValueType: nullableString(expression.mapValueType),
      promiseValueType: nullableString(expression.promiseValueType),
      setElementType: nullableString(expression.setElementType),
      functionType: nullableNode(expression.functionType),
      shape: nullableNode(expression.shape),
      className: nullableString(expression.className),
      loc: expression.loc
    },
    expression
  )
}

function arrayLiteralDeclaredElementType(expression: LowerExpressionNode, elementType: string): string {
  if (expression.arrayElementDeclaredType !== null && typeof expression.arrayElementDeclaredType !== 'undefined') {
    return expression.arrayElementDeclaredType
  }

  return elementType
}

function commonArrayElementTypeFromElements(elements: LowerExpressionNode[]): string {
  let first: string | null = null

  for (const element of elements) {
    const valueType = fallbackString(element.valueType, 'unknown')

    if (first === null || typeof first === 'undefined') {
      first = valueType
    } else if (valueType !== first) {
      return 'unknown'
    }
  }

  if (first === null || typeof first === 'undefined') {
    return 'unknown'
  }

  return first
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
  return {
    key: property.key,
    value,
    loc: property.loc
  }
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
      arrayElementType: nullableString(expression.arrayElementType),
      arrayElementDeclaredType: nullableString(expression.arrayElementDeclaredType),
      mapKeyType: nullableString(expression.mapKeyType),
      mapValueType: nullableString(expression.mapValueType),
      promiseValueType: nullableString(expression.promiseValueType),
      setElementType: nullableString(expression.setElementType),
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
  if (left.valueType === 'null' || left.valueType === 'unknown') {
    return fallbackString(right.valueType, 'unknown')
  }

  return fallbackString(left.valueType, 'unknown')
}

function inferConditionalExpressionType(consequent: LowerExpressionNode, alternate: LowerExpressionNode): string {
  const consequentType = fallbackString(consequent.valueType, 'unknown')
  const alternateType = fallbackString(alternate.valueType, 'unknown')

  if (consequentType === alternateType) {
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

function inferIndexExpressionType(object: LowerExpressionNode): string {
  if (object.valueType === 'array') {
    return fallbackString(object.arrayElementType, 'unknown')
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
