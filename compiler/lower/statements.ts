import type { AnyNode, ArrayBindingElement } from '../types.ts'
import type { LowerExpressionContext } from './expressions.ts'
import { lowerExpression } from './expressions.ts'
import type { LowerContext, LowerResolvedType } from './type-resolution.ts'
import { resolveDeclaredType } from './type-resolution.ts'

type LowerNode = AnyNode
type LoweredStatement = LowerNode[]

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
    return lowerVariableDeclaration(statement, context)
  }

  if (statement.type === 'ExpressionStatement') {
    const expression = lowerStatementExpression(statement.expression, context)

    return [
      {
        type: 'ExpressionStatement',
        expression
      }
    ]
  }

  if (statement.type === 'ReturnStatement') {
    const argument = lowerOptionalStatementExpression(statement.argument, context)

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
    const lowered = lowerVariableDeclaration(init, context)

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
    promiseValueType: nullableString(binding.promiseValueType),
    functionType: nullableNode(binding.functionType),
    shape: nullableNode(binding.shape),
    typeRef: nullableNode(binding.typeRef)
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
    promiseValueType: nullableString(variable.promiseValueType),
    functionType: nullableNode(variable.functionType),
    shape: nullableNode(variable.shape),
    typeRef: nullableNode(variable.typeRef),
    init: {
      type: 'IndexExpression',
      object: {
        type: 'Reference',
        path: [statement.name],
        loc: statement.nameLoc,
        valueType: 'array',
        typeRef: nullableNode(statement.typeRef)
      },
      index: {
        type: 'NumberLiteral',
        value: `${binding.index}`,
        loc: binding.loc,
        valueType: 'number'
      },
      loc: binding.loc,
      valueType,
      typeRef: nullableNode(variable.typeRef)
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
      promiseValueType: nullableString(element.promiseValueType),
      functionType: nullableNode(element.functionType),
      shape: element.shape ?? null,
      typeRef: element.typeRef ?? null
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

function lowerVariableDeclaration(statement: LowerNode, context: LowerContext): LoweredStatement {
  const declared = resolveDeclaredType(statement.declaredType, context)
  const init = variableDeclarationInitWithDeclaredType(
    lowerOptionalStatementExpression(statement.init, context),
    statement.declaredType,
    declared
  )
  const nullable = variableDeclarationNullable(declared, init)
  const shape = variableDeclarationShape(declared, statement, init)
  const functionType = variableDeclarationFunctionType(declared, statement, init)
  const promiseValueType = variableDeclarationPromiseValueType(declared, statement, init)
  const valueType = variableDeclarationValueType(declared, statement, init)
  const lowered = createLoweredVariableDeclaration(
    statement,
    init,
    nullable,
    shape,
    functionType,
    promiseValueType,
    valueType
  )

  declareLowerVariable(context, lowered)

  return [lowered]
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

  return init
}

function createLoweredVariableDeclaration(
  statement: LowerNode,
  init: LowerNode | null,
  nullable: boolean,
  shape: LowerNode | null,
  functionType: LowerNode | null,
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
    promiseValueType,
    valueType,
    typeRef: nullableNode(statement.typeRef),
    libraryCppType: nullableString(statement.libraryCppType),
    libraryRuntimeRequirements: copyStringArray(statement.libraryRuntimeRequirements),
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

function declareLowerVariable(context: LowerContext, statement: LowerNode): void {
  if (statement.type !== 'VariableDeclaration') {
    return
  }

  context.variables.set(statement.name, {
    valueType: fallbackString(statement.valueType, 'unknown'),
    nullable: statement.nullable === true,
    promiseValueType: nullableString(statement.promiseValueType),
    functionType: nullableNode(statement.functionType),
    shape: nullableNode(statement.shape),
    className: nullableString(statement.className),
    typeRef: nullableNode(statement.typeRef)
  })
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

function inferPromiseValueType(expression: LowerNode | null): string | null {
  if (expression === null || typeof expression === 'undefined' || expression.valueType !== 'promise') {
    return null
  }

  return nullableString(expression.promiseValueType)
}
