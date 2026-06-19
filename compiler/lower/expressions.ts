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
    return cloneCallExpression(
      expression,
      lowerExpressionWithContext(expression.callee, context),
      lowerExpressionList(expression.args, context),
      fallbackString(expression.valueType, 'unknown')
    )
  }

  if (expression.type === 'CallExpression') {
    return cloneCallExpression(
      expression,
      lowerExpressionWithContext(expression.callee, context),
      lowerExpressionList(expression.args, context),
      fallbackString(expression.valueType, 'unknown')
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

  if (declared.arrayElementType !== null && typeof declared.arrayElementType !== 'undefined') {
    arrayElementType = declared.arrayElementType
  }

  if (declared.arrayElementDeclaredType !== null && typeof declared.arrayElementDeclaredType !== 'undefined') {
    arrayElementDeclaredType = declared.arrayElementDeclaredType
  }

  if (declared.mapKeyType !== null && typeof declared.mapKeyType !== 'undefined') {
    mapKeyType = declared.mapKeyType
  }

  if (declared.mapValueType !== null && typeof declared.mapValueType !== 'undefined') {
    mapValueType = declared.mapValueType
  }

  if (declared.promiseValueType !== null && typeof declared.promiseValueType !== 'undefined') {
    promiseValueType = declared.promiseValueType
  }

  if (declared.setElementType !== null && typeof declared.setElementType !== 'undefined') {
    setElementType = declared.setElementType
  }

  if (declared.shape !== null && typeof declared.shape !== 'undefined') {
    shape = declared.shape
  }

  if (declared.functionType !== null && typeof declared.functionType !== 'undefined') {
    functionType = declared.functionType
  }

  if (declared.valueType !== null && typeof declared.valueType !== 'undefined') {
    valueType = declared.valueType
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
  if (value !== null && typeof value !== 'undefined') {
    return value
  }

  return fallback
}

function nullableString(value: string | null | undefined): string | null {
  if (value !== null && typeof value !== 'undefined') {
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

  if (
    variable !== null &&
    typeof variable !== 'undefined' &&
    variable.valueType !== null &&
    typeof variable.valueType !== 'undefined'
  ) {
    return variable.valueType
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
  if (expression.arrayElementType !== null && typeof expression.arrayElementType !== 'undefined') {
    return expression.arrayElementType
  }

  if (variable !== null && typeof variable !== 'undefined') {
    if (variable.arrayElementType !== null && typeof variable.arrayElementType !== 'undefined') {
      return variable.arrayElementType
    }
  }

  return null
}

function referenceArrayElementDeclaredType(
  expression: LowerExpressionNode,
  variable: LowerExpressionNode | null
): string | null {
  if (expression.arrayElementDeclaredType !== null && typeof expression.arrayElementDeclaredType !== 'undefined') {
    return expression.arrayElementDeclaredType
  }

  if (variable !== null && typeof variable !== 'undefined') {
    if (variable.arrayElementDeclaredType !== null && typeof variable.arrayElementDeclaredType !== 'undefined') {
      return variable.arrayElementDeclaredType
    }
  }

  return null
}

function referenceMapKeyType(expression: LowerExpressionNode, variable: LowerExpressionNode | null): string | null {
  if (expression.mapKeyType !== null && typeof expression.mapKeyType !== 'undefined') {
    return expression.mapKeyType
  }

  if (variable !== null && typeof variable !== 'undefined') {
    if (variable.mapKeyType !== null && typeof variable.mapKeyType !== 'undefined') {
      return variable.mapKeyType
    }
  }

  return null
}

function referenceMapValueType(expression: LowerExpressionNode, variable: LowerExpressionNode | null): string | null {
  if (expression.mapValueType !== null && typeof expression.mapValueType !== 'undefined') {
    return expression.mapValueType
  }

  if (variable !== null && typeof variable !== 'undefined') {
    if (variable.mapValueType !== null && typeof variable.mapValueType !== 'undefined') {
      return variable.mapValueType
    }
  }

  return null
}

function referencePromiseValueType(
  expression: LowerExpressionNode,
  variable: LowerExpressionNode | null
): string | null {
  if (expression.promiseValueType !== null && typeof expression.promiseValueType !== 'undefined') {
    return expression.promiseValueType
  }

  if (variable !== null && typeof variable !== 'undefined') {
    if (variable.promiseValueType !== null && typeof variable.promiseValueType !== 'undefined') {
      return variable.promiseValueType
    }
  }

  return null
}

function referenceSetElementType(expression: LowerExpressionNode, variable: LowerExpressionNode | null): string | null {
  if (expression.setElementType !== null && typeof expression.setElementType !== 'undefined') {
    return expression.setElementType
  }

  if (variable !== null && typeof variable !== 'undefined') {
    if (variable.setElementType !== null && typeof variable.setElementType !== 'undefined') {
      return variable.setElementType
    }
  }

  return null
}

function referenceClassName(expression: LowerExpressionNode, variable: LowerExpressionNode | null): string | null {
  if (expression.className !== null && typeof expression.className !== 'undefined') {
    return expression.className
  }

  if (variable !== null && typeof variable !== 'undefined') {
    if (variable.className !== null && typeof variable.className !== 'undefined') {
      return variable.className
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
  return copyRuntimeMetadata(
    {
      type: 'ArrowFunctionExpression',
      async: expression.async === true,
      params: expression.params,
      body,
      expressionBody: expression.expressionBody === true,
      valueType: 'function',
      nullable: expression.nullable === true,
      functionType: nullableNode(expression.functionType),
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
  if (valueType === null || typeof valueType === 'undefined' || valueType === 'unknown') {
    return null
  }

  return valueType
}
