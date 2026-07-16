import type { AnyNode, ArrayBindingElement } from '../types.ts'
import type { LowerExpressionContext } from './expressions.ts'
import { lowerExpression } from './expressions.ts'
import type { LowerContext, LowerResolvedType } from './type-resolution.ts'
import { resolveDeclaredType } from './type-resolution.ts'

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

type LowerVariableScopeState = {
  hadPrevious: boolean
  previous: LowerNode | null
}

export function lowerStatement(statement: LowerNode, context: LowerContext): LowerNode {
  return lowerStatementBody(statement, context)
}

export function lowerStatementList(statements: LowerNode[], context: LowerContext): LowerNode[] {
  const lowered: LowerNode[] = []

  for (let index = 0; index < statements.length; index = index + 1) {
    const statement = statements[index]
    const loweredStatement = lowerStatementInternal(statement, context)

    appendLoweredStatement(lowered, loweredStatement)
  }

  const output = lowered

  return output
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
    const variableState = pushLowerVariable(context, statement.name, forOfLowerVariable(statement))
    const bindingStates: Array<{ name: string; state: LowerVariableScopeState }> = []
    const bindingDeclarations: LowerNode[] = []
    let body = statement.body

    try {
      const bindingElements: ArrayBindingElement[] = statement.bindingElements ?? []

      for (const binding of bindingElements) {
        const bindingVariable = forOfBindingLowerVariable(binding)
        const state = pushLowerVariable(context, binding.name, bindingVariable)

        bindingStates.push({ name: binding.name, state })
        bindingDeclarations.push(forOfBindingDeclaration(statement, binding, bindingVariable))
      }

      body = lowerStatementBody(statement.body, context)
      body = prependForOfBindingDeclarations(body, bindingDeclarations)
    } finally {
      for (let index = bindingStates.length - 1; index >= 0; index = index - 1) {
        const binding = bindingStates[index]
        restoreLowerVariable(context, binding.name, binding.state)
      }

      restoreLowerVariable(context, statement.name, variableState)
    }

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
        arrayElementFunctionType: nullableNode(statement.arrayElementFunctionType),
        promiseValueType: nullableString(statement.promiseValueType),
        functionType: nullableNode(statement.functionType),
        shape: nullableNode(statement.shape),
        typeRef: nullableNode(statement.typeRef),
        libraryCIteratorMethod: nullableString(statement.libraryCIteratorMethod),
        libraryCIteratorNextMethod: nullableString(statement.libraryCIteratorNextMethod),
        libraryCIteratorDoneMember: nullableString(statement.libraryCIteratorDoneMember),
        libraryCIteratorValueMember: nullableString(statement.libraryCIteratorValueMember),
        libraryCIteratorReceiverAdapter: nullableString(statement.libraryCIteratorReceiverAdapter),
        libraryCIteratorValueAdapter: nullableString(statement.libraryCIteratorValueAdapter),
        libraryCIteratorFailureMode: nullableString(statement.libraryCIteratorFailureMode),
        libraryRuntimeRequirements: copyStringArray(statement.libraryRuntimeRequirements),
        bindingElements: lowerForOfBindingElements(statement.bindingElements),
        loc: statement.loc,
        nameLoc: statement.nameLoc,
        iterable: lowerStatementExpression(statement.iterable, context),
        body
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

    if (hoisted !== null && typeof hoisted !== 'undefined') {
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

    if (argument !== null && typeof argument !== 'undefined') {
      hoisted = lowerArrayMethodSubexpressions(argument, context)
    }

    if (hoisted !== null && typeof hoisted !== 'undefined') {
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

function lowerOptionalStatementBody(statement: LowerNode | null | undefined, context: LowerContext): LowerNode | null {
  if (statement === null || typeof statement === 'undefined') {
    return null
  }

  return lowerStatementBody(statement, context)
}

function lowerOptionalStatementExpression(
  expression: LowerNode | null | undefined,
  context: LowerContext
): LowerNode | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  return lowerStatementExpression(expression, context)
}

function lowerOptionalForInitializer(init: LowerNode | null | undefined, context: LowerContext): LowerNode | null {
  if (init === null || typeof init === 'undefined') {
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

function nullableNode(value: LowerNode | null | undefined): LowerNode | null {
  if (value !== null && typeof value !== 'undefined') {
    return value
  }

  return null
}

function copyStringArray(values: string[] | null | undefined): string[] {
  const result: string[] = []

  for (let index = 0; index < (values ?? []).length; index = index + 1) {
    result.push((values ?? [])[index])
  }

  return result
}

function arrayHoistExpression(value: ArrayExpressionHoist | null, fallback: LowerNode): LowerNode {
  if (value !== null && typeof value !== 'undefined') {
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
  let declaredType = fallbackString(param.valueType, 'unknown')
  const paramDeclaredType = param.declaredType

  if (paramDeclaredType !== null && typeof paramDeclaredType !== 'undefined') {
    declaredType = paramDeclaredType
  }

  const declared = resolveDeclaredType(declaredType, context)
  const promiseValueType = nullableString(declared.promiseValueType)
  const shape = lowerParamShape(param, declared)
  let functionType = declared.functionType

  if (param.functionType !== null && typeof param.functionType !== 'undefined') {
    functionType = param.functionType
  }

  const loweredParam: LowerNode = {
    name: param.name,
    loc: param.loc,
    declaredType,
    optional: param.optional === true,
    rest: param.rest === true,
    valueType: fallbackString(param.valueType, fallbackString(declared.valueType, 'unknown')),
    typeRef: nullableNode(param.typeRef),
    nullable: param.nullable === true || declared.nullable,
    arrayElementType: declared.arrayElementType,
    arrayElementDeclaredType: declared.arrayElementDeclaredType,
    arrayElementFunctionType: nullableNode(declared.arrayElementFunctionType),
    promiseValueType,
    functionType,
    shape,
    defaultValue: null
  }
  const libraryRuntimeRequirements = declared.libraryRuntimeRequirements

  if (libraryRuntimeRequirements !== null && typeof libraryRuntimeRequirements !== 'undefined') {
    loweredParam.libraryRuntimeRequirements = libraryRuntimeRequirements
  }

  if (param.defaultValue !== null && typeof param.defaultValue !== 'undefined') {
    loweredParam.defaultValue = lowerExpression(param.defaultValue, context)
  }

  return loweredParam
}

function lowerParamShape(param: LowerNode, declared: LowerResolvedType): LowerNode | null {
  const paramShape = nullableNode(param.shape)

  if (paramShape !== null && typeof paramShape !== 'undefined') {
    return paramShape
  }

  return declared.shape
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
  if (handler === null || typeof handler === 'undefined') {
    return null
  }

  let previous: LowerNode | null = null
  let hadPrevious = false

  if (handler.param !== null && typeof handler.param !== 'undefined') {
    hadPrevious = context.variables.has(handler.param)

    if (hadPrevious) {
      const found = context.variables.get(handler.param)

      if (found !== null && typeof found !== 'undefined') {
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

  if (handler.param !== null && typeof handler.param !== 'undefined') {
    if (hadPrevious && previous !== null && typeof previous !== 'undefined') {
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

function pushLowerVariable(context: LowerContext, name: string, variable: LowerNode): LowerVariableScopeState {
  const previous = context.variables.get(name)
  const hadPrevious = previous !== null && typeof previous !== 'undefined'

  context.variables.set(name, variable)

  return {
    hadPrevious,
    previous: hadPrevious ? previous : null
  }
}

function restoreLowerVariable(context: LowerContext, name: string, state: LowerVariableScopeState): void {
  if (state.hadPrevious && state.previous !== null && typeof state.previous !== 'undefined') {
    context.variables.set(name, state.previous)
    return
  }

  context.variables.delete(name)
}

function forOfLowerVariable(statement: LowerNode): LowerNode {
  return {
    valueType: fallbackString(statement.valueType, 'unknown'),
    nullable: statement.nullable === true,
    arrayElementType: nullableString(statement.arrayElementType),
    arrayElementDeclaredType: nullableString(statement.arrayElementDeclaredType),
    arrayElementFunctionType: nullableNode(statement.arrayElementFunctionType),
    promiseValueType: nullableString(statement.promiseValueType),
    functionType: nullableNode(statement.functionType),
    shape: nullableNode(statement.shape),
    typeRef: nullableNode(statement.typeRef)
  }
}

function forOfBindingLowerVariable(binding: ArrayBindingElement): LowerNode {
  return {
    valueType: fallbackString(binding.valueType, 'unknown'),
    nullable: binding.nullable === true,
    arrayElementType: nullableString(binding.arrayElementType),
    arrayElementDeclaredType: nullableString(binding.arrayElementDeclaredType),
    arrayElementFunctionType: nullableNode(binding.arrayElementFunctionType),
    promiseValueType: nullableString(binding.promiseValueType),
    functionType: nullableNode(binding.functionType),
    shape: nullableNode(binding.shape)
  }
}

function forOfBindingDeclaration(statement: LowerNode, binding: ArrayBindingElement, variable: LowerNode): LowerNode {
  const valueType = fallbackString(variable.valueType, 'unknown')

  return {
    type: 'VariableDeclaration',
    kind: statement.kind,
    exported: false,
    name: binding.name,
    loc: binding.loc,
    declaredType: null,
    valueType,
    nullable: variable.nullable === true,
    arrayElementType: nullableString(variable.arrayElementType),
    arrayElementDeclaredType: nullableString(variable.arrayElementDeclaredType),
    arrayElementFunctionType: nullableNode(variable.arrayElementFunctionType),
    promiseValueType: nullableString(variable.promiseValueType),
    functionType: nullableNode(variable.functionType),
    shape: nullableNode(variable.shape),
    init: {
      type: 'IndexExpression',
      object: {
        type: 'Reference',
        path: [statement.name],
        loc: statement.nameLoc,
        valueType: 'array',
        arrayElementType: nullableString(statement.arrayElementType),
        arrayElementDeclaredType: nullableString(statement.arrayElementDeclaredType)
      },
      index: {
        type: 'NumberLiteral',
        value: `${binding.index}`,
        loc: binding.loc,
        valueType: 'number'
      },
      loc: binding.loc,
      valueType
    }
  }
}

function prependForOfBindingDeclarations(body: LowerNode, declarations: LowerNode[]): LowerNode {
  if (declarations.length === 0) {
    return body
  }

  const statements: LowerNode[] = []

  for (const declaration of declarations) {
    statements.push(declaration)
  }

  if (body.type === 'BlockStatement') {
    for (const statement of body.body) {
      statements.push(statement)
    }

    return {
      type: 'BlockStatement',
      body: statements,
      loc: body.loc
    }
  }

  statements.push(body)

  return {
    type: 'BlockStatement',
    body: statements,
    loc: body.loc
  }
}

function lowerForOfBindingElements(elements: ArrayBindingElement[] | null | undefined): ArrayBindingElement[] | null {
  if (elements === null || typeof elements === 'undefined') {
    return null
  }

  const lowered: ArrayBindingElement[] = []

  for (const element of elements) {
    lowered.push({
      name: element.name,
      index: element.index,
      loc: element.loc,
      valueType: fallbackString(element.valueType, 'unknown'),
      nullable: element.nullable === true,
      arrayElementType: nullableString(element.arrayElementType),
      arrayElementDeclaredType: nullableString(element.arrayElementDeclaredType),
      arrayElementFunctionType: nullableNode(element.arrayElementFunctionType),
      promiseValueType: nullableString(element.promiseValueType),
      functionType: nullableNode(element.functionType),
      shape: nullableNode(element.shape)
    })
  }

  return lowered
}

function appendLoweredStatement(out: LowerNode[], statements: LoweredStatement): void {
  for (let index = 0; index < statements.length; index = index + 1) {
    const statement = statements[index]
    out.push(statement)
  }
}

function lowerVariableDeclaration(
  statement: LowerNode,
  context: LowerContext,
  allowArrayMethodExpansion: boolean
): LoweredStatement {
  const declared = resolveDeclaredType(statement.declaredType, context)
  const init = variableDeclarationInitWithDeclaredType(
    lowerOptionalStatementExpression(statement.init, context),
    statement.declaredType,
    declared
  )
  const nullable = variableDeclarationNullable(declared, init)
  const shape = variableDeclarationShape(declared, statement, init)
  const functionType = variableDeclarationFunctionType(declared, statement, init)
  const arrayElementType = variableDeclarationArrayElementType(declared, statement, init)
  const arrayElementDeclaredType = variableDeclarationArrayElementDeclaredType(declared, statement, init)
  const arrayElementFunctionType = variableDeclarationArrayElementFunctionType(declared, statement, init)
  const promiseValueType = variableDeclarationPromiseValueType(declared, statement, init)
  const valueType = variableDeclarationValueType(declared, statement, init)
  const lowered = createLoweredVariableDeclaration(
    statement,
    init,
    nullable,
    shape,
    functionType,
    arrayElementType,
    arrayElementDeclaredType,
    arrayElementFunctionType,
    promiseValueType,
    valueType
  )

  if (!allowArrayMethodExpansion || statement.exported === true || init === null || typeof init === 'undefined') {
    declareLowerVariable(context, lowered)
    const statements = [lowered]

    return statements
  }

  const expanded = lowerArrayMethodVariableDeclaration(lowered, init, context)

  if (expanded === null || typeof expanded === 'undefined') {
    const hoisted = lowerArrayMethodSubexpressions(init, context)

    if (hoisted !== null && typeof hoisted !== 'undefined') {
      const declaration = cloneVariableDeclarationWithInit(lowered, hoisted.expression)

      declareLoweredTopLevelVariables(context, hoisted.statements)
      declareLowerVariable(context, declaration)

      return prependLoweredStatements(hoisted.statements, declaration)
    }

    declareLowerVariable(context, lowered)
    const statements = [lowered]

    return statements
  }

  declareLoweredTopLevelVariables(context, expanded)

  return expanded
}

function variableDeclarationInitWithDeclaredType(
  init: LowerNode | null,
  declaredType: string | null | undefined,
  declared: LowerResolvedType
): LowerNode | null {
  if (init === null || typeof init === 'undefined' || init.type !== 'ArrayLiteral') {
    return init
  }

  const statementDeclaredType = nullableString(declaredType)

  if (statementDeclaredType === null || typeof statementDeclaredType === 'undefined') {
    return init
  }

  init.declaredType = statementDeclaredType
  init.nullable = init.nullable === true || declared.nullable

  const declaredValueType = nullableString(declared.valueType)

  if (declaredValueType !== null && typeof declaredValueType !== 'undefined') {
    init.valueType = declaredValueType
  }

  const declaredArrayElementType = nullableString(declared.arrayElementType)

  if (declaredArrayElementType !== null && typeof declaredArrayElementType !== 'undefined') {
    init.arrayElementType = declaredArrayElementType
  }

  const declaredArrayElementDeclaredType = nullableString(declared.arrayElementDeclaredType)

  if (declaredArrayElementDeclaredType !== null && typeof declaredArrayElementDeclaredType !== 'undefined') {
    init.arrayElementDeclaredType = declaredArrayElementDeclaredType
  }

  if (declared.arrayElementFunctionType !== null && typeof declared.arrayElementFunctionType !== 'undefined') {
    init.arrayElementFunctionType = declared.arrayElementFunctionType
  }

  return init
}

function createLoweredVariableDeclaration(
  statement: LowerNode,
  init: LowerNode | null,
  nullable: boolean,
  shape: LowerNode | null,
  functionType: LowerNode | null,
  arrayElementType: string | null,
  arrayElementDeclaredType: string | null,
  arrayElementFunctionType: LowerNode | null,
  promiseValueType: string | null,
  valueType: string
): LowerNode {
  const lowered: LowerNode = {
    type: 'VariableDeclaration',
    kind: statement.kind,
    exported: statement.exported,
    name: statement.name,
    loc: statement.loc,
    declaredType: statement.declaredType,
    inferredDeclaredType: statement.inferredDeclaredType,
    nullable,
    shape,
    functionType,
    arrayElementType,
    arrayElementDeclaredType,
    arrayElementFunctionType,
    promiseValueType,
    valueType,
    typeRef: nullableNode(statement.typeRef),
    init
  }

  return lowered
}

function variableDeclarationNullable(declared: LowerResolvedType, init: LowerNode | null): boolean {
  if (declared.nullable) {
    return true
  }

  if (init !== null && typeof init !== 'undefined' && init.nullable === true) {
    return true
  }

  return false
}

function variableDeclarationShape(
  declared: LowerResolvedType,
  statement: LowerNode,
  init: LowerNode | null
): LowerNode | null {
  if (declared.shape !== null && typeof declared.shape !== 'undefined') {
    return declared.shape
  }

  if (init !== null && typeof init !== 'undefined' && init.shape !== null && typeof init.shape !== 'undefined') {
    return init.shape
  }

  if (statement.shape !== null && typeof statement.shape !== 'undefined') {
    return statement.shape
  }

  return null
}

function variableDeclarationFunctionType(
  declared: LowerResolvedType,
  statement: LowerNode,
  init: LowerNode | null
): LowerNode | null {
  if (declared.functionType !== null && typeof declared.functionType !== 'undefined') {
    return declared.functionType
  }

  if (statement.functionType !== null && typeof statement.functionType !== 'undefined') {
    return statement.functionType
  }

  if (
    init !== null &&
    typeof init !== 'undefined' &&
    init.functionType !== null &&
    typeof init.functionType !== 'undefined'
  ) {
    return init.functionType
  }

  return null
}

function variableDeclarationArrayElementType(
  declared: LowerResolvedType,
  statement: LowerNode,
  init: LowerNode | null
): string | null {
  const declaredArrayElementType = nullableString(declared.arrayElementType)

  if (declaredArrayElementType !== null && typeof declaredArrayElementType !== 'undefined') {
    return declaredArrayElementType
  }

  const statementArrayElementType = nullableString(statement.arrayElementType)

  if (statementArrayElementType !== null && typeof statementArrayElementType !== 'undefined') {
    return statementArrayElementType
  }

  return inferArrayElementType(init)
}

function variableDeclarationArrayElementDeclaredType(
  declared: LowerResolvedType,
  statement: LowerNode,
  init: LowerNode | null
): string | null {
  const declaredArrayElementDeclaredType = nullableString(declared.arrayElementDeclaredType)

  if (declaredArrayElementDeclaredType !== null && typeof declaredArrayElementDeclaredType !== 'undefined') {
    return declaredArrayElementDeclaredType
  }

  const statementArrayElementDeclaredType = nullableString(statement.arrayElementDeclaredType)

  if (statementArrayElementDeclaredType !== null && typeof statementArrayElementDeclaredType !== 'undefined') {
    return statementArrayElementDeclaredType
  }

  return inferArrayElementDeclaredType(init)
}

function variableDeclarationArrayElementFunctionType(
  declared: LowerResolvedType,
  statement: LowerNode,
  init: LowerNode | null
): LowerNode | null {
  const declaredArrayElementFunctionType = nullableNode(declared.arrayElementFunctionType)

  if (declaredArrayElementFunctionType !== null && typeof declaredArrayElementFunctionType !== 'undefined') {
    return declaredArrayElementFunctionType
  }

  const statementArrayElementFunctionType = nullableNode(statement.arrayElementFunctionType)

  if (statementArrayElementFunctionType !== null && typeof statementArrayElementFunctionType !== 'undefined') {
    return statementArrayElementFunctionType
  }

  if (init !== null && typeof init !== 'undefined') {
    return nullableNode(init.arrayElementFunctionType)
  }

  return null
}

function variableDeclarationPromiseValueType(
  declared: LowerResolvedType,
  statement: LowerNode,
  init: LowerNode | null
): string | null {
  const declaredPromiseValueType = nullableString(declared.promiseValueType)

  if (declaredPromiseValueType !== null && typeof declaredPromiseValueType !== 'undefined') {
    return declaredPromiseValueType
  }

  const statementPromiseValueType = nullableString(statement.promiseValueType)

  if (statementPromiseValueType !== null && typeof statementPromiseValueType !== 'undefined') {
    return statementPromiseValueType
  }

  return inferPromiseValueType(init)
}

function variableDeclarationValueType(
  declared: LowerResolvedType,
  statement: LowerNode,
  init: LowerNode | null
): string {
  const declaredValueType = nullableString(declared.valueType)

  if (declaredValueType !== null && typeof declaredValueType !== 'undefined') {
    return declaredValueType
  }

  const statementValueType = nullableString(statement.valueType)

  if (statementValueType !== null && typeof statementValueType !== 'undefined' && statementValueType !== 'unknown') {
    return statementValueType
  }

  const statementDeclaredType = nullableString(statement.declaredType)

  if (statementDeclaredType !== null && typeof statementDeclaredType !== 'undefined') {
    return statementDeclaredType
  }

  if (init !== null && typeof init !== 'undefined') {
    if (init.type === 'ArrowFunctionExpression') {
      return 'function'
    }

    const initValueType = nullableString(init.valueType)

    if (initValueType !== null && typeof initValueType !== 'undefined') {
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
    arrayElementFunctionType: nullableNode(statement.arrayElementFunctionType),
    promiseValueType: nullableString(statement.promiseValueType),
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
    arrayElementFunctionType: nullableNode(statement.arrayElementFunctionType),
    promiseValueType: nullableString(statement.promiseValueType),
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

  if (receiver === null || typeof receiver === 'undefined') {
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
    arrayElementFunctionType: nullableNode(init.arrayElementFunctionType),
    promiseValueType: nullableString(init.promiseValueType),
    functionType: nullableNode(init.functionType),
    shape: nullableNode(init.shape),
    loc: init.loc
  }
  let expanded: LowerNode[] | null = null

  if (init.callee.property === 'filter') {
    expanded = lowerArrayFilterVariableDeclaration(statement, expandedInit, context)
  } else if (init.callee.property === 'find') {
    expanded = lowerArrayFindVariableDeclaration(statement, expandedInit, context)
  } else if (init.callee.property === 'some') {
    expanded = lowerArraySomeVariableDeclaration(statement, expandedInit, context)
  } else {
    expanded = lowerArrayMapVariableDeclaration(statement, expandedInit, context)
  }

  if (expanded === null || typeof expanded === 'undefined') {
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
    arrayElementFunctionType: nullableNode(callee.arrayElementFunctionType),
    promiseValueType: nullableString(callee.promiseValueType),
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

  if (isArraySomeMethodExpansionCall(expression)) {
    return lowerArraySomeMethodExpressionToTemp(expression, context)
  }

  return lowerArrayOutputMethodExpressionToTemp(expression, context)
}

function lowerArrayOutputMethodExpressionToTemp(
  expression: LowerNode,
  context: LowerContext
): ArrayExpressionHoist | null {
  if (!isArrayOutputMethodExpansionCall(expression)) {
    return null
  }

  const name = nextLowerName(context, 'inox_array_expr')
  const target = createArrayTempDeclaration(name, expression, expression.loc)
  const statements = lowerArrayMethodVariableDeclaration(target, expression, context)

  if (statements === null || typeof statements === 'undefined') {
    return null
  }

  const output = findVariableDeclaration(statements, name)

  if (output === null || typeof output === 'undefined') {
    return null
  }

  return {
    statements,
    expression: createArrayReferenceFromDeclaration(output, expression.loc)
  }
}

function lowerArrayFindMethodExpressionToTemp(
  expression: LowerNode,
  context: LowerContext
): ArrayExpressionHoist | null {
  if (!isArrayFindMethodExpansionCall(expression)) {
    return null
  }

  const name = nextLowerName(context, 'inox_find_expr')
  const target = createFindTempDeclaration(name, expression, expression.loc)
  const statements = lowerArrayMethodVariableDeclaration(target, expression, context)

  if (statements === null || typeof statements === 'undefined') {
    return null
  }

  const output = findVariableDeclaration(statements, name)

  if (output === null || typeof output === 'undefined') {
    return null
  }

  return {
    statements,
    expression: createValueReferenceFromDeclaration(output, expression.loc)
  }
}

function lowerArraySomeMethodExpressionToTemp(
  expression: LowerNode,
  context: LowerContext
): ArrayExpressionHoist | null {
  if (!isArraySomeMethodExpansionCall(expression)) {
    return null
  }

  const name = nextLowerName(context, 'inox_some_expr')
  const target = createSomeTempDeclaration(name, expression, expression.loc)
  const statements = lowerArrayMethodVariableDeclaration(target, expression, context)

  if (statements === null || typeof statements === 'undefined') {
    return null
  }

  const output = findVariableDeclaration(statements, name)

  if (output === null || typeof output === 'undefined') {
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

    if (hoisted === null || typeof hoisted === 'undefined') {
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

  if (root !== null && typeof root !== 'undefined') {
    return root
  }

  if (expression.type === 'ArrowFunctionExpression') {
    return null
  }

  if (expression.type === 'CallExpression' || expression.type === 'OptionalCallExpression') {
    const args = lowerArrayMethodExpressionList(expression.args, context)

    if (args === null || typeof args === 'undefined') {
      return null
    }

    return {
      statements: args.statements,
      expression: cloneCallExpressionWithArgs(expression, args.expressions)
    }
  }

  if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
    const object = lowerArrayMethodSubexpressions(expression.object, context)

    if (object === null || typeof object === 'undefined') {
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

    if (object !== null && typeof object !== 'undefined') {
      appendLoweredHoistStatements(statements, object.statements)
      changed = true
    }

    if (index !== null && typeof index !== 'undefined') {
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

    if (left !== null && typeof left !== 'undefined') {
      appendLoweredHoistStatements(statements, left.statements)
      changed = true
    }

    if (right !== null && typeof right !== 'undefined') {
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

    if (operand === null || typeof operand === 'undefined') {
      return null
    }

    return {
      statements: operand.statements,
      expression: cloneUnaryOrTypeAssertionExpressionWithOperand(expression, operand.expression)
    }
  }

  if (expression.type === 'ArrayLiteral') {
    const elements = lowerArrayMethodExpressionList(expression.elements, context)

    if (elements === null || typeof elements === 'undefined') {
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

      if (hoisted === null || typeof hoisted === 'undefined') {
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
    arrayElementFunctionType: nullableNode(expression.arrayElementFunctionType),
    promiseValueType: nullableString(expression.promiseValueType),
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
    arrayElementFunctionType: nullableNode(expression.arrayElementFunctionType),
    promiseValueType: nullableString(expression.promiseValueType),
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
    arrayElementFunctionType: nullableNode(expression.arrayElementFunctionType),
    promiseValueType: nullableString(expression.promiseValueType),
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
    arrayElementFunctionType: nullableNode(expression.arrayElementFunctionType),
    promiseValueType: nullableString(expression.promiseValueType),
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
    arrayElementFunctionType: nullableNode(expression.arrayElementFunctionType),
    promiseValueType: nullableString(expression.promiseValueType),
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
    arrayElementFunctionType: nullableNode(expression.arrayElementFunctionType),
    promiseValueType: nullableString(expression.promiseValueType),
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
    arrayElementFunctionType: nullableNode(expression.arrayElementFunctionType),
    promiseValueType: nullableString(expression.promiseValueType),
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
      arrayElementFunctionType: nullableNode(expression.arrayElementFunctionType),
      promiseValueType: nullableString(expression.promiseValueType),
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
    arrayElementFunctionType: nullableNode(expression.arrayElementFunctionType),
    promiseValueType: nullableString(expression.promiseValueType),
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
    arrayElementFunctionType: nullableNode(expression.arrayElementFunctionType),
    promiseValueType: nullableString(expression.promiseValueType),
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
    arrayElementFunctionType: nullableNode(expression.arrayElementFunctionType),
    promiseValueType: nullableString(expression.promiseValueType),
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

    if (hoisted === null || typeof hoisted === 'undefined') {
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
    expression.callee.property === 'map' ||
    expression.callee.property === 'some'
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

function isArraySomeMethodExpansionCall(expression: LowerNode): boolean {
  if (!isArrayMethodExpansionCall(expression)) {
    return false
  }

  return expression.callee.property === 'some'
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
    predicate = createTruthyCondition(
      createReference(itemName, receiverElement, receiver.loc),
      receiverElement.valueType
    )
  } else if (isArrowCallbackWithMaxParams(callback, 2)) {
    const returned = resolveSimpleArrowReturnExpression(callback)

    if (returned === null || typeof returned === 'undefined') {
      return null
    }

    predicate = replaceExpressionReferences(returned, replacements)
  }

  if (predicate === null || typeof predicate === 'undefined') {
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
    predicate = createTruthyCondition(
      createReference(itemName, receiverElement, receiver.loc),
      receiverElement.valueType
    )
  } else if (isArrowCallbackWithMaxParams(callback, 2)) {
    const returned = resolveSimpleArrowReturnExpression(callback)

    if (returned === null || typeof returned === 'undefined') {
      return null
    }

    predicate = replaceExpressionReferences(returned, replacements)
  }

  if (predicate === null || typeof predicate === 'undefined') {
    return null
  }

  const output = createArrayFindOutputDeclaration(statement, receiverElement)
  const foundValue = createReference(itemName, receiverElement, receiver.loc)

  return createArrayScalarLoopStatements(output, receiver, receiverElement, indexName, itemName, [
    {
      type: 'IfStatement',
      condition: lowerStatementExpression(predicate, context),
      consequent: {
        type: 'BlockStatement',
        body: [
          createAssignmentStatement(
            createNullableReference(statement.name, receiverElement, init.loc),
            foundValue,
            init.loc
          ),
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

function lowerArraySomeVariableDeclaration(
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

  const indexName = nextLowerName(context, 'inox_some_index')
  const valueParam = arrowCallbackParam(callback, 0)
  const indexParam = arrowCallbackParam(callback, 1)
  const itemName = arrayMethodItemName(valueParam, statement.name, context, 'inox_some_item')
  const replacements = createCallbackReplacements(valueParam, itemName, indexParam, indexName)
  let predicate: LowerNode | null = null

  if (isBooleanFilterCallback(callback)) {
    predicate = createTruthyCondition(
      createReference(itemName, receiverElement, receiver.loc),
      receiverElement.valueType
    )
  } else if (isArrowCallbackWithMaxParams(callback, 2)) {
    const returned = resolveSimpleArrowReturnExpression(callback)

    if (returned === null || typeof returned === 'undefined') {
      return null
    }

    predicate = replaceExpressionReferences(returned, replacements)
  }

  if (predicate === null || typeof predicate === 'undefined') {
    return null
  }

  const output = createArraySomeOutputDeclaration(statement)

  return createArrayScalarLoopStatements(output, receiver, receiverElement, indexName, itemName, [
    {
      type: 'IfStatement',
      condition: lowerStatementExpression(predicate, context),
      consequent: {
        type: 'BlockStatement',
        body: [
          createAssignmentStatement(
            createValueReferenceFromDeclaration(output, init.loc),
            {
              type: 'BooleanLiteral',
              value: true,
              valueType: 'boolean',
              loc: init.loc
            },
            init.loc
          ),
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

  if (callback === null || typeof callback === 'undefined') {
    return null
  }

  const arrowCallback = isArrowCallbackWithMaxParams(callback, 2)
  const functionReferenceCallback = isFunctionReferenceArrayCallback(callback)

  if (!arrowCallback && !functionReferenceCallback) {
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
  let mapped: LowerNode | null = null

  if (arrowCallback) {
    mapped = resolveSimpleArrowReturnExpression(callback)
  } else {
    mapped = createFunctionReferenceArrayMapCall(callback, itemName, indexName, receiverElement, init.loc)
  }

  if (mapped === null || typeof mapped === 'undefined') {
    return null
  }

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

function isFunctionReferenceArrayCallback(callback: LowerNode | null | undefined): boolean {
  return (
    callback !== null &&
    typeof callback !== 'undefined' &&
    callback.type === 'Reference' &&
    callback.functionType !== null &&
    typeof callback.functionType !== 'undefined'
  )
}

function createFunctionReferenceArrayMapCall(
  callback: LowerNode,
  itemName: string,
  indexName: string,
  receiverElement: ArrayElementInfo,
  loc: LowerNode['loc']
): LowerNode | null {
  const functionType = callback.functionType

  if (functionType === null || typeof functionType === 'undefined') {
    return null
  }

  const args: LowerNode[] = [createReference(itemName, receiverElement, loc)]

  if (functionType.params.length > 1) {
    args.push(createNumberReference(indexName, loc))
  }

  return {
    type: 'CallExpression',
    callee: callback,
    args,
    valueType: functionType.returnType,
    typeRef: functionType.returnTypeRef ?? null,
    nullable: functionType.returnNullable === true,
    arrayElementType: functionType.returnArrayElementType ?? null,
    arrayElementDeclaredType: functionType.returnArrayElementDeclaredType ?? null,
    promiseValueType: functionType.returnPromiseValueType ?? null,
    shape: functionType.returnShape ?? null,
    functionType: null,
    loc
  }
}

function arrowCallbackParam(callback: LowerNode | null | undefined, index: number): LowerNode | null {
  if (callback === null || typeof callback === 'undefined' || callback.type !== 'ArrowFunctionExpression') {
    return null
  }

  if (index >= callback.params.length) {
    return null
  }

  return callback.params[index]
}

function isArrowCallbackWithMaxParams(callback: LowerNode | null | undefined, maxParams: number): boolean {
  if (callback === null || typeof callback === 'undefined' || callback.type !== 'ArrowFunctionExpression') {
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
  if (valueParam !== null && typeof valueParam !== 'undefined' && lowerNameDiffers(valueParam.name, outputName)) {
    return valueParam.name
  }

  return nextLowerName(context, fallbackPrefix)
}

function arrayMethodElementType(statement: LowerNode, init: LowerNode, fallback: string): string {
  if (statement.arrayElementType !== null && typeof statement.arrayElementType !== 'undefined') {
    return statement.arrayElementType
  }

  if (init.arrayElementType !== null && typeof init.arrayElementType !== 'undefined') {
    return init.arrayElementType
  }

  return fallback
}

function arrayMethodElementDeclaredType(
  statement: LowerNode,
  init: LowerNode,
  receiverElement: ArrayElementInfo
): string {
  if (statement.arrayElementDeclaredType !== null && typeof statement.arrayElementDeclaredType !== 'undefined') {
    return statement.arrayElementDeclaredType
  }

  if (init.arrayElementDeclaredType !== null && typeof init.arrayElementDeclaredType !== 'undefined') {
    return init.arrayElementDeclaredType
  }

  const receiverDeclaredType = receiverElement.declaredType

  if (receiverDeclaredType !== null && typeof receiverDeclaredType !== 'undefined') {
    return receiverDeclaredType
  }

  return receiverElement.valueType
}

function arrayMapElementType(statement: LowerNode, init: LowerNode, mappedValue: LowerNode): string {
  if (statement.arrayElementType !== null && typeof statement.arrayElementType !== 'undefined') {
    return statement.arrayElementType
  }

  if (init.arrayElementType !== null && typeof init.arrayElementType !== 'undefined') {
    return init.arrayElementType
  }

  if (mappedValue.valueType !== null && typeof mappedValue.valueType !== 'undefined') {
    return mappedValue.valueType
  }

  return 'unknown'
}

function arrayMapElementDeclaredType(statement: LowerNode, init: LowerNode, mappedElementType: string): string {
  if (statement.arrayElementDeclaredType !== null && typeof statement.arrayElementDeclaredType !== 'undefined') {
    return statement.arrayElementDeclaredType
  }

  if (init.arrayElementDeclaredType !== null && typeof init.arrayElementDeclaredType !== 'undefined') {
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
    promiseValueType: nullableString(statement.promiseValueType),
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
        promiseValueType: null,
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

function createArrayScalarLoopStatements(
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
        promiseValueType: null,
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
  promiseValueType: string | null
  functionType: LowerNode | null
}

type Replacement = {
  name: string
  replacement: LowerNode
}

function resolveReceiverElementInfo(
  receiver: LowerNode,
  callback: LowerNode | null | undefined,
  context: LowerContext
): ArrayElementInfo {
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
    promiseValueType: receiverElementPromiseValueType(callbackParam, declared),
    functionType: receiverElementFunctionType(callbackParam, declared)
  }
}

function receiverElementDeclaredType(receiver: LowerNode, callbackParam: LowerNode | null): string | null {
  if (receiver.arrayElementDeclaredType !== null && typeof receiver.arrayElementDeclaredType !== 'undefined') {
    return receiver.arrayElementDeclaredType
  }

  if (receiver.arrayElementType !== null && typeof receiver.arrayElementType !== 'undefined') {
    return receiver.arrayElementType
  }

  if (callbackParam !== null && typeof callbackParam !== 'undefined') {
    if (callbackParam.declaredType !== null && typeof callbackParam.declaredType !== 'undefined') {
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
  if (receiver.arrayElementType !== null && typeof receiver.arrayElementType !== 'undefined') {
    return receiver.arrayElementType
  }

  if (callbackParam !== null && typeof callbackParam !== 'undefined') {
    if (callbackParam.valueType !== null && typeof callbackParam.valueType !== 'undefined') {
      return callbackParam.valueType
    }
  }

  const declaredValueType = declared.valueType

  if (declaredValueType !== null && typeof declaredValueType !== 'undefined') {
    return declaredValueType
  }

  return 'unknown'
}

function receiverElementShape(callbackParam: LowerNode | null, declared: LowerResolvedType): LowerNode | null {
  if (callbackParam !== null && typeof callbackParam !== 'undefined') {
    if (callbackParam.shape !== null && typeof callbackParam.shape !== 'undefined') {
      return callbackParam.shape
    }
  }

  return declared.shape
}

function receiverElementArrayElementType(callbackParam: LowerNode | null, declared: LowerResolvedType): string | null {
  if (callbackParam !== null && typeof callbackParam !== 'undefined') {
    if (callbackParam.arrayElementType !== null && typeof callbackParam.arrayElementType !== 'undefined') {
      return callbackParam.arrayElementType
    }
  }

  if (declared.arrayElementType !== null && typeof declared.arrayElementType !== 'undefined') {
    return declared.arrayElementType
  }

  return null
}

function receiverElementArrayElementDeclaredType(
  callbackParam: LowerNode | null,
  declared: LowerResolvedType
): string | null {
  if (callbackParam !== null && typeof callbackParam !== 'undefined') {
    if (
      callbackParam.arrayElementDeclaredType !== null &&
      typeof callbackParam.arrayElementDeclaredType !== 'undefined'
    ) {
      return callbackParam.arrayElementDeclaredType
    }
  }

  if (declared.arrayElementDeclaredType !== null && typeof declared.arrayElementDeclaredType !== 'undefined') {
    return declared.arrayElementDeclaredType
  }

  return null
}

function receiverElementPromiseValueType(callbackParam: LowerNode | null, declared: LowerResolvedType): string | null {
  if (callbackParam !== null && typeof callbackParam !== 'undefined') {
    if (callbackParam.promiseValueType !== null && typeof callbackParam.promiseValueType !== 'undefined') {
      return callbackParam.promiseValueType
    }
  }

  if (declared.promiseValueType !== null && typeof declared.promiseValueType !== 'undefined') {
    return declared.promiseValueType
  }

  return null
}

function receiverElementFunctionType(callbackParam: LowerNode | null, declared: LowerResolvedType): LowerNode | null {
  if (callbackParam !== null && typeof callbackParam !== 'undefined') {
    if (callbackParam.functionType !== null && typeof callbackParam.functionType !== 'undefined') {
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
    promiseValueType: nullableString(statement.promiseValueType),
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
  if (statement.arrayElementType !== null && typeof statement.arrayElementType !== 'undefined') {
    return statement.arrayElementType
  }

  return 'unknown'
}

function arrayOutputElementDeclaredType(statement: LowerNode, elementType: string): string {
  if (statement.arrayElementDeclaredType !== null && typeof statement.arrayElementDeclaredType !== 'undefined') {
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
    promiseValueType: element.promiseValueType,
    className: nullableString(statement.className),
    init: {
      type: 'NullLiteral',
      value: null,
      valueType: 'null',
      loc: statement.loc
    }
  }
}

function createArraySomeOutputDeclaration(statement: LowerNode): LowerNode {
  return {
    type: 'VariableDeclaration',
    kind: 'let',
    exported: statement.exported,
    name: statement.name,
    loc: statement.loc,
    declaredType: statement.declaredType,
    nullable: false,
    valueType: 'boolean',
    shape: null,
    functionType: null,
    arrayElementType: null,
    arrayElementDeclaredType: null,
    promiseValueType: null,
    className: null,
    init: {
      type: 'BooleanLiteral',
      value: false,
      valueType: 'boolean',
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
    promiseValueType: null,
    valueType: 'array',
    init
  }
}

function arrayTempElementType(init: LowerNode): string {
  const inferred = inferArrayElementType(init)

  if (init.arrayElementType !== null && typeof init.arrayElementType !== 'undefined') {
    return init.arrayElementType
  }

  if (inferred !== null && typeof inferred !== 'undefined') {
    return inferred
  }

  return 'unknown'
}

function arrayTempElementDeclaredType(init: LowerNode, elementType: string): string {
  const inferred = inferArrayElementDeclaredType(init)

  if (init.arrayElementDeclaredType !== null && typeof init.arrayElementDeclaredType !== 'undefined') {
    return init.arrayElementDeclaredType
  }

  if (inferred !== null && typeof inferred !== 'undefined') {
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
    promiseValueType: nullableString(init.promiseValueType),
    valueType: fallbackString(init.valueType, 'unknown'),
    init
  }
}

function createSomeTempDeclaration(name: string, init: LowerNode, loc: LowerNode['loc']): LowerNode {
  return {
    type: 'VariableDeclaration',
    kind: 'let',
    exported: false,
    name,
    loc,
    declaredType: null,
    nullable: false,
    shape: null,
    functionType: null,
    arrayElementType: null,
    arrayElementDeclaredType: null,
    promiseValueType: null,
    valueType: 'boolean',
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
    promiseValueType: element.promiseValueType,
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
    promiseValueType: element.promiseValueType,
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
    promiseValueType: null,
    shape: null,
    loc
  }
}

function createArrayPushStatement(
  arrayName: string,
  arrayInfo: LowerNode,
  value: LowerNode,
  loc: LowerNode['loc']
): LowerNode {
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
    promiseValueType: null,
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
    promiseValueType: declaration.promiseValueType ?? null,
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

  if (valueParam !== null && typeof valueParam !== 'undefined') {
    const valueReference = createReference(valueName, paramElementInfo(valueParam), valueParam.loc)

    replacements.push({
      name: valueParam.name,
      replacement: valueReference
    })
    appendArrayBindingReplacements(replacements, valueParam, valueReference)
  }

  if (indexParam !== null && typeof indexParam !== 'undefined') {
    replacements.push({
      name: indexParam.name,
      replacement: createNumberReference(indexName, indexParam.loc)
    })
  }

  return replacements
}

function appendArrayBindingReplacements(
  replacements: Replacement[],
  valueParam: LowerNode,
  valueReference: LowerNode
): void {
  const bindingElements: ArrayBindingElement[] = valueParam.bindingElements ?? []

  for (let index = 0; index < bindingElements.length; index = index + 1) {
    const binding = bindingElements[index]

    replacements.push({
      name: binding.name,
      replacement: createArrayIndexExpression(
        valueReference,
        {
          type: 'NumberLiteral',
          value: `${binding.index}`,
          valueType: 'number',
          loc: binding.loc
        },
        paramElementInfo(binding),
        binding.loc
      )
    })
  }
}

function paramElementInfo(param: LowerNode): ArrayElementInfo {
  return {
    valueType: fallbackString(param.valueType, 'unknown'),
    declaredType: nullableString(param.declaredType),
    shape: nullableNode(param.shape),
    arrayElementType: nullableString(param.arrayElementType),
    arrayElementDeclaredType: nullableString(param.arrayElementDeclaredType),
    promiseValueType: nullableString(param.promiseValueType),
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
    promiseValueType: info.promiseValueType,
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
    promiseValueType: info.promiseValueType,
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
    promiseValueType: null,
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

  if (valueType === 'object' || valueType === 'array' || valueType === 'bytes') {
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
  } else if (
    callback.body !== null &&
    typeof callback.body !== 'undefined' &&
    callback.body.type === 'BlockStatement'
  ) {
    statements = callback.body.body
  }

  if (statements === null || typeof statements === 'undefined' || statements.length !== 1) {
    return null
  }

  const statement = statements[0]

  if (
    statement.type !== 'ReturnStatement' ||
    statement.argument === null ||
    typeof statement.argument === 'undefined'
  ) {
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

    if (replacement !== null && typeof replacement !== 'undefined') {
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
  return (
    callback !== null &&
    typeof callback !== 'undefined' &&
    callback.type === 'Reference' &&
    callback.path.length === 1 &&
    callback.path[0] === 'Boolean'
  )
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
  const lowered = lowerExpression(expression, expressionContext(context))

  return lowered
}

function expressionContext(context: LowerContext): LowerExpressionContext {
  const result = {
    types: context.types,
    resolvedTypes: context.resolvedTypes,
    classNames: context.classNames,
    libraries: context.libraries,
    nextId: context.nextId,
    variables: context.variables,
    resolvingTypes: context.resolvingTypes,
    typeSubstitutions: context.typeSubstitutions,
    lowerStatement
  }

  return result
}

function inferArrayElementType(expression: LowerNode | null): string | null {
  if (expression === null || typeof expression === 'undefined' || expression.valueType !== 'array') {
    return null
  }

  return nullableString(expression.arrayElementType)
}

function inferArrayElementDeclaredType(expression: LowerNode | null): string | null {
  if (expression === null || typeof expression === 'undefined' || expression.valueType !== 'array') {
    return null
  }

  if (expression.arrayElementDeclaredType !== null && typeof expression.arrayElementDeclaredType !== 'undefined') {
    return expression.arrayElementDeclaredType
  }

  return nullableString(expression.arrayElementType)
}

function inferPromiseValueType(expression: LowerNode | null): string | null {
  if (expression === null || typeof expression === 'undefined' || expression.valueType !== 'promise') {
    return null
  }

  return nullableString(expression.promiseValueType)
}
