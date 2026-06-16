import type { AnyNode } from '../types.ts'
import { lowerExpression } from './expressions.ts'
import type { LowerExpressionContext } from './expressions.ts'
import { resolveDeclaredType } from './type-resolution.ts'
import type { LowerContext } from './type-resolution.ts'

type LowerNode = AnyNode
type LoweredStatement = LowerNode | LowerNode[]

type ArrayMethodReceiverExpansion = {
  statements: LowerNode[]
  receiver: LowerNode
}

type ArrayExpressionHoist = {
  statements: LowerNode[]
  expression: LowerNode
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
    return {
      type: 'BlockStatement',
      body: lowerStatementList(statement.body, context)
    }
  }

  if (statement.type === 'IfStatement') {
    return {
      type: 'IfStatement',
      condition: lowerStatementExpression(statement.condition, context),
      consequent: lowerStatementBody(statement.consequent, context),
      alternate: statement.alternate == null ? null : lowerStatementBody(statement.alternate, context),
      loc: statement.loc
    }
  }

  if (statement.type === 'WhileStatement') {
    return {
      type: 'WhileStatement',
      condition: lowerStatementExpression(statement.condition, context),
      body: lowerStatementBody(statement.body, context),
      loc: statement.loc
    }
  }

  if (statement.type === 'ForStatement') {
    return {
      type: 'ForStatement',
      init: statement.init == null ? null : lowerForInitializer(statement.init, context),
      test: statement.test == null ? null : lowerStatementExpression(statement.test, context),
      update: statement.update == null ? null : lowerStatementExpression(statement.update, context),
      body: lowerStatementBody(statement.body, context),
      loc: statement.loc
    }
  }

  if (statement.type === 'ForOfStatement') {
    return {
      type: 'ForOfStatement',
      kind: statement.kind,
      name: statement.name,
      declaredType: statement.declaredType,
      inferredDeclaredType: statement.inferredDeclaredType,
      valueType: statement.valueType,
      nullable: statement.nullable === true,
      arrayElementType: statement.arrayElementType ?? null,
      arrayElementDeclaredType: statement.arrayElementDeclaredType ?? null,
      mapKeyType: statement.mapKeyType ?? null,
      mapValueType: statement.mapValueType ?? null,
      promiseValueType: statement.promiseValueType ?? null,
      setElementType: statement.setElementType ?? null,
      functionType: statement.functionType ?? null,
      shape: statement.shape ?? null,
      loc: statement.loc,
      nameLoc: statement.nameLoc,
      iterable: lowerStatementExpression(statement.iterable, context),
      body: lowerStatementBody(statement.body, context)
    }
  }

  if (statement.type === 'SwitchStatement') {
    return {
      type: 'SwitchStatement',
      discriminant: lowerStatementExpression(statement.discriminant, context),
      cases: statement.cases.map((item) => ({
        type: 'SwitchCase',
        test: item.test == null ? null : lowerStatementExpression(item.test, context),
        consequent: lowerStatementList(item.consequent, context),
        loc: item.loc
      })),
      loc: statement.loc
    }
  }

  if (statement.type === 'TryStatement') {
    return {
      type: 'TryStatement',
      block: lowerStatementBody(statement.block, context),
      handler:
        statement.handler == null
          ? null
          : {
              ...statement.handler,
              body: lowerStatementBody(statement.handler.body, context)
            },
      finalizer: statement.finalizer == null ? null : lowerStatementBody(statement.finalizer, context),
      loc: statement.loc
    }
  }

  if (statement.type === 'BreakStatement' || statement.type === 'ContinueStatement') {
    return statement
  }

  if (statement.type === 'VariableDeclaration') {
    return lowerVariableDeclaration(statement, context, true)
  }

  if (statement.type === 'ExpressionStatement') {
    const expression = lowerStatementExpression(statement.expression, context)
    const hoisted = lowerArrayMethodSubexpressions(expression, context, false)

    if (hoisted != null) {
      declareLoweredTopLevelVariables(context, hoisted.statements)

      return [
        ...hoisted.statements,
        {
          type: 'ExpressionStatement',
          expression: hoisted.expression
        }
      ]
    }

    return {
      type: 'ExpressionStatement',
      expression
    }
  }

  if (statement.type === 'ReturnStatement') {
    const argument = statement.argument == null ? null : lowerStatementExpression(statement.argument, context)
    const hoisted = argument == null ? null : lowerArrayMethodSubexpressions(argument, context)

    if (hoisted != null) {
      declareLoweredTopLevelVariables(context, hoisted.statements)

      return [
        ...hoisted.statements,
        {
          type: 'ReturnStatement',
          argument: hoisted.expression,
          loc: statement.loc
        }
      ]
    }

    return {
      type: 'ReturnStatement',
      argument,
      loc: statement.loc
    }
  }

  if (statement.type === 'ThrowStatement') {
    return {
      type: 'ThrowStatement',
      argument: lowerStatementExpression(statement.argument, context),
      loc: statement.loc
    }
  }

  return statement
}

export function lowerParam(param: LowerNode, context: LowerContext): LowerNode {
  const declared = resolveDeclaredType(param.valueType, context)

  return {
    ...param,
    declaredType: param.valueType,
    optional: param.optional === true,
    valueType: declared.valueType ?? param.valueType,
    nullable: declared.nullable,
    arrayElementType: declared.arrayElementType,
    arrayElementDeclaredType: declared.arrayElementDeclaredType,
    mapKeyType: declared.mapKeyType,
    mapValueType: declared.mapValueType,
    promiseValueType: declared.promiseValueType ?? null,
    setElementType: declared.setElementType,
    functionType: declared.functionType,
    shape: declared.shape
  }
}

function lowerForInitializer(init: LowerNode, context: LowerContext): LowerNode {
  if (init.type === 'VariableDeclaration') {
    return lowerVariableDeclaration(init, context, false)
  }

  return lowerStatementExpression(init, context)
}

function lowerStatementBody(statement: LowerNode, context: LowerContext): LowerNode {
  const lowered = lowerStatementInternal(statement, context)

  if (!Array.isArray(lowered)) {
    return lowered
  }

  return {
    type: 'BlockStatement',
    body: lowered,
    loc: statement.loc
  }
}

function appendLoweredStatement(out: LowerNode[], statement: LoweredStatement): void {
  if (Array.isArray(statement)) {
    for (const item of statement) {
      out.push(item)
    }
    return
  }

  out.push(statement)
}

function lowerVariableDeclaration(
  statement: LowerNode,
  context: LowerContext,
  allowArrayMethodExpansion: boolean
): LoweredStatement {
  const init = statement.init == null ? null : lowerStatementExpression(statement.init, context)
  const declared = resolveDeclaredType(statement.declaredType, context)
  const inferredMapType = inferMapType(init)
  const lowered: LowerNode = {
    type: 'VariableDeclaration',
    kind: statement.kind,
    exported: statement.exported,
    name: statement.name,
    loc: statement.loc,
    declaredType: statement.declaredType,
    nullable: declared.nullable || init?.nullable === true,
    shape: declared.shape ?? statement.shape ?? init?.shape ?? null,
    functionType: declared.functionType ?? statement.functionType ?? init?.functionType ?? null,
    arrayElementType: declared.arrayElementType ?? statement.arrayElementType ?? inferArrayElementType(init),
    arrayElementDeclaredType:
      declared.arrayElementDeclaredType ?? statement.arrayElementDeclaredType ?? inferArrayElementDeclaredType(init),
    mapKeyType: declared.mapKeyType ?? inferredMapType?.key ?? null,
    mapValueType: declared.mapValueType ?? inferredMapType?.value ?? null,
    promiseValueType: declared.promiseValueType ?? statement.promiseValueType ?? inferPromiseValueType(init),
    setElementType: declared.setElementType ?? statement.setElementType ?? inferSetElementType(init),
    valueType: declared.valueType ?? statement.valueType ?? statement.declaredType ?? init?.valueType ?? 'unknown',
    init
  }

  if (!allowArrayMethodExpansion || statement.exported === true || init == null) {
    declareLowerVariable(context, lowered)
    return lowered
  }

  const expanded = lowerArrayMethodVariableDeclaration(lowered, init, context)

  if (expanded == null) {
    const hoisted = lowerArrayMethodSubexpressions(init, context)

    if (hoisted != null) {
      const declaration = {
        ...lowered,
        init: hoisted.expression
      }

      declareLoweredTopLevelVariables(context, hoisted.statements)
      declareLowerVariable(context, declaration)

      return [...hoisted.statements, declaration]
    }

    declareLowerVariable(context, lowered)
    return lowered
  }

  declareLoweredTopLevelVariables(context, expanded)

  return expanded
}

function declareLowerVariable(context: LowerContext, statement: LowerNode): void {
  if (statement.type !== 'VariableDeclaration') {
    return
  }

  context.variables.set(statement.name, {
    valueType: statement.valueType ?? 'unknown',
    nullable: statement.nullable === true,
    arrayElementType: statement.arrayElementType ?? null,
    arrayElementDeclaredType: statement.arrayElementDeclaredType ?? null,
    mapKeyType: statement.mapKeyType ?? null,
    mapValueType: statement.mapValueType ?? null,
    promiseValueType: statement.promiseValueType ?? null,
    setElementType: statement.setElementType ?? null,
    functionType: statement.functionType ?? null,
    shape: statement.shape ?? null,
    className: statement.className ?? null
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
    ...init,
    callee: {
      ...init.callee,
      object: receiver.receiver
    }
  }
  let expanded: LowerNode[] | null = null

  if (init.callee.property === 'filter') {
    expanded = lowerArrayFilterVariableDeclaration(statement, expandedInit, context)
  } else {
    expanded = lowerArrayMapVariableDeclaration(statement, expandedInit, context)
  }

  if (expanded == null) {
    return null
  }

  return [...receiver.statements, ...expanded]
}

function lowerArrayMethodExpressionToTemp(expression: LowerNode, context: LowerContext): ArrayExpressionHoist | null {
  if (!isArrayMethodExpansionCall(expression)) {
    return null
  }

  const name = nextLowerName(context, 'ccjs_array_expr')
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

function lowerArrayMethodReceiver(receiver: LowerNode, context: LowerContext): ArrayMethodReceiverExpansion | null {
  if (isStableArrayReceiver(receiver)) {
    return {
      statements: [],
      receiver
    }
  }

  if (isArrayMethodExpansionCall(receiver)) {
    const hoisted = lowerArrayMethodExpressionToTemp(receiver, context)

    if (hoisted == null) {
      return null
    }

    return {
      statements: hoisted.statements,
      receiver: hoisted.expression
    }
  }

  if (receiver.type === 'ArrayLiteral') {
    const name = nextLowerName(context, 'ccjs_array_source')
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
  allowRoot: boolean = true
): ArrayExpressionHoist | null {
  const root = allowRoot ? lowerArrayMethodExpressionToTemp(expression, context) : null

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
      expression: {
        ...expression,
        args: args.expressions
      }
    }
  }

  if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
    const object = lowerArrayMethodSubexpressions(expression.object, context)

    if (object == null) {
      return null
    }

    return {
      statements: object.statements,
      expression: {
        ...expression,
        object: object.expression
      }
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

    return {
      statements,
      expression: {
        ...expression,
        object: object == null ? expression.object : object.expression,
        index: index == null ? expression.index : index.expression
      }
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

    return {
      statements,
      expression: {
        ...expression,
        left: left == null ? expression.left : left.expression,
        right: right == null ? expression.right : right.expression
      }
    }
  }

  if (expression.type === 'UnaryExpression' || expression.type === 'TypeAssertionExpression') {
    const operand = lowerArrayMethodSubexpressions(expression.argument ?? expression.expression, context)

    if (operand == null) {
      return null
    }

    return {
      statements: operand.statements,
      expression: {
        ...expression,
        argument: operand.expression,
        expression: expression.expression == null ? expression.expression : operand.expression
      }
    }
  }

  if (expression.type === 'ArrayLiteral') {
    const elements = lowerArrayMethodExpressionList(expression.elements, context)

    if (elements == null) {
      return null
    }

    return {
      statements: elements.statements,
      expression: {
        ...expression,
        elements: elements.expressions
      }
    }
  }

  if (expression.type === 'ObjectLiteral') {
    const statements: LowerNode[] = []
    const properties: LowerNode[] = []
    let changed = false

    for (const property of expression.properties) {
      const hoisted = lowerArrayMethodSubexpressions(property.value, context)

      if (hoisted == null) {
        properties.push(property)
        continue
      }

      appendLoweredHoistStatements(statements, hoisted.statements)
      properties.push({
        ...property,
        value: hoisted.expression
      })
      changed = true
    }

    if (!changed) {
      return null
    }

    return {
      statements,
      expression: {
        ...expression,
        properties
      }
    }
  }

  return null
}

function lowerArrayMethodExpressionList(
  expressions: LowerNode[],
  context: LowerContext
): { statements: LowerNode[]; expressions: LowerNode[] } | null {
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

  return expression.callee.property === 'filter' || expression.callee.property === 'map'
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

  const indexName = nextLowerName(context, 'ccjs_filter_index')
  const valueParam = callback?.type === 'ArrowFunctionExpression' ? callback.params[0] : null
  const indexParam = callback?.type === 'ArrowFunctionExpression' ? callback.params[1] : null
  const itemName =
    valueParam != null && valueParam.name !== statement.name ? valueParam.name : nextLowerName(context, 'ccjs_filter_item')
  const replacements = createCallbackReplacements(valueParam, itemName, indexParam, indexName)
  let predicate: LowerNode | null = null

  if (isBooleanFilterCallback(callback)) {
    predicate = createTruthyCondition(createReference(itemName, receiverElement, receiver.loc), receiverElement.valueType)
  } else if (callback?.type === 'ArrowFunctionExpression' && callback.params.length <= 2) {
    const returned = resolveSimpleArrowReturnExpression(callback)

    if (returned == null) {
      return null
    }

    predicate = replaceExpressionReferences(returned, replacements)
  }

  if (predicate == null) {
    return null
  }

  const output = {
    ...statement,
    loweredArrayMethodName: 'filter',
    arrayElementType: statement.arrayElementType ?? init.arrayElementType ?? receiverElement.valueType,
    arrayElementDeclaredType:
      statement.arrayElementDeclaredType ??
      init.arrayElementDeclaredType ??
      receiverElement.declaredType ??
      receiverElement.valueType
  }
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

function lowerArrayMapVariableDeclaration(
  statement: LowerNode,
  init: LowerNode,
  context: LowerContext
): LowerNode[] | null {
  const callback = init.args[0]

  if (callback?.type !== 'ArrowFunctionExpression' || callback.params.length > 2) {
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

  const indexName = nextLowerName(context, 'ccjs_map_index')
  const valueParam = callback.params[0]
  const indexParam = callback.params[1]
  const itemName =
    valueParam != null && valueParam.name !== statement.name ? valueParam.name : nextLowerName(context, 'ccjs_map_item')
  const replacements = createCallbackReplacements(valueParam, itemName, indexParam, indexName)
  const mappedValue = lowerStatementExpression(replaceExpressionReferences(mapped, replacements), context)
  const mappedElementType = statement.arrayElementType ?? init.arrayElementType ?? mappedValue.valueType ?? 'unknown'

  if (mappedElementType === 'unknown' || mappedElementType === 'void') {
    return null
  }

  const output = {
    ...statement,
    loweredArrayMethodName: 'map',
    arrayElementType: mappedElementType,
    arrayElementDeclaredType: statement.arrayElementDeclaredType ?? init.arrayElementDeclaredType ?? mappedElementType
  }

  return createArrayLoopStatements(output, receiver, receiverElement, indexName, itemName, [
    createArrayPushStatement(statement.name, output, mappedValue, init.loc)
  ])
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
  const callbackParam = callback?.type === 'ArrowFunctionExpression' ? callback.params[0] : null
  const declaredType = receiver.arrayElementDeclaredType ?? receiver.arrayElementType ?? callbackParam?.declaredType ?? null
  const declared = resolveDeclaredType(declaredType, context)
  const valueType = receiver.arrayElementType ?? callbackParam?.valueType ?? declared.valueType ?? 'unknown'

  return {
    valueType,
    declaredType,
    shape: callbackParam?.shape ?? declared.shape ?? null,
    arrayElementType: callbackParam?.arrayElementType ?? declared.arrayElementType ?? null,
    arrayElementDeclaredType: callbackParam?.arrayElementDeclaredType ?? declared.arrayElementDeclaredType ?? null,
    mapKeyType: callbackParam?.mapKeyType ?? declared.mapKeyType ?? null,
    mapValueType: callbackParam?.mapValueType ?? declared.mapValueType ?? null,
    promiseValueType: callbackParam?.promiseValueType ?? declared.promiseValueType ?? null,
    setElementType: callbackParam?.setElementType ?? declared.setElementType ?? null,
    functionType: callbackParam?.functionType ?? declared.functionType ?? null
  }
}

function createArrayOutputDeclaration(statement: LowerNode): LowerNode {
  const elementType = statement.arrayElementType ?? 'unknown'
  const elementDeclaredType = statement.arrayElementDeclaredType ?? elementType

  return {
    ...statement,
    nullable: false,
    valueType: 'array',
    arrayElementType: elementType,
    arrayElementDeclaredType: elementDeclaredType,
    loweredArrayMethod: true,
    loweredArrayMethodName: statement.loweredArrayMethodName ?? null,
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

function createArrayTempDeclaration(name: string, init: LowerNode, loc: LowerNode['loc']): LowerNode {
  const elementType = init.arrayElementType ?? inferArrayElementType(init) ?? 'unknown'
  const elementDeclaredType = init.arrayElementDeclaredType ?? inferArrayElementDeclaredType(init) ?? elementType

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

function findVariableDeclaration(statements: LowerNode[], name: string): LowerNode | null {
  for (const statement of statements) {
    if (statement.type === 'VariableDeclaration' && statement.name === name) {
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
    valueType: param.valueType ?? 'unknown',
    declaredType: param.declaredType ?? null,
    shape: param.shape ?? null,
    arrayElementType: param.arrayElementType ?? null,
    arrayElementDeclaredType: param.arrayElementDeclaredType ?? null,
    mapKeyType: param.mapKeyType ?? null,
    mapValueType: param.mapValueType ?? null,
    promiseValueType: param.promiseValueType ?? null,
    setElementType: param.setElementType ?? null,
    functionType: param.functionType ?? null
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
  } else if (callback.body?.type === 'BlockStatement') {
    statements = callback.body.body
  }

  if (statements == null || statements.length !== 1) {
    return null
  }

  const statement = statements[0]

  if (statement == null || statement.type !== 'ReturnStatement' || statement.argument == null) {
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
    return {
      ...expression,
      object: replaceExpressionReferences(expression.object, replacements)
    }
  }

  if (expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression') {
    return {
      ...expression,
      object: replaceExpressionReferences(expression.object, replacements),
      index: replaceExpressionReferences(expression.index, replacements)
    }
  }

  if (expression.type === 'OptionalMemberExpression') {
    return {
      ...expression,
      object: replaceExpressionReferences(expression.object, replacements)
    }
  }

  if (expression.type === 'CallExpression' || expression.type === 'OptionalCallExpression') {
    const args: LowerNode[] = []

    for (const arg of expression.args) {
      args.push(replaceExpressionReferences(arg, replacements))
    }

    return {
      ...expression,
      callee: replaceExpressionReferences(expression.callee, replacements),
      args
    }
  }

  if (expression.type === 'NewExpression') {
    const args: LowerNode[] = []

    for (const arg of expression.args) {
      args.push(replaceExpressionReferences(arg, replacements))
    }

    return {
      ...expression,
      callee: replaceExpressionReferences(expression.callee, replacements),
      args
    }
  }

  if (expression.type === 'AwaitExpression' || expression.type === 'UnaryExpression' || expression.type === 'TypeAssertionExpression') {
    return {
      ...expression,
      argument: replaceExpressionReferences(expression.argument ?? expression.expression, replacements),
      expression:
        expression.expression == null ? expression.expression : replaceExpressionReferences(expression.expression, replacements)
    }
  }

  if (expression.type === 'AssignmentExpression') {
    return {
      ...expression,
      target: replaceExpressionReferences(expression.target, replacements),
      value: replaceExpressionReferences(expression.value, replacements)
    }
  }

  if (expression.type === 'UpdateExpression') {
    return {
      ...expression,
      argument: replaceExpressionReferences(expression.argument, replacements)
    }
  }

  if (expression.type === 'BinaryExpression') {
    return {
      ...expression,
      left: replaceExpressionReferences(expression.left, replacements),
      right: replaceExpressionReferences(expression.right, replacements)
    }
  }

  if (expression.type === 'ArrayLiteral') {
    const elements: LowerNode[] = []

    for (const element of expression.elements) {
      elements.push(replaceExpressionReferences(element, replacements))
    }

    return {
      ...expression,
      elements
    }
  }

  if (expression.type === 'ObjectLiteral') {
    const properties: LowerNode[] = []

    for (const property of expression.properties) {
      properties.push({
        ...property,
        value: replaceExpressionReferences(property.value, replacements)
      })
    }

    return {
      ...expression,
      properties
    }
  }

  return expression
}

function findReplacement(name: string, replacements: Replacement[]): LowerNode | null {
  for (const replacement of replacements) {
    if (replacement.name === name) {
      return replacement.replacement
    }
  }

  return null
}

function isBooleanFilterCallback(callback: LowerNode | null | undefined): boolean {
  return callback?.type === 'Reference' && callback.path.length === 1 && callback.path[0] === 'Boolean'
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
  context.nextId += 1

  return `__${prefix}_${context.nextId}`
}

function lowerStatementExpression(expression: LowerNode, context: LowerContext): LowerNode {
  return lowerExpression(expression, expressionContext(context))
}

function expressionContext(context: LowerContext): LowerExpressionContext {
  return {
    ...context,
    lowerStatement
  }
}

function inferArrayElementType(expression: LowerNode | null): string | null {
  return expression?.valueType === 'array' ? (expression.arrayElementType ?? null) : null
}

function inferArrayElementDeclaredType(expression: LowerNode | null): string | null {
  return expression?.valueType === 'array'
    ? (expression.arrayElementDeclaredType ?? expression.arrayElementType ?? null)
    : null
}

function inferMapType(expression: LowerNode | null): { key: string | null; value: string | null } | null {
  return expression?.valueType === 'map'
    ? {
        key: expression.mapKeyType ?? null,
        value: expression.mapValueType ?? null
      }
    : null
}

function inferSetElementType(expression: LowerNode | null): string | null {
  return expression?.valueType === 'set' ? (expression.setElementType ?? null) : null
}

function inferPromiseValueType(expression: LowerNode | null): string | null {
  return expression?.valueType === 'promise' ? (expression.promiseValueType ?? null) : null
}
