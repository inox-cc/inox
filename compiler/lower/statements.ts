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
type LowerBindingScopeState = {
  name: string
  state: LowerVariableScopeState
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
        body: lowerStatementList(lowerNodeArrayOrEmpty(statement.body), context)
      }
    ]
  }

  if (statement.type === 'IfStatement') {
    return [
      {
        type: 'IfStatement',
        condition: lowerStatementExpression(statement.condition, context),
        consequent: lowerRequiredStatementBody(statement.consequent, context),
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
        body: lowerRequiredStatementBody(statement.body, context),
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
        body: lowerRequiredStatementBody(statement.body, context),
        loc: statement.loc
      }
    ]
  }

  if (statement.type === 'ForOfStatement') {
    const variableState = pushLowerVariable(context, statement.name, forOfLowerVariable(statement))
    const bindingStates: LowerBindingScopeState[] = []
    const bindingDeclarations: LowerNode[] = []
    let body: LowerNode = {
      type: 'BlockStatement',
      body: []
    }

    try {
      for (const binding of lowerArrayBindingElementsOrEmpty(statement.bindingElements)) {
        const bindingVariable = forOfBindingLowerVariable(binding)
        const state = pushLowerVariable(context, binding.name, bindingVariable)

        bindingStates.push({ name: binding.name, state })
        bindingDeclarations.push(forOfBindingDeclaration(statement, binding, bindingVariable, context))
      }

      body = lowerRequiredStatementBody(statement.body, context)
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
        asyncResultValueType: nullableString(statement.asyncResultValueType),
        functionType: nullableNode(statement.functionType),
        shape: nullableNode(statement.shape),
        typeRef: nullableNode(statement.typeRef),
        libraryCIteratorMethod: nullableString(statement.libraryCIteratorMethod),
        libraryCIteratorNextMethod: nullableString(statement.libraryCIteratorNextMethod),
        libraryCIteratorDoneMember: nullableString(statement.libraryCIteratorDoneMember),
        libraryCIteratorValueMember: nullableString(statement.libraryCIteratorValueMember),
        libraryCIteratorReceiverAdapter: nullableString(statement.libraryCIteratorReceiverAdapter),
        libraryCIteratorValueAdapter: nullableString(statement.libraryCIteratorValueAdapter),
        libraryCIteratorManagedValue: statement.libraryCIteratorManagedValue === true,
        libraryCIteratorRangeBased: statement.libraryCIteratorRangeBased === true,
        libraryCIteratorPreservesPendingException: statement.libraryCIteratorPreservesPendingException === true,
        libraryCIteratorCreationFailureMode: nullableString(statement.libraryCIteratorCreationFailureMode),
        libraryCIteratorNextFailureMode: nullableString(statement.libraryCIteratorNextFailureMode),
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
        block: lowerRequiredStatementBody(statement.block, context),
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

function lowerRequiredStatementBody(
  value: LowerNode | LowerNode[] | null | undefined,
  context: LowerContext
): LowerNode {
  const statement = lowerNodeOrNull(value)

  if (statement === null) {
    return {
      type: 'BlockStatement',
      body: []
    }
  }

  return lowerStatementBody(statement, context)
}

function lowerOptionalStatementBody(
  value: LowerNode | LowerNode[] | null | undefined,
  context: LowerContext
): LowerNode | null {
  const statement = lowerNodeOrNull(value)

  if (statement === null) {
    return null
  }

  return lowerStatementBody(statement, context)
}

function lowerOptionalStatementExpression(
  value: LowerNode | LowerNode[] | null | undefined,
  context: LowerContext
): LowerNode | null {
  const expression = lowerNodeOrNull(value)

  if (expression === null) {
    return null
  }

  return lowerStatementExpression(expression, context)
}

function lowerOptionalForInitializer(
  value: LowerNode | LowerNode[] | null | undefined,
  context: LowerContext
): LowerNode | null {
  const init = lowerNodeOrNull(value)

  if (init === null) {
    return null
  }

  return lowerForInitializer(init, context)
}

function lowerSwitchCases(cases: unknown, context: LowerContext): LowerNode[] {
  const lowered: LowerNode[] = []

  for (const item of lowerNodeArrayOrEmpty(cases)) {
    lowered.push({
      type: 'SwitchCase',
      test: lowerOptionalStatementExpression(item.test, context),
      consequent: lowerStatementList(lowerNodeArrayOrEmpty(item.consequent), context),
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

function nullableNodeArray(value: unknown): LowerNode[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  return value
}

function lowerNodeOrNull(value: LowerNode | LowerNode[] | null | undefined): LowerNode | null {
  if (value === null || typeof value === 'undefined' || Array.isArray(value)) {
    return null
  }

  return value
}

function lowerNodeArrayOrEmpty(value: unknown): LowerNode[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
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
  const asyncResultValueType = nullableString(declared.asyncResultValueType)
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
    className: nullableString(param.className),
    typeRef: nullableNode(param.typeRef) ?? declared.typeRef,
    runtimeTypeAlternatives: declared.runtimeTypeAlternatives,
    nullable: param.nullable === true || declared.nullable,
    asyncResultValueType,
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
  const declaredShape = nullableNode(declared.shape)

  if (paramShape === null) {
    return declaredShape
  }

  if (declaredShape === null) {
    return paramShape
  }

  return mergeLowerParamObjectShape(paramShape, declaredShape)
}

function mergeLowerParamObjectShape(preferred: LowerNode, fallback: LowerNode): LowerNode {
  const preferredFields = lowerNodeArrayOrEmpty(preferred.fields)
  const fallbackFields = lowerNodeArrayOrEmpty(fallback.fields)
  const fields: LowerNode[] = []

  for (const field of preferredFields) {
    fields.push(mergeLowerParamObjectField(field, lowerObjectFieldForName(fallbackFields, field.name)))
  }

  for (const field of fallbackFields) {
    if (lowerObjectFieldForName(preferredFields, field.name) === null) {
      fields.push(field)
    }
  }

  return {
    ...preferred,
    builtin: nullableString(preferred.builtin) ?? nullableString(fallback.builtin),
    compilerBuiltin: nullableString(preferred.compilerBuiltin) ?? nullableString(fallback.compilerBuiltin),
    dynamic: preferred.dynamic === true || fallback.dynamic === true,
    fields,
    functionCompanions: preferred.functionCompanions === true || fallback.functionCompanions === true,
    libraryCValueAdapter:
      nullableString(preferred.libraryCValueAdapter) ?? nullableString(fallback.libraryCValueAdapter),
    libraryTypeId: nullableString(preferred.libraryTypeId) ?? nullableString(fallback.libraryTypeId),
    libraryCppType: nullableString(preferred.libraryCppType) ?? nullableString(fallback.libraryCppType)
  }
}

function lowerObjectFieldForName(fields: LowerNode[], name: string): LowerNode | null {
  for (const field of fields) {
    if (field.name === name) {
      return field
    }
  }

  return null
}

function mergeLowerParamObjectField(preferred: LowerNode, fallback: LowerNode | null): LowerNode {
  if (fallback === null) {
    return preferred
  }

  return {
    ...preferred,
    shape: mergeLowerParamNullableShape(nullableNode(preferred.shape), nullableNode(fallback.shape)),
    functionType: mergeLowerParamFunctionType(
      nullableNode(preferred.functionType),
      nullableNode(fallback.functionType)
    )
  }
}

function mergeLowerParamNullableShape(preferred: LowerNode | null, fallback: LowerNode | null): LowerNode | null {
  if (preferred === null) {
    return fallback
  }

  if (fallback === null) {
    return preferred
  }

  return mergeLowerParamObjectShape(preferred, fallback)
}

function mergeLowerParamFunctionType(preferred: LowerNode | null, fallback: LowerNode | null): LowerNode | null {
  if (preferred === null) {
    return fallback
  }

  if (fallback === null) {
    return preferred
  }

  const preferredParams = lowerNodeArrayOrEmpty(preferred.params)
  const fallbackParams = lowerNodeArrayOrEmpty(fallback.params)
  const params: LowerNode[] = []

  for (let index = 0; index < preferredParams.length; index = index + 1) {
    const preferredParam = preferredParams[index]
    const fallbackParam = fallbackParams[index] ?? null

    if (fallbackParam === null) {
      params.push(preferredParam)
      continue
    }

    params.push({
      ...preferredParam,
      shape: mergeLowerParamNullableShape(nullableNode(preferredParam.shape), nullableNode(fallbackParam.shape)),
      functionType: mergeLowerParamFunctionType(
        nullableNode(preferredParam.functionType),
        nullableNode(fallbackParam.functionType)
      )
    })
  }

  for (let index = preferredParams.length; index < fallbackParams.length; index = index + 1) {
    params.push(fallbackParams[index])
  }

  return {
    ...preferred,
    params,
    returnShape: mergeLowerParamNullableShape(nullableNode(preferred.returnShape), nullableNode(fallback.returnShape))
  }
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

  const body = lowerRequiredStatementBody(handler.body, context)

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
    asyncResultValueType: nullableString(statement.asyncResultValueType),
    functionType: nullableNode(statement.functionType),
    shape: nullableNode(statement.shape),
    typeRef: nullableNode(statement.typeRef)
  }
}

function forOfBindingLowerVariable(binding: ArrayBindingElement): LowerNode {
  return {
    valueType: fallbackString(binding.valueType, 'unknown'),
    nullable: binding.nullable === true,
    asyncResultValueType: nullableString(binding.asyncResultValueType),
    functionType: nullableNode(binding.functionType),
    shape: nullableNode(binding.shape),
    typeRef: nullableNode(binding.typeRef)
  }
}

function forOfBindingDeclaration(
  statement: LowerNode,
  binding: ArrayBindingElement,
  variable: LowerNode,
  context: LowerContext
): LowerNode {
  const valueType = fallbackString(variable.valueType, 'unknown')
  const initializer = binding.init ?? {
    type: 'IndexExpression',
    object: {
      type: 'Reference',
      path: [statement.name],
      loc: statement.nameLoc,
      valueType: fallbackString(statement.valueType, 'unknown'),
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

  return {
    type: 'VariableDeclaration',
    kind: statement.kind,
    exported: false,
    name: binding.name,
    loc: binding.loc,
    declaredType: null,
    valueType,
    nullable: variable.nullable === true,
    asyncResultValueType: nullableString(variable.asyncResultValueType),
    functionType: nullableNode(variable.functionType),
    shape: nullableNode(variable.shape),
    typeRef: nullableNode(variable.typeRef),
    init: lowerStatementExpression(initializer, context)
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
    for (const statement of lowerNodeArrayOrEmpty(body.body)) {
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

function lowerForOfBindingElements(elements: unknown): ArrayBindingElement[] | null {
  if (!Array.isArray(elements)) {
    return null
  }

  const lowered: ArrayBindingElement[] = []

  for (const element of lowerArrayBindingElementsOrEmpty(elements)) {
    lowered.push({
      name: element.name,
      index: element.index,
      loc: element.loc,
      valueType: fallbackString(element.valueType, 'unknown'),
      nullable: element.nullable === true,
      asyncResultValueType: nullableString(element.asyncResultValueType),
      functionType: nullableNode(element.functionType),
      shape: element.shape ?? null,
      typeRef: element.typeRef ?? null
    })
  }

  return lowered
}

function lowerArrayBindingElementsOrEmpty(value: unknown): ArrayBindingElement[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
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
  const nullable = variableDeclarationNullable(declared, statement.declaredType, init)
  const shape = variableDeclarationShape(declared, statement, init)
  const functionType = variableDeclarationFunctionType(declared, statement, init)
  const asyncResultValueType = variableDeclarationAsyncResultValueType(declared, statement, init)
  const valueType = variableDeclarationValueType(declared, statement, init)
  const runtimeTypeAlternatives = variableDeclarationRuntimeTypeAlternatives(declared, statement, init, context)
  const lowered = createLoweredVariableDeclaration(
    statement,
    init,
    nullable,
    shape,
    functionType,
    asyncResultValueType,
    valueType,
    runtimeTypeAlternatives
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
  asyncResultValueType: string | null,
  valueType: string,
  runtimeTypeAlternatives: LowerNode[] | null
): LowerNode {
  if (
    statement.inline === true &&
    init !== null &&
    typeof init !== 'undefined' &&
    init.type === 'ArrowFunctionExpression'
  ) {
    init.inline = true
    init.inlineLoc = nullableNode(statement.inlineLoc)
  }

  const lowered: LowerNode = {
    type: 'VariableDeclaration',
    kind: statement.kind,
    exported: statement.exported,
    inline: statement.inline === true,
    inlineLoc: nullableNode(statement.inlineLoc),
    name: statement.name,
    loc: statement.loc,
    declaredType: statement.declaredType,
    inferredDeclaredType: statement.inferredDeclaredType,
    nullable,
    shape,
    functionType,
    asyncResultValueType,
    valueType,
    runtimeTypeAlternatives,
    typeRef: nullableNode(statement.typeRef),
    libraryCppType: nullableString(statement.libraryCppType),
    libraryRuntimeRequirements: copyStringArray(statement.libraryRuntimeRequirements),
    init
  }

  return lowered
}

function variableDeclarationRuntimeTypeAlternatives(
  declared: LowerResolvedType,
  statement: LowerNode,
  init: LowerNode | null,
  context: LowerContext
): LowerNode[] | null {
  if (declared.runtimeTypeAlternatives !== null) {
    return declared.runtimeTypeAlternatives
  }

  if (Array.isArray(statement.runtimeTypeAlternatives)) {
    return statement.runtimeTypeAlternatives
  }

  if (init !== null && Array.isArray(init.runtimeTypeAlternatives)) {
    return init.runtimeTypeAlternatives
  }

  const inferredDeclaredType = nullableString(statement.inferredDeclaredType) ?? nullableString(init?.declaredType)

  if (inferredDeclaredType === null) {
    return null
  }

  return resolveDeclaredType(inferredDeclaredType, context).runtimeTypeAlternatives
}

function variableDeclarationNullable(
  declared: LowerResolvedType,
  declaredType: string | null | undefined,
  init: LowerNode | null
): boolean {
  if (nullableString(declaredType) !== null) {
    return declared.nullable
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
  const declaredShape = nullableNode(declared.shape)
  const statementShape = nullableNode(statement.shape)

  if (statementShape !== null) {
    return mergeLowerParamNullableShape(statementShape, declaredShape)
  }

  const initShape = nullableNode(init?.shape)

  if (initShape !== null) {
    return mergeLowerParamNullableShape(initShape, declaredShape)
  }

  return declaredShape
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

function variableDeclarationAsyncResultValueType(
  declared: LowerResolvedType,
  statement: LowerNode,
  init: LowerNode | null
): string | null {
  const declaredAsyncResultValueType = nullableString(declared.asyncResultValueType)

  if (declaredAsyncResultValueType !== null && typeof declaredAsyncResultValueType !== 'undefined') {
    return declaredAsyncResultValueType
  }

  const statementAsyncResultValueType = nullableString(statement.asyncResultValueType)

  if (statementAsyncResultValueType !== null && typeof statementAsyncResultValueType !== 'undefined') {
    return statementAsyncResultValueType
  }

  return inferAsyncResultValueType(init)
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
    asyncResultValueType: nullableString(statement.asyncResultValueType),
    runtimeTypeAlternatives: nullableNodeArray(statement.runtimeTypeAlternatives),
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

function inferAsyncResultValueType(expression: LowerNode | null): string | null {
  if (expression === null || typeof expression === 'undefined' || expression.valueType !== 'async-result') {
    return null
  }

  return nullableString(expression.asyncResultValueType)
}
