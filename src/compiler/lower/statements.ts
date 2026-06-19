import type { AnyNode } from '../types.ts'
import { lowerExpression } from './expressions.ts'
import type { LowerExpressionContext } from './expressions.ts'
import { resolveDeclaredType } from './type-resolution.ts'
import type { LowerContext, LowerResolvedType } from './type-resolution.ts'

type LowerNode = AnyNode
type LoweredStatement = LowerNode[]

type ArrayMethodReceiverExpansion = {
  statements: LowerNode[]
  receiver: LowerNode
}

type ArrayExpressionHoist = {
  statements: LowerNode[]
  expression: LowerNode
}

type ArrayMethodExpressionList = {
  statements: LowerNode[]
  expressions: LowerNode[]
}

type InferredMapType = {
  key: string | null
  value: string | null
}

export function lowerStatement(statement: LowerNode, context: LowerContext): LowerNode {
  return lowerStatementBody(statement, context)
}

export function lowerStatementList(statements: LowerNode[], context: LowerContext): LowerNode[] {
  const lowered: LowerNode[] = []

  for (const statement of statements) {
    appendLoweredStatement(lowered, lowerStatementInternal(statement, context))
  }

  return lowered
}

function lowerStatementInternal(statement: LowerNode, context: LowerContext): LoweredStatement {
  if (statement.type === 'BlockStatement') {
    return [
      {
        type: 'BlockStatement',
        body: lowerStatementList(statement.body, context)
      }
    ]
  }

  if (statement.type === 'IfStatement') {
    return [
      {
        type: 'IfStatement',
        condition: lowerStatementExpression(statement.condition, context),
        consequent: lowerStatementBody(statement.consequent, context),
        alternate: lowerOptionalStatementBody(statement.alternate, context),
        loc: statement.loc
      }
    ]
  }

  if (statement.type === 'WhileStatement') {
    return [
      {
        type: 'WhileStatement',
        condition: lowerStatementExpression(statement.condition, context),
        body: lowerStatementBody(statement.body, context),
        loc: statement.loc
      }
    ]
  }

  if (statement.type === 'ForStatement') {
    return [
      {
        type: 'ForStatement',
        init: lowerOptionalForInitializer(statement.init, context),
        test: lowerOptionalStatementExpression(statement.test, context),
        update: lowerOptionalStatementExpression(statement.update, context),
        body: lowerStatementBody(statement.body, context),
        loc: statement.loc
      }
    ]
  }

  if (statement.type === 'ForOfStatement') {
    return [
      {
        type: 'ForOfStatement',
        kind: statement.kind,
        name: statement.name,
        declaredType: statement.declaredType,
        inferredDeclaredType: statement.inferredDeclaredType,
        valueType: statement.valueType,
        nullable: statement.nullable === true,
        arrayElementType: nullableString(statement.arrayElementType),
        arrayElementDeclaredType: nullableString(statement.arrayElementDeclaredType),
        mapKeyType: nullableString(statement.mapKeyType),
        mapValueType: nullableString(statement.mapValueType),
        promiseValueType: nullableString(statement.promiseValueType),
        setElementType: nullableString(statement.setElementType),
        functionType: nullableNode(statement.functionType),
        shape: nullableNode(statement.shape),
        loc: statement.loc,
        nameLoc: statement.nameLoc,
        iterable: lowerStatementExpression(statement.iterable, context),
        body: lowerStatementBody(statement.body, context)
      }
    ]
  }

  if (statement.type === 'SwitchStatement') {
    return [
      {
        type: 'SwitchStatement',
        discriminant: lowerStatementExpression(statement.discriminant, context),
        cases: lowerSwitchCases(statement.cases, context),
        loc: statement.loc
      }
    ]
  }

  if (statement.type === 'TryStatement') {
    return [
      {
        type: 'TryStatement',
        block: lowerStatementBody(statement.block, context),
        handler: lowerCatchClause(statement.handler, context),
        finalizer: lowerOptionalStatementBody(statement.finalizer, context),
        loc: statement.loc
      }
    ]
  }

  if (statement.type === 'BreakStatement' || statement.type === 'ContinueStatement') {
    return [statement]
  }

  if (statement.type === 'VariableDeclaration') {
    return lowerVariableDeclaration(statement, context, true)
  }

  if (statement.type === 'ExpressionStatement') {
    const expression = lowerStatementExpression(statement.expression, context)
    const hoisted = lowerArrayMethodSubexpressions(expression, context, false)

    if (hoisted != null) {
      declareLoweredTopLevelVariables(context, hoisted.statements)

      return prependLoweredStatements(hoisted.statements, {
        type: 'ExpressionStatement',
        expression: hoisted.expression
      })
    }

    return [
      {
        type: 'ExpressionStatement',
        expression
      }
    ]
  }

  if (statement.type === 'ReturnStatement') {
    const argument = lowerOptionalStatementExpression(statement.argument, context)
    let hoisted: ArrayExpressionHoist | null = null

    if (argument != null) {
      hoisted = lowerArrayMethodSubexpressions(argument, context)
    }

    if (hoisted != null) {
      declareLoweredTopLevelVariables(context, hoisted.statements)

      return prependLoweredStatements(hoisted.statements, {
        type: 'ReturnStatement',
        argument: hoisted.expression,
        loc: statement.loc
      })
    }

    return [
      {
        type: 'ReturnStatement',
        argument,
        loc: statement.loc
      }
    ]
  }

  if (statement.type === 'ThrowStatement') {
    return [
      {
        type: 'ThrowStatement',
        argument: lowerStatementExpression(statement.argument, context),
        loc: statement.loc
      }
    ]
  }

  return [statement]
}

function lowerOptionalStatementBody(
  statement: LowerNode | null | undefined,
  context: LowerContext
): LowerNode | null {
  if (statement == null) {
    return null
  }

  return lowerStatementBody(statement, context)
}

function lowerOptionalStatementExpression(
  expression: LowerNode | null | undefined,
  context: LowerContext
): LowerNode | null {
  if (expression == null) {
    return null
  }

  return lowerStatementExpression(expression, context)
}

function lowerOptionalForInitializer(
  init: LowerNode | null | undefined,
  context: LowerContext
): LowerNode | null {
  if (init == null) {
    return null
  }

  return lowerForInitializer(init, context)
}

function lowerSwitchCases(cases: LowerNode[], context: LowerContext): LowerNode[] {
  const lowered: LowerNode[] = []

  for (const item of cases) {
    lowered.push({
      type: 'SwitchCase',
      test: lowerOptionalStatementExpression(item.test, context),
      consequent: lowerStatementList(item.consequent, context),
      loc: item.loc
    })
  }

  return lowered
}

function prependLoweredStatements(prefix: LowerNode[], statement: LowerNode): LowerNode[] {
  const statements: LowerNode[] = []

  for (const item of prefix) {
    statements.push(item)
  }

  statements.push(statement)

  return statements
}

function fallbackString(value: string | null | undefined, fallback: string): string {
  if (value != null) {
    return value
  }

  return fallback
}

function nullableString(value: string | null | undefined): string | null {
  if (value != null) {
    return value
  }

  return null
}

function nullableNode(value: LowerNode | null | undefined): LowerNode | null {
  if (value != null) {
    return value
  }

  return null
}

function arrayHoistExpression(value: ArrayExpressionHoist | null, fallback: LowerNode): LowerNode {
  if (value != null) {
    return value.expression
  }

  return fallback
}

function lowerNameEquals(left: string, right: string): boolean {
  return left === right
}

function lowerNameDiffers(left: string, right: string): boolean {
  return !lowerNameEquals(left, right)
}

export function lowerParam(param: LowerNode, context: LowerContext): LowerNode {
  let declaredType: string = param.valueType
  const paramDeclaredType = param.declaredType

  if (paramDeclaredType != null) {
    declaredType = paramDeclaredType
  }

  const declared = resolveDeclaredType(declaredType, context)
  const promiseValueType = nullableString(declared.promiseValueType)
  const loweredParam: LowerNode = {
    name: param.name,
    loc: param.loc,
    declaredType,
    optional: param.optional === true,
    valueType: fallbackString(declared.valueType, param.valueType),
    nullable: declared.nullable,
    arrayElementType: declared.arrayElementType,
    arrayElementDeclaredType: declared.arrayElementDeclaredType,
    mapKeyType: declared.mapKeyType,
    mapValueType: declared.mapValueType,
    promiseValueType,
    setElementType: declared.setElementType,
    functionType: declared.functionType,
    shape: declared.shape
  }

  if (param.defaultValue != null) {
    loweredParam.defaultValue = lowerExpression(param.defaultValue, context)
  }

  return loweredParam
}

function lowerForInitializer(init: LowerNode, context: LowerContext): LowerNode {
  if (init.type === 'VariableDeclaration') {
    const lowered = lowerVariableDeclaration(init, context, false)

    if (lowered.length > 0) {
      return lowered[0]
    }

    return init
  }

  return lowerStatementExpression(init, context)
}

function lowerStatementBody(statement: LowerNode, context: LowerContext): LowerNode {
  const lowered = lowerStatementInternal(statement, context)

  if (lowered.length === 1) {
    return lowered[0]
  }

  return {
    type: 'BlockStatement',
    body: lowered,
    loc: statement.loc
  }
}

function lowerCatchClause(handler: LowerNode | null | undefined, context: LowerContext): LowerNode | null {
  if (handler == null) {
    return null
  }

  let previous: LowerNode | null = null
  let hadPrevious = false

  if (handler.param != null) {
    hadPrevious = context.variables.has(handler.param)

    if (hadPrevious) {
      const found = context.variables.get(handler.param)

      if (found != null) {
        previous = found
      }
    }

    context.variables.set(handler.param, {
      valueType: 'unknown',
      nullable: false,
      shape: null
    })
  }

  const body = lowerStatementBody(handler.body, context)

  if (handler.param != null) {
    if (hadPrevious && previous != null) {
      context.variables.set(handler.param, previous)
    } else {
      context.variables.delete(handler.param)
    }
  }

  return {
    type: 'CatchClause',
    param: nullableString(handler.param),
    paramLoc: nullableNode(handler.paramLoc),
    loc: handler.loc,
    body
  }
}

function appendLoweredStatement(out: LowerNode[], statements: LoweredStatement): void {
  for (const statement of statements) {
    out.push(statement)
  }
}

function lowerVariableDeclaration(
  statement: LowerNode,
  context: LowerContext,
  allowArrayMethodExpansion: boolean
): LoweredStatement {
  const init = lowerOptionalStatementExpression(statement.init, context)
  const declared = resolveDeclaredType(statement.declaredType, context)
  const inferredMapType = inferMapType(init)
  const nullable = variableDeclarationNullable(declared, init)
  const shape = variableDeclarationShape(declared, statement, init)
  const functionType = variableDeclarationFunctionType(declared, statement, init)
  const arrayElementType = variableDeclarationArrayElementType(declared, statement, init)
  const arrayElementDeclaredType = variableDeclarationArrayElementDeclaredType(declared, statement, init)
  const mapKeyType = variableDeclarationMapKeyType(declared, inferredMapType)
  const mapValueType = variableDeclarationMapValueType(declared, inferredMapType)
  const promiseValueType = variableDeclarationPromiseValueType(declared, statement, init)
  const setElementType = variableDeclarationSetElementType(declared, statement, init)
  const valueType = variableDeclarationValueType(declared, statement, init)
  const lowered: LowerNode = {
    type: 'VariableDeclaration',
    kind: statement.kind,
    exported: statement.exported,
    name: statement.name,
    loc: statement.loc,
    declaredType: statement.declaredType,
    nullable,
    shape,
    functionType,
    arrayElementType,
    arrayElementDeclaredType,
    mapKeyType,
    mapValueType,
    promiseValueType,
    setElementType,
    valueType,
    init
  }

  if (!allowArrayMethodExpansion || statement.exported === true || init == null) {
    declareLowerVariable(context, lowered)
    return [lowered]
  }

  const expanded = lowerArrayMethodVariableDeclaration(lowered, init, context)

  if (expanded == null) {
    const hoisted = lowerArrayMethodSubexpressions(init, context)

    if (hoisted != null) {
      const declaration = cloneVariableDeclarationWithInit(lowered, hoisted.expression)

      declareLoweredTopLevelVariables(context, hoisted.statements)
      declareLowerVariable(context, declaration)

      return prependLoweredStatements(hoisted.statements, declaration)
    }

    declareLowerVariable(context, lowered)
    return [lowered]
  }

  declareLoweredTopLevelVariables(context, expanded)

  return expanded
}

function variableDeclarationNullable(declared: LowerResolvedType, init: LowerNode | null): boolean {
  if (declared.nullable) {
    return true
  }

  if (init != null && init.nullable === true) {
    return true
  }

  return false
}

function variableDeclarationShape(
  declared: LowerResolvedType,
  statement: LowerNode,
  init: LowerNode | null
): LowerNode | null {
  if (declared.shape != null) {
    return declared.shape
  }

  if (init != null && init.shape != null) {
    return init.shape
  }

  if (statement.shape != null) {
    return statement.shape
  }

  return null
}

function variableDeclarationFunctionType(
  declared: LowerResolvedType,
  statement: LowerNode,
  init: LowerNode | null
): LowerNode | null {
  if (declared.functionType != null) {
    return declared.functionType
  }

  if (statement.functionType != null) {
    return statement.functionType
  }

  if (init != null && init.functionType != null) {
    return init.functionType
  }

  return null
}

function variableDeclarationArrayElementType(
  declared: LowerResolvedType,
  statement: LowerNode,
  init: LowerNode | null
): string | null {
  if (declared.arrayElementType != null) {
    return declared.arrayElementType
  }

  if (statement.arrayElementType != null) {
    return statement.arrayElementType
  }

  return inferArrayElementType(init)
}

function variableDeclarationArrayElementDeclaredType(
  declared: LowerResolvedType,
  statement: LowerNode,
  init: LowerNode | null
): string | null {
  if (declared.arrayElementDeclaredType != null) {
    return declared.arrayElementDeclaredType
  }

  if (statement.arrayElementDeclaredType != null) {
    return statement.arrayElementDeclaredType
  }

  return inferArrayElementDeclaredType(init)
}

function variableDeclarationMapKeyType(
  declared: LowerResolvedType,
  inferredMapType: InferredMapType | null
): string | null {
  if (declared.mapKeyType != null) {
    return declared.mapKeyType
  }

  if (inferredMapType != null && inferredMapType.key != null) {
    return inferredMapType.key
  }

  return null
}

function variableDeclarationMapValueType(
  declared: LowerResolvedType,
  inferredMapType: InferredMapType | null
): string | null {
  if (declared.mapValueType != null) {
    return declared.mapValueType
  }

  if (inferredMapType != null && inferredMapType.value != null) {
    return inferredMapType.value
  }

  return null
}

function variableDeclarationPromiseValueType(
  declared: LowerResolvedType,
  statement: LowerNode,
  init: LowerNode | null
): string | null {
  if (declared.promiseValueType != null) {
    return declared.promiseValueType
  }

  if (statement.promiseValueType != null) {
    return statement.promiseValueType
  }

  return inferPromiseValueType(init)
}

function variableDeclarationSetElementType(
  declared: LowerResolvedType,
  statement: LowerNode,
  init: LowerNode | null
): string | null {
  if (declared.setElementType != null) {
    return declared.setElementType
  }

  if (statement.setElementType != null) {
    return statement.setElementType
  }

  return inferSetElementType(init)
}

function variableDeclarationValueType(
  declared: LowerResolvedType,
  statement: LowerNode,
  init: LowerNode | null
): string {
  const declaredValueType = declared.valueType

  if (declaredValueType != null) {
    return declaredValueType
  }

  const statementValueType = statement.valueType

  if (statementValueType != null) {
    return statementValueType
  }

  const statementDeclaredType = statement.declaredType

  if (statementDeclaredType != null) {
    return statementDeclaredType
  }

  if (init != null) {
    const initValueType = init.valueType

    if (initValueType != null) {
      return initValueType
    }
  }

  return 'unknown'
}

function cloneVariableDeclarationWithInit(statement: LowerNode, init: LowerNode): LowerNode {
  return {
    type: 'VariableDeclaration',
    kind: statement.kind,
    exported: statement.exported,
    name: statement.name,
    loc: statement.loc,
    declaredType: statement.declaredType,
    nullable: statement.nullable === true,
    shape: nullableNode(statement.shape),
    functionType: nullableNode(statement.functionType),
    arrayElementType: nullableString(statement.arrayElementType),
    arrayElementDeclaredType: nullableString(statement.arrayElementDeclaredType),
    mapKeyType: nullableString(statement.mapKeyType),
    mapValueType: nullableString(statement.mapValueType),
    promiseValueType: nullableString(statement.promiseValueType),
    setElementType: nullableString(statement.setElementType),
    valueType: fallbackString(statement.valueType, 'unknown'),
    className: nullableString(statement.className),
    init
  }
}

function declareLowerVariable(context: LowerContext, statement: LowerNode): void {
  if (statement.type !== 'VariableDeclaration') {
    return
  }

  context.variables.set(statement.name, {
    valueType: fallbackString(statement.valueType, 'unknown'),
    nullable: statement.nullable === true,
    arrayElementType: nullableString(statement.arrayElementType),
    arrayElementDeclaredType: nullableString(statement.arrayElementDeclaredType),
    mapKeyType: nullableString(statement.mapKeyType),
    mapValueType: nullableString(statement.mapValueType),
    promiseValueType: nullableString(statement.promiseValueType),
    setElementType: nullableString(statement.setElementType),
    functionType: nullableNode(statement.functionType),
    shape: nullableNode(statement.shape),
    className: nullableString(statement.className)
  })
}

function declareLoweredTopLevelVariables(context: LowerContext, statements: LowerNode[]): void {
  for (const statement of statements) {
    if (statement.type === 'VariableDeclaration') {
      declareLowerVariable(context, statement)
    }
  }
}

function lowerArrayMethodVariableDeclaration(
  statement: LowerNode,
  init: LowerNode,
  context: LowerContext
): LowerNode[] | null {
  if (!isArrayMethodExpansionCall(init)) {
    return null
  }

  const receiver = lowerArrayMethodReceiver(init.callee.object, context)

  if (receiver == null) {
    return null
  }

  const expandedInit: LowerNode = {
    type: fallbackString(init.type, 'CallExpression'),
    callee: replaceMemberObject(init.callee, receiver.receiver),
    args: init.args,
    valueType: init.valueType,
    nullable: init.nullable === true,
    arrayElementType: nullableString(init.arrayElementType),
    arrayElementDeclaredType: nullableString(init.arrayElementDeclaredType),
    mapKeyType: nullableString(init.mapKeyType),
    mapValueType: nullableString(init.mapValueType),
    promiseValueType: nullableString(init.promiseValueType),
    setElementType: nullableString(init.setElementType),
    functionType: nullableNode(init.functionType),
    shape: nullableNode(init.shape),
    loc: init.loc
  }
  let expanded: LowerNode[] | null = null

  if (init.callee.property === 'filter') {
    expanded = lowerArrayFilterVariableDeclaration(statement, expandedInit, context)
  } else if (init.callee.property === 'find') {
    expanded = lowerArrayFindVariableDeclaration(statement, expandedInit, context)
  } else {
    expanded = lowerArrayMapVariableDeclaration(statement, expandedInit, context)
  }

  if (expanded == null) {
    return null
  }

  return concatLoweredStatements(receiver.statements, expanded)
}

function replaceMemberObject(callee: LowerNode, object: LowerNode): LowerNode {
  return {
    type: callee.type,
    object,
    property: callee.property,
    optional: callee.optional === true,
    valueType: callee.valueType,
    nullable: callee.nullable === true,
    arrayElementType: nullableString(callee.arrayElementType),
    arrayElementDeclaredType: nullableString(callee.arrayElementDeclaredType),
    mapKeyType: nullableString(callee.mapKeyType),
    mapValueType: nullableString(callee.mapValueType),
    promiseValueType: nullableString(callee.promiseValueType),
    setElementType: nullableString(callee.setElementType),
    functionType: nullableNode(callee.functionType),
    shape: nullableNode(callee.shape),
    collectionKind: nullableString(callee.collectionKind),
    loc: callee.loc
  }
}

function concatLoweredStatements(first: LowerNode[], second: LowerNode[]): LowerNode[] {
  const statements: LowerNode[] = []

  for (const item of first) {
    statements.push(item)
  }

  for (const item of second) {
    statements.push(item)
  }

  return statements
}

function lowerArrayMethodExpressionToTemp(expression: LowerNode, context: LowerContext): ArrayExpressionHoist | null {
  if (isArrayFindMethodExpansionCall(expression)) {
    return lowerArrayFindMethodExpressionToTemp(expression, context)
  }

  return lowerArrayOutputMethodExpressionToTemp(expression, context)
}

function lowerArrayOutputMethodExpressionToTemp(expression: LowerNode, context: LowerContext): ArrayExpressionHoist | null {
  if (!isArrayOutputMethodExpansionCall(expression)) {
    return null
  }

  const name = nextLowerName(context, 'inox_array_expr')
  const target = createArrayTempDeclaration(name, expression, expression.loc)
  const statements = lowerArrayMethodVariableDeclaration(target, expression, context)

  if (statements == null) {
    return null
  }

  const output = findVariableDeclaration(statements, name)

  if (output == null) {
    return null
  }

  return {
    statements,
    expression: createArrayReferenceFromDeclaration(output, expression.loc)
  }
}

function lowerArrayFindMethodExpressionToTemp(expression: LowerNode, context: LowerContext): ArrayExpressionHoist | null {
  if (!isArrayFindMethodExpansionCall(expression)) {
    return null
  }

  const name = nextLowerName(context, 'inox_find_expr')
  const target = createFindTempDeclaration(name, expression, expression.loc)
  const statements = lowerArrayMethodVariableDeclaration(target, expression, context)

  if (statements == null) {
    return null
  }

  const output = findVariableDeclaration(statements, name)

  if (output == null) {
    return null
  }

  return {
    statements,
    expression: createValueReferenceFromDeclaration(output, expression.loc)
  }
}

function lowerArrayMethodReceiver(receiver: LowerNode, context: LowerContext): ArrayMethodReceiverExpansion | null {
  if (isStableArrayReceiver(receiver)) {
    return {
      statements: [],
      receiver
    }
  }

  if (isArrayOutputMethodExpansionCall(receiver)) {
    const hoisted = lowerArrayOutputMethodExpressionToTemp(receiver, context)

    if (hoisted == null) {
      return null
    }

    return {
      statements: hoisted.statements,
      receiver: hoisted.expression
    }
  }

  if (receiver.type === 'ArrayLiteral') {
    const name = nextLowerName(context, 'inox_array_source')
    const declaration = createArrayTempDeclaration(name, receiver, receiver.loc)

    return {
      statements: [declaration],
      receiver: createArrayReferenceFromDeclaration(declaration, receiver.loc)
    }
  }

  return null
}

function lowerArrayMethodSubexpressions(
  expression: LowerNode,
  context: LowerContext,
  allowRoot?: boolean
): ArrayExpressionHoist | null {
  let root: ArrayExpressionHoist | null = null

  if (allowRoot !== false) {
    root = lowerArrayMethodExpressionToTemp(expression, context)
  }

  if (root != null) {
    return root
  }

  if (expression.type === 'ArrowFunctionExpression') {
    return null
  }

  if (expression.type === 'CallExpression' || expression.type === 'OptionalCallExpression') {
    const args = lowerArrayMethodExpressionList(expression.args, context)

    if (args == null) {
      return null
    }

    return {
      statements: args.statements,
      expression: cloneCallExpressionWithArgs(expression, args.expressions)
    }
  }

  if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
    const object = lowerArrayMethodSubexpressions(expression.object, context)

    if (object == null) {
      return null
    }

    return {
      statements: object.statements,
      expression: cloneMemberExpressionWithObject(expression, object.expression)
    }
  }

  if (expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression') {
    const object = lowerArrayMethodSubexpressions(expression.object, context)
    const index = lowerArrayMethodSubexpressions(expression.index, context)
    const statements: LowerNode[] = []
    let changed = false

    if (object != null) {
      appendLoweredHoistStatements(statements, object.statements)
      changed = true
    }

    if (index != null) {
      appendLoweredHoistStatements(statements, index.statements)
      changed = true
    }

    if (!changed) {
      return null
    }

    const objectExpression = arrayHoistExpression(object, expression.object)
    const indexExpression = arrayHoistExpression(index, expression.index)

    return {
      statements,
      expression: cloneIndexExpressionWithParts(expression, objectExpression, indexExpression)
    }
  }

  if (expression.type === 'BinaryExpression') {
    const left = lowerArrayMethodSubexpressions(expression.left, context)
    const right = lowerArrayMethodSubexpressions(expression.right, context)
    const statements: LowerNode[] = []
    let changed = false

    if (left != null) {
      appendLoweredHoistStatements(statements, left.statements)
      changed = true
    }

    if (right != null) {
      appendLoweredHoistStatements(statements, right.statements)
      changed = true
    }

    if (!changed) {
      return null
    }

    const leftExpression = arrayHoistExpression(left, expression.left)
    const rightExpression = arrayHoistExpression(right, expression.right)

    return {
      statements,
      expression: cloneBinaryExpressionWithParts(expression, leftExpression, rightExpression)
    }
  }

  if (expression.type === 'UnaryExpression' || expression.type === 'TypeAssertionExpression') {
    const operandSource = unaryOrTypeAssertionOperand(expression)
    const operand = lowerArrayMethodSubexpressions(operandSource, context)

    if (operand == null) {
      return null
    }

    return {
      statements: operand.statements,
      expression: cloneUnaryOrTypeAssertionExpressionWithOperand(expression, operand.expression)
    }
  }

  if (expression.type === 'ArrayLiteral') {
    const elements = lowerArrayMethodExpressionList(expression.elements, context)

    if (elements == null) {
      return null
    }

    return {
      statements: elements.statements,
      expression: cloneArrayLiteralWithElements(expression, elements.expressions)
    }
  }

  if (expression.type === 'ObjectLiteral') {
    const statements: LowerNode[] = []
    const properties: LowerNode[] = []
    const sourceProperties: LowerNode[] = expression.properties
    let changed = false

    for (const property of sourceProperties) {
      const hoisted = lowerArrayMethodSubexpressions(property.value, context)

      if (hoisted == null) {
        properties.push(property)
        continue
      }

      appendLoweredHoistStatements(statements, hoisted.statements)
      properties.push(cloneObjectPropertyWithValue(property, hoisted.expression))
      changed = true
    }

    if (!changed) {
      return null
    }

    return {
      statements,
      expression: cloneObjectLiteralWithProperties(expression, properties)
    }
  }

  return null
}

function cloneCallExpressionWithArgs(expression: LowerNode, args: LowerNode[]): LowerNode {
  return cloneCallExpressionWithCalleeAndArgs(expression, expression.callee, args)
}

function cloneCallExpressionWithCalleeAndArgs(expression: LowerNode, callee: LowerNode, args: LowerNode[]): LowerNode {
  return {
    type: expression.type,
    callee,
    args,
    valueType: expression.valueType,
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
  }
}

function cloneAwaitExpressionWithArgument(expression: LowerNode, argument: LowerNode): LowerNode {
  return {
    type: 'AwaitExpression',
    argument,
    valueType: expression.valueType,
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
  }
}

function cloneMemberExpressionWithObject(expression: LowerNode, object: LowerNode): LowerNode {
  return {
    type: expression.type,
    object,
    property: expression.property,
    valueType: expression.valueType,
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
  }
}

function cloneIndexExpressionWithParts(expression: LowerNode, object: LowerNode, index: LowerNode): LowerNode {
  return {
    type: expression.type,
    object,
    index,
    valueType: expression.valueType,
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
  }
}

function cloneAssignmentExpressionWithParts(expression: LowerNode, target: LowerNode, value: LowerNode): LowerNode {
  return {
    type: 'AssignmentExpression',
    target,
    value,
    valueType: expression.valueType,
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
  }
}

function cloneUpdateExpressionWithArgument(expression: LowerNode, argument: LowerNode): LowerNode {
  return {
    type: 'UpdateExpression',
    operator: expression.operator,
    argument,
    prefix: expression.prefix === true,
    valueType: expression.valueType,
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
  }
}

function cloneBinaryExpressionWithParts(expression: LowerNode, left: LowerNode, right: LowerNode): LowerNode {
  return {
    type: 'BinaryExpression',
    operator: expression.operator,
    left,
    right,
    valueType: expression.valueType,
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
  }
}

function unaryOrTypeAssertionOperand(expression: LowerNode): LowerNode {
  if (expression.type === 'TypeAssertionExpression') {
    return expression.expression
  }

  return expression.argument
}

function cloneUnaryOrTypeAssertionExpressionWithOperand(expression: LowerNode, operand: LowerNode): LowerNode {
  if (expression.type === 'TypeAssertionExpression') {
    return {
      type: 'TypeAssertionExpression',
      expression: operand,
      valueType: expression.valueType,
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
    }
  }

  return {
    type: 'UnaryExpression',
    operator: expression.operator,
    argument: operand,
    valueType: expression.valueType,
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
  }
}

function cloneArrayLiteralWithElements(expression: LowerNode, elements: LowerNode[]): LowerNode {
  return {
    type: 'ArrayLiteral',
    elements,
    valueType: expression.valueType,
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
  }
}

function cloneObjectPropertyWithValue(property: LowerNode, value: LowerNode): LowerNode {
  return {
    key: property.key,
    value,
    loc: property.loc
  }
}

function cloneObjectLiteralWithProperties(expression: LowerNode, properties: LowerNode[]): LowerNode {
  return {
    type: 'ObjectLiteral',
    properties,
    valueType: expression.valueType,
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
  }
}

function lowerArrayMethodExpressionList(
  expressions: LowerNode[],
  context: LowerContext
): ArrayMethodExpressionList | null {
  const statements: LowerNode[] = []
  const lowered: LowerNode[] = []
  let changed = false

  for (const expression of expressions) {
    const hoisted = lowerArrayMethodSubexpressions(expression, context)

    if (hoisted == null) {
      lowered.push(expression)
      continue
    }

    appendLoweredHoistStatements(statements, hoisted.statements)
    lowered.push(hoisted.expression)
    changed = true
  }

  if (!changed) {
    return null
  }

  return {
    statements,
    expressions: lowered
  }
}

function appendLoweredHoistStatements(out: LowerNode[], statements: LowerNode[]): void {
  for (const statement of statements) {
    out.push(statement)
  }
}

function isArrayMethodExpansionCall(expression: LowerNode): boolean {
  if (
    expression.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    expression.args.length !== 1
  ) {
    return false
  }

  return (
    expression.callee.property === 'filter' ||
    expression.callee.property === 'find' ||
    expression.callee.property === 'map'
  )
}

function isArrayOutputMethodExpansionCall(expression: LowerNode): boolean {
  if (!isArrayMethodExpansionCall(expression)) {
    return false
  }

  return expression.callee.property === 'filter' || expression.callee.property === 'map'
}

function isArrayFindMethodExpansionCall(expression: LowerNode): boolean {
  if (!isArrayMethodExpansionCall(expression)) {
    return false
  }

  return expression.callee.property === 'find'
}

function lowerArrayFilterVariableDeclaration(
  statement: LowerNode,
  init: LowerNode,
  context: LowerContext
): LowerNode[] | null {
  const callback = init.args[0]
  const receiver = init.callee.object
  const receiverElement = resolveReceiverElementInfo(receiver, callback, context)

  if (receiverElement.valueType === 'unknown' || receiverElement.valueType === 'void') {
    return null
  }

  const indexName = nextLowerName(context, 'inox_filter_index')
  const valueParam = arrowCallbackParam(callback, 0)
  const indexParam = arrowCallbackParam(callback, 1)
  const itemName = arrayMethodItemName(valueParam, statement.name, context, 'inox_filter_item')
  const replacements = createCallbackReplacements(valueParam, itemName, indexParam, indexName)
  let predicate: LowerNode | null = null

  if (isBooleanFilterCallback(callback)) {
    predicate = createTruthyCondition(createReference(itemName, receiverElement, receiver.loc), receiverElement.valueType)
  } else if (isArrowCallbackWithMaxParams(callback, 2)) {
    const returned = resolveSimpleArrowReturnExpression(callback)

    if (returned == null) {
      return null
    }

    predicate = replaceExpressionReferences(returned, replacements)
  }

  if (predicate == null) {
    return null
  }

  const output = createArrayMethodOutputDeclaration(
    statement,
    'filter',
    arrayMethodElementType(statement, init, receiverElement.valueType),
    arrayMethodElementDeclaredType(statement, init, receiverElement)
  )
  const loweredPredicate = lowerStatementExpression(predicate, context)
  const pushValue = createReference(itemName, receiverElement, receiver.loc)

  return createArrayLoopStatements(output, receiver, receiverElement, indexName, itemName, [
    {
      type: 'IfStatement',
      condition: loweredPredicate,
      consequent: {
        type: 'BlockStatement',
        body: [createArrayPushStatement(statement.name, statement, pushValue, init.loc)],
        loc: init.loc
      },
      alternate: null,
      loc: init.loc
    }
  ])
}

function lowerArrayFindVariableDeclaration(
  statement: LowerNode,
  init: LowerNode,
  context: LowerContext
): LowerNode[] | null {
  const callback = init.args[0]
  const receiver = init.callee.object
  const receiverElement = resolveReceiverElementInfo(receiver, callback, context)

  if (receiverElement.valueType === 'unknown' || receiverElement.valueType === 'void') {
    return null
  }

  const indexName = nextLowerName(context, 'inox_find_index')
  const valueParam = arrowCallbackParam(callback, 0)
  const indexParam = arrowCallbackParam(callback, 1)
  const itemName = arrayMethodItemName(valueParam, statement.name, context, 'inox_find_item')
  const replacements = createCallbackReplacements(valueParam, itemName, indexParam, indexName)
  let predicate: LowerNode | null = null

  if (isBooleanFilterCallback(callback)) {
    predicate = createTruthyCondition(createReference(itemName, receiverElement, receiver.loc), receiverElement.valueType)
  } else if (isArrowCallbackWithMaxParams(callback, 2)) {
    const returned = resolveSimpleArrowReturnExpression(callback)

    if (returned == null) {
      return null
    }

    predicate = replaceExpressionReferences(returned, replacements)
  }

  if (predicate == null) {
    return null
  }

  const output = createArrayFindOutputDeclaration(statement, receiverElement)
  const foundValue = createReference(itemName, receiverElement, receiver.loc)

  return createArrayFindLoopStatements(output, receiver, receiverElement, indexName, itemName, [
    {
      type: 'IfStatement',
      condition: lowerStatementExpression(predicate, context),
      consequent: {
        type: 'BlockStatement',
        body: [
          createAssignmentStatement(createNullableReference(statement.name, receiverElement, init.loc), foundValue, init.loc),
          {
            type: 'BreakStatement',
            loc: init.loc
          }
        ],
        loc: init.loc
      },
      alternate: null,
      loc: init.loc
    }
  ])
}

function lowerArrayMapVariableDeclaration(
  statement: LowerNode,
  init: LowerNode,
  context: LowerContext
): LowerNode[] | null {
  const callback = init.args[0]

  if (!isArrowCallbackWithMaxParams(callback, 2)) {
    return null
  }

  const mapped = resolveSimpleArrowReturnExpression(callback)

  if (mapped == null) {
    return null
  }

  const receiver = init.callee.object
  const receiverElement = resolveReceiverElementInfo(receiver, callback, context)

  if (receiverElement.valueType === 'unknown' || receiverElement.valueType === 'void') {
    return null
  }

  const indexName = nextLowerName(context, 'inox_map_index')
  const valueParam = arrowCallbackParam(callback, 0)
  const indexParam = arrowCallbackParam(callback, 1)
  const itemName = arrayMethodItemName(valueParam, statement.name, context, 'inox_map_item')
  const replacements = createCallbackReplacements(valueParam, itemName, indexParam, indexName)
  const mappedValue = lowerStatementExpression(replaceExpressionReferences(mapped, replacements), context)
  const mappedElementType = arrayMapElementType(statement, init, mappedValue)

  if (mappedElementType === 'unknown' || mappedElementType === 'void') {
    return null
  }

  const output = createArrayMethodOutputDeclaration(
    statement,
    'map',
    mappedElementType,
    arrayMapElementDeclaredType(statement, init, mappedElementType)
  )

  return createArrayLoopStatements(output, receiver, receiverElement, indexName, itemName, [
    createArrayPushStatement(statement.name, output, mappedValue, init.loc)
  ])
}

function arrowCallbackParam(callback: LowerNode | null | undefined, index: number): LowerNode | null {
  if (callback == null || callback.type !== 'ArrowFunctionExpression') {
    return null
  }

  if (index >= callback.params.length) {
    return null
  }

  return callback.params[index]
}

function isArrowCallbackWithMaxParams(callback: LowerNode | null | undefined, maxParams: number): boolean {
  if (callback == null || callback.type !== 'ArrowFunctionExpression') {
    return false
  }

  return callback.params.length <= maxParams
}

function arrayMethodItemName(
  valueParam: LowerNode | null,
  outputName: string,
  context: LowerContext,
  fallbackPrefix: string
): string {
  if (valueParam != null && lowerNameDiffers(valueParam.name, outputName)) {
    return valueParam.name
  }

  return nextLowerName(context, fallbackPrefix)
}

function arrayMethodElementType(statement: LowerNode, init: LowerNode, fallback: string): string {
  if (statement.arrayElementType != null) {
    return statement.arrayElementType
  }

  if (init.arrayElementType != null) {
    return init.arrayElementType
  }

  return fallback
}

function arrayMethodElementDeclaredType(
  statement: LowerNode,
  init: LowerNode,
  receiverElement: ArrayElementInfo
): string {
  if (statement.arrayElementDeclaredType != null) {
    return statement.arrayElementDeclaredType
  }

  if (init.arrayElementDeclaredType != null) {
    return init.arrayElementDeclaredType
  }

  const receiverDeclaredType = receiverElement.declaredType

  if (receiverDeclaredType != null) {
    return receiverDeclaredType
  }

  return receiverElement.valueType
}

function arrayMapElementType(statement: LowerNode, init: LowerNode, mappedValue: LowerNode): string {
  if (statement.arrayElementType != null) {
    return statement.arrayElementType
  }

  if (init.arrayElementType != null) {
    return init.arrayElementType
  }

  if (mappedValue.valueType != null) {
    return mappedValue.valueType
  }

  return 'unknown'
}

function arrayMapElementDeclaredType(statement: LowerNode, init: LowerNode, mappedElementType: string): string {
  if (statement.arrayElementDeclaredType != null) {
    return statement.arrayElementDeclaredType
  }

  if (init.arrayElementDeclaredType != null) {
    return init.arrayElementDeclaredType
  }

  return mappedElementType
}

function createArrayMethodOutputDeclaration(
  statement: LowerNode,
  loweredArrayMethodName: string,
  arrayElementType: string,
  arrayElementDeclaredType: string
): LowerNode {
  return {
    type: 'VariableDeclaration',
    kind: statement.kind,
    exported: statement.exported,
    name: statement.name,
    loc: statement.loc,
    declaredType: statement.declaredType,
    nullable: statement.nullable === true,
    shape: nullableNode(statement.shape),
    functionType: nullableNode(statement.functionType),
    arrayElementType,
    arrayElementDeclaredType,
    mapKeyType: nullableString(statement.mapKeyType),
    mapValueType: nullableString(statement.mapValueType),
    promiseValueType: nullableString(statement.promiseValueType),
    setElementType: nullableString(statement.setElementType),
    valueType: fallbackString(statement.valueType, 'array'),
    className: nullableString(statement.className),
    loweredArrayMethodName,
    init: statement.init
  }
}

function createArrayLoopStatements(
  statement: LowerNode,
  receiver: LowerNode,
  receiverElement: ArrayElementInfo,
  indexName: string,
  itemName: string,
  loopBody: LowerNode[]
): LowerNode[] {
  const output = createArrayOutputDeclaration(statement)
  const indexReference = createNumberReference(indexName, statement.loc)
  const itemIndex = createArrayIndexExpression(receiver, indexReference, receiverElement, receiver.loc)
  const itemDeclaration = createLoopItemDeclaration(itemName, itemIndex, receiverElement, receiver.loc)
  const body: LowerNode[] = [itemDeclaration]

  for (const statement of loopBody) {
    body.push(statement)
  }

  return [
    output,
    {
      type: 'ForStatement',
      init: {
        type: 'VariableDeclaration',
        kind: 'let',
        exported: false,
        name: indexName,
        loc: statement.loc,
        declaredType: null,
        nullable: false,
        shape: null,
        functionType: null,
        arrayElementType: null,
        arrayElementDeclaredType: null,
        mapKeyType: null,
        mapValueType: null,
        promiseValueType: null,
        setElementType: null,
        valueType: 'number',
        init: {
          type: 'NumberLiteral',
          value: '0',
          valueType: 'number',
          loc: statement.loc
        }
      },
      test: {
        type: 'BinaryExpression',
        operator: '<',
        left: createNumberReference(indexName, statement.loc),
        right: createArrayLengthExpression(receiver, receiver.loc),
        valueType: 'boolean',
        loc: statement.loc
      },
      update: {
        type: 'UpdateExpression',
        operator: '++',
        argument: createNumberReference(indexName, statement.loc),
        prefix: false,
        valueType: 'number',
        loc: statement.loc
      },
      body: {
        type: 'BlockStatement',
        body,
        loc: statement.loc
      },
      loc: statement.loc
    }
  ]
}

function createArrayFindLoopStatements(
  statement: LowerNode,
  receiver: LowerNode,
  receiverElement: ArrayElementInfo,
  indexName: string,
  itemName: string,
  loopBody: LowerNode[]
): LowerNode[] {
  const indexReference = createNumberReference(indexName, statement.loc)
  const itemIndex = createArrayIndexExpression(receiver, indexReference, receiverElement, receiver.loc)
  const itemDeclaration = createLoopItemDeclaration(itemName, itemIndex, receiverElement, receiver.loc)
  const body: LowerNode[] = [itemDeclaration]

  for (const statement of loopBody) {
    body.push(statement)
  }

  return [
    statement,
    {
      type: 'ForStatement',
      init: {
        type: 'VariableDeclaration',
        kind: 'let',
        exported: false,
        name: indexName,
        loc: statement.loc,
        declaredType: null,
        nullable: false,
        shape: null,
        functionType: null,
        arrayElementType: null,
        arrayElementDeclaredType: null,
        mapKeyType: null,
        mapValueType: null,
        promiseValueType: null,
        setElementType: null,
        valueType: 'number',
        init: {
          type: 'NumberLiteral',
          value: '0',
          valueType: 'number',
          loc: statement.loc
        }
      },
      test: {
        type: 'BinaryExpression',
        operator: '<',
        left: createNumberReference(indexName, statement.loc),
        right: createArrayLengthExpression(receiver, receiver.loc),
        valueType: 'boolean',
        loc: statement.loc
      },
      update: {
        type: 'UpdateExpression',
        operator: '++',
        argument: createNumberReference(indexName, statement.loc),
        prefix: false,
        valueType: 'number',
        loc: statement.loc
      },
      body: {
        type: 'BlockStatement',
        body,
        loc: statement.loc
      },
      loc: statement.loc
    }
  ]
}

type ArrayElementInfo = {
  valueType: string
  declaredType: string | null
  shape: LowerNode | null
  arrayElementType: string | null
  arrayElementDeclaredType: string | null
  mapKeyType: string | null
  mapValueType: string | null
  promiseValueType: string | null
  setElementType: string | null
  functionType: LowerNode | null
}

type Replacement = {
  name: string
  replacement: LowerNode
}

function resolveReceiverElementInfo(receiver: LowerNode, callback: LowerNode | null | undefined, context: LowerContext): ArrayElementInfo {
  const callbackParam = arrowCallbackParam(callback, 0)
  const declaredType = receiverElementDeclaredType(receiver, callbackParam)
  const declared = resolveDeclaredType(declaredType, context)
  const valueType = receiverElementValueType(receiver, callbackParam, declared)

  return {
    valueType,
    declaredType,
    shape: receiverElementShape(callbackParam, declared),
    arrayElementType: receiverElementArrayElementType(callbackParam, declared),
    arrayElementDeclaredType: receiverElementArrayElementDeclaredType(callbackParam, declared),
    mapKeyType: receiverElementMapKeyType(callbackParam, declared),
    mapValueType: receiverElementMapValueType(callbackParam, declared),
    promiseValueType: receiverElementPromiseValueType(callbackParam, declared),
    setElementType: receiverElementSetElementType(callbackParam, declared),
    functionType: receiverElementFunctionType(callbackParam, declared)
  }
}

function receiverElementDeclaredType(receiver: LowerNode, callbackParam: LowerNode | null): string | null {
  if (receiver.arrayElementDeclaredType != null) {
    return receiver.arrayElementDeclaredType
  }

  if (receiver.arrayElementType != null) {
    return receiver.arrayElementType
  }

  if (callbackParam != null) {
    if (callbackParam.declaredType != null) {
      return callbackParam.declaredType
    }
  }

  return null
}

function receiverElementValueType(
  receiver: LowerNode,
  callbackParam: LowerNode | null,
  declared: LowerResolvedType
): string {
  if (receiver.arrayElementType != null) {
    return receiver.arrayElementType
  }

  if (callbackParam != null) {
    if (callbackParam.valueType != null) {
      return callbackParam.valueType
    }
  }

  const declaredValueType = declared.valueType

  if (declaredValueType != null) {
    return declaredValueType
  }

  return 'unknown'
}

function receiverElementShape(callbackParam: LowerNode | null, declared: LowerResolvedType): LowerNode | null {
  if (callbackParam != null) {
    if (callbackParam.shape != null) {
      return callbackParam.shape
    }
  }

  return declared.shape
}

function receiverElementArrayElementType(callbackParam: LowerNode | null, declared: LowerResolvedType): string | null {
  if (callbackParam != null) {
    if (callbackParam.arrayElementType != null) {
      return callbackParam.arrayElementType
    }
  }

  if (declared.arrayElementType != null) {
    return declared.arrayElementType
  }

  return null
}

function receiverElementArrayElementDeclaredType(
  callbackParam: LowerNode | null,
  declared: LowerResolvedType
): string | null {
  if (callbackParam != null) {
    if (callbackParam.arrayElementDeclaredType != null) {
      return callbackParam.arrayElementDeclaredType
    }
  }

  if (declared.arrayElementDeclaredType != null) {
    return declared.arrayElementDeclaredType
  }

  return null
}

function receiverElementMapKeyType(callbackParam: LowerNode | null, declared: LowerResolvedType): string | null {
  if (callbackParam != null) {
    if (callbackParam.mapKeyType != null) {
      return callbackParam.mapKeyType
    }
  }

  if (declared.mapKeyType != null) {
    return declared.mapKeyType
  }

  return null
}

function receiverElementMapValueType(callbackParam: LowerNode | null, declared: LowerResolvedType): string | null {
  if (callbackParam != null) {
    if (callbackParam.mapValueType != null) {
      return callbackParam.mapValueType
    }
  }

  if (declared.mapValueType != null) {
    return declared.mapValueType
  }

  return null
}

function receiverElementPromiseValueType(callbackParam: LowerNode | null, declared: LowerResolvedType): string | null {
  if (callbackParam != null) {
    if (callbackParam.promiseValueType != null) {
      return callbackParam.promiseValueType
    }
  }

  if (declared.promiseValueType != null) {
    return declared.promiseValueType
  }

  return null
}

function receiverElementSetElementType(callbackParam: LowerNode | null, declared: LowerResolvedType): string | null {
  if (callbackParam != null) {
    if (callbackParam.setElementType != null) {
      return callbackParam.setElementType
    }
  }

  if (declared.setElementType != null) {
    return declared.setElementType
  }

  return null
}

function receiverElementFunctionType(callbackParam: LowerNode | null, declared: LowerResolvedType): LowerNode | null {
  if (callbackParam != null) {
    if (callbackParam.functionType != null) {
      return callbackParam.functionType
    }
  }

  return declared.functionType
}

function createArrayOutputDeclaration(statement: LowerNode): LowerNode {
  const elementType = arrayOutputElementType(statement)
  const elementDeclaredType = arrayOutputElementDeclaredType(statement, elementType)

  return {
    type: 'VariableDeclaration',
    kind: statement.kind,
    exported: statement.exported,
    name: statement.name,
    loc: statement.loc,
    declaredType: statement.declaredType,
    nullable: false,
    shape: nullableNode(statement.shape),
    functionType: nullableNode(statement.functionType),
    valueType: 'array',
    arrayElementType: elementType,
    arrayElementDeclaredType: elementDeclaredType,
    mapKeyType: nullableString(statement.mapKeyType),
    mapValueType: nullableString(statement.mapValueType),
    promiseValueType: nullableString(statement.promiseValueType),
    setElementType: nullableString(statement.setElementType),
    className: nullableString(statement.className),
    loweredArrayMethod: true,
    loweredArrayMethodName: nullableString(statement.loweredArrayMethodName),
    init: {
      type: 'ArrayLiteral',
      elements: [],
      valueType: 'array',
      arrayElementType: elementType,
      arrayElementDeclaredType: elementDeclaredType,
      loc: statement.loc
    }
  }
}

function arrayOutputElementType(statement: LowerNode): string {
  if (statement.arrayElementType != null) {
    return statement.arrayElementType
  }

  return 'unknown'
}

function arrayOutputElementDeclaredType(statement: LowerNode, elementType: string): string {
  if (statement.arrayElementDeclaredType != null) {
    return statement.arrayElementDeclaredType
  }

  return elementType
}

function createArrayFindOutputDeclaration(statement: LowerNode, element: ArrayElementInfo): LowerNode {
  return {
    type: 'VariableDeclaration',
    kind: 'let',
    exported: statement.exported,
    name: statement.name,
    loc: statement.loc,
    declaredType: statement.declaredType,
    nullable: true,
    valueType: element.valueType,
    shape: element.shape,
    functionType: element.functionType,
    arrayElementType: element.arrayElementType,
    arrayElementDeclaredType: element.arrayElementDeclaredType,
    mapKeyType: element.mapKeyType,
    mapValueType: element.mapValueType,
    promiseValueType: element.promiseValueType,
    setElementType: element.setElementType,
    className: nullableString(statement.className),
    init: {
      type: 'NullLiteral',
      value: null,
      valueType: 'null',
      loc: statement.loc
    }
  }
}

function createArrayTempDeclaration(name: string, init: LowerNode, loc: LowerNode['loc']): LowerNode {
  const elementType = arrayTempElementType(init)
  const elementDeclaredType = arrayTempElementDeclaredType(init, elementType)

  return {
    type: 'VariableDeclaration',
    kind: 'const',
    exported: false,
    name,
    loc,
    declaredType: null,
    nullable: false,
    shape: null,
    functionType: null,
    arrayElementType: elementType,
    arrayElementDeclaredType: elementDeclaredType,
    mapKeyType: null,
    mapValueType: null,
    promiseValueType: null,
    setElementType: null,
    valueType: 'array',
    init
  }
}

function arrayTempElementType(init: LowerNode): string {
  const inferred = inferArrayElementType(init)

  if (init.arrayElementType != null) {
    return init.arrayElementType
  }

  if (inferred != null) {
    return inferred
  }

  return 'unknown'
}

function arrayTempElementDeclaredType(init: LowerNode, elementType: string): string {
  const inferred = inferArrayElementDeclaredType(init)

  if (init.arrayElementDeclaredType != null) {
    return init.arrayElementDeclaredType
  }

  if (inferred != null) {
    return inferred
  }

  return elementType
}

function createFindTempDeclaration(name: string, init: LowerNode, loc: LowerNode['loc']): LowerNode {
  return {
    type: 'VariableDeclaration',
    kind: 'let',
    exported: false,
    name,
    loc,
    declaredType: null,
    nullable: true,
    shape: nullableNode(init.shape),
    functionType: nullableNode(init.functionType),
    arrayElementType: nullableString(init.arrayElementType),
    arrayElementDeclaredType: nullableString(init.arrayElementDeclaredType),
    mapKeyType: nullableString(init.mapKeyType),
    mapValueType: nullableString(init.mapValueType),
    promiseValueType: nullableString(init.promiseValueType),
    setElementType: nullableString(init.setElementType),
    valueType: fallbackString(init.valueType, 'unknown'),
    init
  }
}

function createLoopItemDeclaration(
  name: string,
  init: LowerNode,
  element: ArrayElementInfo,
  loc: LowerNode['loc']
): LowerNode {
  return {
    type: 'VariableDeclaration',
    kind: 'const',
    exported: false,
    name,
    loc,
    declaredType: element.declaredType,
    nullable: false,
    shape: element.shape,
    functionType: element.functionType,
    arrayElementType: element.arrayElementType,
    arrayElementDeclaredType: element.arrayElementDeclaredType,
    mapKeyType: element.mapKeyType,
    mapValueType: element.mapValueType,
    promiseValueType: element.promiseValueType,
    setElementType: element.setElementType,
    valueType: element.valueType,
    init
  }
}

function createArrayIndexExpression(
  receiver: LowerNode,
  index: LowerNode,
  element: ArrayElementInfo,
  loc: LowerNode['loc']
): LowerNode {
  return {
    type: 'IndexExpression',
    object: receiver,
    index,
    valueType: element.valueType,
    nullable: false,
    collectionKind: null,
    arrayElementType: element.arrayElementType,
    arrayElementDeclaredType: element.arrayElementDeclaredType,
    mapKeyType: element.mapKeyType,
    mapValueType: element.mapValueType,
    promiseValueType: element.promiseValueType,
    setElementType: element.setElementType,
    shape: element.shape,
    loc
  }
}

function createArrayLengthExpression(receiver: LowerNode, loc: LowerNode['loc']): LowerNode {
  return {
    type: 'MemberExpression',
    object: receiver,
    property: 'length',
    valueType: 'number',
    nullable: false,
    arrayElementType: null,
    arrayElementDeclaredType: null,
    mapKeyType: null,
    mapValueType: null,
    promiseValueType: null,
    setElementType: null,
    shape: null,
    loc
  }
}

function createArrayPushStatement(arrayName: string, arrayInfo: LowerNode, value: LowerNode, loc: LowerNode['loc']): LowerNode {
  return {
    type: 'ExpressionStatement',
    expression: {
      type: 'CallExpression',
      callee: {
        type: 'MemberExpression',
        object: {
          type: 'Reference',
          path: [arrayName],
          valueType: 'array',
          arrayElementType: arrayInfo.arrayElementType ?? null,
          arrayElementDeclaredType: arrayInfo.arrayElementDeclaredType ?? null,
          loc
        },
        property: 'push',
        valueType: 'function',
        loc
      },
      args: [value],
      valueType: 'number',
      arrayElementType: arrayInfo.arrayElementType ?? null,
      arrayElementDeclaredType: arrayInfo.arrayElementDeclaredType ?? null,
      loc
    }
  }
}

function createArrayReferenceFromDeclaration(declaration: LowerNode, loc: LowerNode['loc']): LowerNode {
  return {
    type: 'Reference',
    path: [declaration.name],
    valueType: 'array',
    nullable: false,
    arrayElementType: declaration.arrayElementType ?? null,
    arrayElementDeclaredType: declaration.arrayElementDeclaredType ?? declaration.arrayElementType ?? null,
    mapKeyType: null,
    mapValueType: null,
    promiseValueType: null,
    setElementType: null,
    functionType: null,
    shape: null,
    loc
  }
}

function createValueReferenceFromDeclaration(declaration: LowerNode, loc: LowerNode['loc']): LowerNode {
  return {
    type: 'Reference',
    path: [declaration.name],
    valueType: declaration.valueType ?? 'unknown',
    nullable: declaration.nullable === true,
    arrayElementType: declaration.arrayElementType ?? null,
    arrayElementDeclaredType: declaration.arrayElementDeclaredType ?? null,
    mapKeyType: declaration.mapKeyType ?? null,
    mapValueType: declaration.mapValueType ?? null,
    promiseValueType: declaration.promiseValueType ?? null,
    setElementType: declaration.setElementType ?? null,
    functionType: declaration.functionType ?? null,
    shape: declaration.shape ?? null,
    loc
  }
}

function findVariableDeclaration(statements: LowerNode[], name: string): LowerNode | null {
  for (const statement of statements) {
    if (statement.type === 'VariableDeclaration' && lowerNameEquals(statement.name, name)) {
      return statement
    }
  }

  return null
}

function createCallbackReplacements(
  valueParam: LowerNode | null | undefined,
  valueName: string,
  indexParam: LowerNode | null | undefined,
  indexName: string
): Replacement[] {
  const replacements: Replacement[] = []

  if (valueParam != null) {
    replacements.push({
      name: valueParam.name,
      replacement: createReference(valueName, paramElementInfo(valueParam), valueParam.loc)
    })
  }

  if (indexParam != null) {
    replacements.push({
      name: indexParam.name,
      replacement: createNumberReference(indexName, indexParam.loc)
    })
  }

  return replacements
}

function paramElementInfo(param: LowerNode): ArrayElementInfo {
  return {
    valueType: fallbackString(param.valueType, 'unknown'),
    declaredType: nullableString(param.declaredType),
    shape: nullableNode(param.shape),
    arrayElementType: nullableString(param.arrayElementType),
    arrayElementDeclaredType: nullableString(param.arrayElementDeclaredType),
    mapKeyType: nullableString(param.mapKeyType),
    mapValueType: nullableString(param.mapValueType),
    promiseValueType: nullableString(param.promiseValueType),
    setElementType: nullableString(param.setElementType),
    functionType: nullableNode(param.functionType)
  }
}

function createReference(name: string, info: ArrayElementInfo, loc: LowerNode['loc']): LowerNode {
  return {
    type: 'Reference',
    path: [name],
    valueType: info.valueType,
    nullable: false,
    arrayElementType: info.arrayElementType,
    arrayElementDeclaredType: info.arrayElementDeclaredType,
    mapKeyType: info.mapKeyType,
    mapValueType: info.mapValueType,
    promiseValueType: info.promiseValueType,
    setElementType: info.setElementType,
    functionType: info.functionType,
    shape: info.shape,
    loc
  }
}

function createNullableReference(name: string, info: ArrayElementInfo, loc: LowerNode['loc']): LowerNode {
  return {
    type: 'Reference',
    path: [name],
    valueType: info.valueType,
    nullable: true,
    arrayElementType: info.arrayElementType,
    arrayElementDeclaredType: info.arrayElementDeclaredType,
    mapKeyType: info.mapKeyType,
    mapValueType: info.mapValueType,
    promiseValueType: info.promiseValueType,
    setElementType: info.setElementType,
    functionType: info.functionType,
    shape: info.shape,
    loc
  }
}

function createAssignmentStatement(target: LowerNode, value: LowerNode, loc: LowerNode['loc']): LowerNode {
  return {
    type: 'ExpressionStatement',
    expression: {
      type: 'AssignmentExpression',
      target,
      value,
      valueType: target.valueType,
      nullable: target.nullable === true,
      loc
    },
    loc
  }
}

function createNumberReference(name: string, loc: LowerNode['loc']): LowerNode {
  return {
    type: 'Reference',
    path: [name],
    valueType: 'number',
    nullable: false,
    arrayElementType: null,
    arrayElementDeclaredType: null,
    mapKeyType: null,
    mapValueType: null,
    promiseValueType: null,
    setElementType: null,
    functionType: null,
    shape: null,
    loc
  }
}

function createTruthyCondition(value: LowerNode, valueType: string): LowerNode | null {
  if (valueType === 'string') {
    return {
      type: 'BinaryExpression',
      operator: '>',
      left: {
        type: 'MemberExpression',
        object: value,
        property: 'length',
        valueType: 'number',
        loc: value.loc
      },
      right: {
        type: 'NumberLiteral',
        value: '0',
        valueType: 'number',
        loc: value.loc
      },
      valueType: 'boolean',
      loc: value.loc
    }
  }

  if (valueType === 'number') {
    return {
      type: 'BinaryExpression',
      operator: '&&',
      left: {
        type: 'BinaryExpression',
        operator: '===',
        left: value,
        right: value,
        valueType: 'boolean',
        loc: value.loc
      },
      right: {
        type: 'BinaryExpression',
        operator: '!==',
        left: value,
        right: {
          type: 'NumberLiteral',
          value: '0',
          valueType: 'number',
          loc: value.loc
        },
        valueType: 'boolean',
        loc: value.loc
      },
      valueType: 'boolean',
      loc: value.loc
    }
  }

  if (valueType === 'boolean') {
    return value
  }

  if (valueType === 'object' || valueType === 'array' || valueType === 'map' || valueType === 'set' || valueType === 'bytes') {
    return {
      type: 'BooleanLiteral',
      value: true,
      valueType: 'boolean',
      loc: value.loc
    }
  }

  return null
}

function resolveSimpleArrowReturnExpression(callback: LowerNode): LowerNode | null {
  if (callback.expressionBody === true) {
    return callback.body
  }

  let statements: LowerNode[] | null = null

  if (Array.isArray(callback.body)) {
    statements = callback.body
  } else if (callback.body != null && callback.body.type === 'BlockStatement') {
    statements = callback.body.body
  }

  if (statements == null || statements.length !== 1) {
    return null
  }

  const statement = statements[0]

  if (statement.type !== 'ReturnStatement' || statement.argument == null) {
    return null
  }

  return statement.argument
}

function replaceExpressionReferences(expression: LowerNode, replacements: Replacement[]): LowerNode {
  if (replacements.length === 0) {
    return expression
  }

  if (expression.type === 'Reference' && expression.path.length === 1) {
    const replacement = findReplacement(expression.path[0], replacements)

    if (replacement != null) {
      return replacement
    }

    return expression
  }

  if (expression.type === 'MemberExpression') {
    return cloneMemberExpressionWithObject(expression, replaceExpressionReferences(expression.object, replacements))
  }

  if (expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression') {
    return cloneIndexExpressionWithParts(
      expression,
      replaceExpressionReferences(expression.object, replacements),
      replaceExpressionReferences(expression.index, replacements)
    )
  }

  if (expression.type === 'OptionalMemberExpression') {
    return cloneMemberExpressionWithObject(expression, replaceExpressionReferences(expression.object, replacements))
  }

  if (expression.type === 'CallExpression' || expression.type === 'OptionalCallExpression') {
    const args: LowerNode[] = []
    const sourceArgs: LowerNode[] = expression.args

    for (const arg of sourceArgs) {
      args.push(replaceExpressionReferences(arg, replacements))
    }

    return cloneCallExpressionWithCalleeAndArgs(
      expression,
      replaceExpressionReferences(expression.callee, replacements),
      args
    )
  }

  if (expression.type === 'NewExpression') {
    const args: LowerNode[] = []
    const sourceArgs: LowerNode[] = expression.args

    for (const arg of sourceArgs) {
      args.push(replaceExpressionReferences(arg, replacements))
    }

    return cloneCallExpressionWithCalleeAndArgs(
      expression,
      replaceExpressionReferences(expression.callee, replacements),
      args
    )
  }

  if (expression.type === 'AwaitExpression') {
    return cloneAwaitExpressionWithArgument(expression, replaceExpressionReferences(expression.argument, replacements))
  }

  if (expression.type === 'UnaryExpression' || expression.type === 'TypeAssertionExpression') {
    return cloneUnaryOrTypeAssertionExpressionWithOperand(
      expression,
      replaceExpressionReferences(unaryOrTypeAssertionOperand(expression), replacements)
    )
  }

  if (expression.type === 'AssignmentExpression') {
    return cloneAssignmentExpressionWithParts(
      expression,
      replaceExpressionReferences(expression.target, replacements),
      replaceExpressionReferences(expression.value, replacements)
    )
  }

  if (expression.type === 'UpdateExpression') {
    return cloneUpdateExpressionWithArgument(expression, replaceExpressionReferences(expression.argument, replacements))
  }

  if (expression.type === 'BinaryExpression') {
    return cloneBinaryExpressionWithParts(
      expression,
      replaceExpressionReferences(expression.left, replacements),
      replaceExpressionReferences(expression.right, replacements)
    )
  }

  if (expression.type === 'ArrayLiteral') {
    const elements: LowerNode[] = []
    const sourceElements: LowerNode[] = expression.elements

    for (const element of sourceElements) {
      elements.push(replaceExpressionReferences(element, replacements))
    }

    return cloneArrayLiteralWithElements(expression, elements)
  }

  if (expression.type === 'ObjectLiteral') {
    const properties: LowerNode[] = []
    const sourceProperties: LowerNode[] = expression.properties

    for (const property of sourceProperties) {
      properties.push(cloneObjectPropertyWithValue(property, replaceExpressionReferences(property.value, replacements)))
    }

    return cloneObjectLiteralWithProperties(expression, properties)
  }

  return expression
}

function findReplacement(name: string, replacements: Replacement[]): LowerNode | null {
  for (const replacement of replacements) {
    if (lowerNameEquals(replacement.name, name)) {
      return replacement.replacement
    }
  }

  return null
}

function isBooleanFilterCallback(callback: LowerNode | null | undefined): boolean {
  return callback != null && callback.type === 'Reference' && callback.path.length === 1 && callback.path[0] === 'Boolean'
}

function isStableArrayReceiver(expression: LowerNode): boolean {
  if (expression.type === 'Reference') {
    return expression.path.length === 1
  }

  if (expression.type === 'MemberExpression') {
    return isStableArrayReceiver(expression.object)
  }

  if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
    return isStableArrayReceiver(expression.object)
  }

  return false
}

function nextLowerName(context: LowerContext, prefix: string): string {
  context.nextId = context.nextId + 1

  return `__${prefix}_${context.nextId}`
}

function lowerStatementExpression(expression: LowerNode, context: LowerContext): LowerNode {
  return lowerExpression(expression, expressionContext(context))
}

function expressionContext(context: LowerContext): LowerExpressionContext {
  return {
    types: context.types,
    resolvedTypes: context.resolvedTypes,
    classNames: context.classNames,
    nextId: context.nextId,
    variables: context.variables,
    resolvingTypes: context.resolvingTypes,
    lowerStatement
  }
}

function inferArrayElementType(expression: LowerNode | null): string | null {
  if (expression == null || expression.valueType !== 'array') {
    return null
  }

  return nullableString(expression.arrayElementType)
}

function inferArrayElementDeclaredType(expression: LowerNode | null): string | null {
  if (expression == null || expression.valueType !== 'array') {
    return null
  }

  if (expression.arrayElementDeclaredType != null) {
    return expression.arrayElementDeclaredType
  }

  return nullableString(expression.arrayElementType)
}

function inferMapType(expression: LowerNode | null): InferredMapType | null {
  if (expression == null || expression.valueType !== 'map') {
    return null
  }

  return {
    key: nullableString(expression.mapKeyType),
    value: nullableString(expression.mapValueType)
  }
}

function inferSetElementType(expression: LowerNode | null): string | null {
  if (expression == null || expression.valueType !== 'set') {
    return null
  }

  return nullableString(expression.setElementType)
}

function inferPromiseValueType(expression: LowerNode | null): string | null {
  if (expression == null || expression.valueType !== 'promise') {
    return null
  }

  return nullableString(expression.promiseValueType)
}
