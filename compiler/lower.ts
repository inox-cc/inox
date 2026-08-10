import { lowerParam, lowerStatementList } from './lower/statements.ts'
import type { LowerContext, LowerResolvedType } from './lower/type-resolution.ts'
import { createLowerContext, resolveDeclaredType, resolveObjectShape } from './lower/type-resolution.ts'
import type { AnyNode, ProgramNode } from './types.ts'
import { compilerLibraryNativeTypeForId } from './extensions/library-set.ts'
import type { CompilerLibrarySet, TypeRef } from './extensions/types.ts'

export function lowerProgram(
  ast: ProgramNode,
  libraries: CompilerLibrarySet | null | undefined = undefined
): ProgramNode {
  const context = createLowerContext(ast, libraries)
  const body: AnyNode[] = []

  for (let itemIndex = 0; itemIndex < ast.body.length; itemIndex = itemIndex + 1) {
    const item = ast.body[itemIndex]
    appendLoweredTopLevelItem(body, lowerTopLevelItem(item, context))
  }

  return {
    type: 'HirProgram',
    body
  }
}

type LoweredTopLevelItem = AnyNode[]

type LowerTypeParameterState = {
  name: string
  previousType: AnyNode | null
  previousResolvedType: LowerResolvedType | null
}

function appendLoweredTopLevelItem(out: AnyNode[], items: LoweredTopLevelItem): void {
  for (const item of items) {
    out.push(item)
  }
}

function lowerTopLevelItem(item: AnyNode, context: LowerContext): LoweredTopLevelItem {
  if (item.type === 'ImportDeclaration') {
    const specifiers: AnyNode[] = []

    for (const specifier of item.specifiers) {
      specifiers.push(specifier)
    }

    return [
      {
        type: 'ImportDeclaration',
        typeOnly: item.typeOnly,
        specifiers,
        source: item.source,
        loc: item.loc
      }
    ]
  }

  if (item.type === 'ExportDeclaration') {
    return [
      {
        type: 'ExportDeclaration',
        typeOnly: item.typeOnly,
        specifiers: item.specifiers,
        source: item.source,
        loc: item.loc
      }
    ]
  }

  if (
    item.type === 'VariableDeclaration' &&
    item.inline === true &&
    item.kind === 'const' &&
    item.init !== null &&
    typeof item.init !== 'undefined' &&
    item.init.type === 'ArrowFunctionExpression'
  ) {
    const loweredItems = lowerStatementList([item], context)
    const lowered = loweredItems[0]

    if (lowered !== null && typeof lowered !== 'undefined') {
      return [inlineFunctionDeclarationFromVariable(lowered)]
    }
  }

  if (item.type === 'FunctionDeclaration') {
    const typeParameterState = pushLowerTypeParameters(item, context)

    try {
      const returnTypeName = lowerNodeReturnTypeName(item)
      const returnType = resolveDeclaredType(returnTypeName, context)

      if (item.returnShape !== null && typeof item.returnShape !== 'undefined') {
        returnType.shape = resolveObjectShape(item.returnShape, context)
      }

      const lowered: AnyNode = {
        type: 'FunctionDeclaration',
        exported: item.exported,
        inline: item.inline === true,
        inlineLoc: nullableNode(item.inlineLoc),
        async: item.async,
        name: item.name,
        loc: item.loc,
        params: lowerParamList(item.params, context),
        declaredReturnType: item.returnType,
        returnType: lowerReturnValueType(returnType.valueType, returnTypeName, item.returnTypeRef, context.libraries),
        returnRuntimeTypeAlternatives: returnType.runtimeTypeAlternatives,
        returnTypeRef: nullableNode(item.returnTypeRef),
        returnNullable: returnType.nullable,
        returnAsyncResultValueType: nullableString(returnType.asyncResultValueType),
        returnShape: returnType.shape,
        typePredicateParameterName: nullableString(item.typePredicateParameterName),
        typePredicateType: nullableString(item.typePredicateType),
        typePredicateLoc: nullableNode(item.typePredicateLoc),
        argumentNarrowing: nullableNode(item.argumentNarrowing),
        body: lowerStatementList(lowerNodeArrayOrEmpty(item.body), context)
      }
      const libraryRuntimeRequirements = returnType.libraryRuntimeRequirements

      if (libraryRuntimeRequirements !== null && typeof libraryRuntimeRequirements !== 'undefined') {
        lowered.libraryRuntimeRequirements = libraryRuntimeRequirements
      }
      const typeParameters = cloneLowerTypeParameters(item.typeParameters)

      if (typeParameters.length > 0) {
        lowered.typeParameters = typeParameters
      }

      return [lowered]
    } finally {
      restoreLowerTypeParameters(typeParameterState, context)
    }
  }

  if (item.type === 'ClassDeclaration') {
    const typeParameterState = pushLowerTypeParameters(item, context)

    try {
      const lowered: AnyNode = {
        type: 'ClassDeclaration',
        exported: item.exported,
        name: item.name,
        loc: item.loc,
        shape: nullableNode(item.shape),
        fields: lowerClassFields(item.fields),
        methods: lowerClassMethods(item.methods, context)
      }
      const typeParameters = cloneLowerTypeParameters(item.typeParameters)

      if (typeParameters.length > 0) {
        lowered.typeParameters = typeParameters
      }

      return [lowered]
    } finally {
      restoreLowerTypeParameters(typeParameterState, context)
    }
  }

  return lowerStatementList([item], context)
}

function inlineFunctionDeclarationFromVariable(statement: AnyNode): AnyNode {
  const expression = statement.init
  const functionType = nullableNode(statement.functionType) ?? nullableNode(expression.functionType)
  const returnType = resolvedValueType(
    expression.returnType,
    resolvedValueType(functionType?.returnType, 'void')
  )
  let body: AnyNode[] = []

  if (expression.expressionBody === true) {
    body = [
      {
        type: 'ReturnStatement',
        argument: expression.body,
        loc: expression.loc
      }
    ]
  } else if (Array.isArray(expression.body)) {
    body = expression.body
  }

  return {
    type: 'FunctionDeclaration',
    exported: statement.exported === true,
    inline: true,
    inlineLoc: nullableNode(statement.inlineLoc),
    async: expression.async === true,
    name: statement.name,
    loc: statement.loc,
    params: expression.params,
    declaredReturnType: nullableString(expression.declaredReturnType),
    returnType,
    returnRuntimeTypeAlternatives: nullableNodeArray(expression.returnRuntimeTypeAlternatives),
    returnTypeRef: nullableNode(expression.returnTypeRef),
    returnNullable: expression.returnNullable === true,
    returnAsyncResultValueType: nullableString(expression.returnAsyncResultValueType),
    returnShape: nullableNode(expression.returnShape),
    body
  }
}

function cloneLowerTypeParameters(typeParameters: AnyNode[] | null | undefined): AnyNode[] {
  const cloned: AnyNode[] = []

  if (typeParameters === null || typeof typeParameters === 'undefined') {
    return cloned
  }

  for (const typeParameter of typeParameters) {
    cloned.push({
      name: typeParameter.name,
      constraint: nullableString(typeParameter.constraint),
      defaultType: nullableString(typeParameter.defaultType),
      loc: typeParameter.loc
    })
  }

  return cloned
}

function pushLowerTypeParameters(item: AnyNode, context: LowerContext): LowerTypeParameterState[] {
  const state: LowerTypeParameterState[] = []
  const typeParameters: AnyNode[] = item.typeParameters ?? []

  for (let index = 0; index < typeParameters.length; index = index + 1) {
    const typeParameter = typeParameters[index]
    const name: string = typeParameter.name
    const previousType = context.types.get(name) ?? null
    const previousResolvedType = context.resolvedTypes.get(name) ?? null
    let constraint = 'unknown'

    if (typeof typeParameter.constraint === 'string' && typeParameter.constraint.length > 0) {
      constraint = typeParameter.constraint
    }

    state.push({ name, previousType, previousResolvedType })
    context.types.set(name, { kind: 'alias', valueType: constraint })
    context.resolvedTypes.delete(name)
  }

  return state
}

function restoreLowerTypeParameters(state: LowerTypeParameterState[], context: LowerContext): void {
  for (let index = state.length - 1; index >= 0; index = index - 1) {
    const item = state[index]

    if (item === null || typeof item === 'undefined') {
      continue
    }

    if (item.previousType !== null) {
      context.types.set(item.name, item.previousType)
    } else {
      context.types.delete(item.name)
    }

    if (item.previousResolvedType !== null) {
      context.resolvedTypes.set(item.name, item.previousResolvedType)
    } else {
      context.resolvedTypes.delete(item.name)
    }
  }
}

function lowerParamList(params: AnyNode[], context: LowerContext): AnyNode[] {
  const lowered: AnyNode[] = []

  for (let paramIndex = 0; paramIndex < params.length; paramIndex = paramIndex + 1) {
    const param = params[paramIndex]
    lowered.push(lowerParam(param, context))
  }

  return lowered
}

function lowerClassFields(fields: AnyNode[] | null | undefined): AnyNode[] {
  const lowered: AnyNode[] = []

  if (fields === null || typeof fields === 'undefined') {
    return lowered
  }

  for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex = fieldIndex + 1) {
    const field = fields[fieldIndex]
    lowered.push(lowerClassField(field))
  }

  return lowered
}

function lowerClassField(field: AnyNode): AnyNode {
  return {
    type: 'FieldDefinition',
    name: field.name,
    static: field.static === true,
    staticLoc: nullableNode(field.staticLoc),
    readonly: field.readonly === true,
    ownership: nullableString(field.ownership),
    weakLoc: nullableNode(field.weakLoc),
    loc: field.loc,
    declaredType: resolvedValueType(field.declaredType, resolvedValueType(field.valueType, 'unknown')),
    optional: field.optional === true,
    valueType: resolvedValueType(field.valueType, 'unknown'),
    typeRef: nullableNode(field.typeRef),
    nullable: field.nullable === true,
    asyncResultValueType: nullableString(field.asyncResultValueType),
    shape: nullableNode(field.shape),
    functionType: nullableNode(field.functionType),
    className: nullableString(field.className)
  }
}

function lowerClassMethods(methods: AnyNode[] | null | undefined, context: LowerContext): AnyNode[] {
  const lowered: AnyNode[] = []

  if (methods === null || typeof methods === 'undefined') {
    return lowered
  }

  for (let methodIndex = 0; methodIndex < methods.length; methodIndex = methodIndex + 1) {
    const method = methods[methodIndex]
    lowered.push(lowerClassMethod(method, context))
  }

  return lowered
}

function lowerClassMethod(method: AnyNode, context: LowerContext): AnyNode {
  const returnTypeName = lowerClassMethodReturnTypeName(method)
  const returnType = resolveDeclaredType(returnTypeName, context)

  return {
    type: 'MethodDefinition',
    name: method.name,
    loc: method.loc,
    inline: method.inline === true,
    inlineLoc: nullableNode(method.inlineLoc),
    typeParameters: method.typeParameters ?? [],
    params: lowerParamList(method.params, context),
    declaredReturnType: nullableString(method.declaredReturnType),
    returnType: lowerReturnValueType(returnType.valueType, returnTypeName, method.returnTypeRef, context.libraries),
    returnRuntimeTypeAlternatives: returnType.runtimeTypeAlternatives,
    returnTypeRef: nullableNode(method.returnTypeRef),
    returnNullable: returnType.nullable,
    returnAsyncResultValueType: nullableString(returnType.asyncResultValueType),
    returnShape: nullableNode(returnType.shape),
    typePredicateParameterName: nullableString(method.typePredicateParameterName),
    typePredicateType: nullableString(method.typePredicateType),
    typePredicateLoc: nullableNode(method.typePredicateLoc),
    argumentNarrowing: nullableNode(method.argumentNarrowing),
    body: lowerStatementList(lowerNodeArrayOrEmpty(method.body), context)
  }
}

function lowerClassMethodReturnTypeName(method: AnyNode): string {
  if (method.declaredReturnType !== null && typeof method.declaredReturnType !== 'undefined') {
    return method.declaredReturnType
  }

  if (method.returnType !== null && typeof method.returnType !== 'undefined' && method.returnType !== 'unknown') {
    return method.returnType
  }

  if (!statementListHasValueReturn(lowerNodeArrayOrEmpty(method.body))) {
    return 'void'
  }

  return 'unknown'
}

function statementListHasValueReturn(statements: AnyNode[]): boolean {
  for (let index = 0; index < statements.length; index = index + 1) {
    if (statementHasValueReturn(statements[index])) {
      return true
    }
  }

  return false
}

function statementHasValueReturn(statement: AnyNode): boolean {
  if (statement.type === 'ReturnStatement') {
    return statement.argument !== null && typeof statement.argument !== 'undefined'
  }

  if (statement.type === 'BlockStatement') {
    return statementListHasValueReturn(lowerNodeArrayOrEmpty(statement.body))
  }

  if (statement.type === 'IfStatement') {
    const consequent = lowerNodeOrNull(statement.consequent)

    if (consequent !== null && statementHasValueReturn(consequent)) {
      return true
    }

    const alternate = lowerNodeOrNull(statement.alternate)

    if (alternate !== null) {
      return statementHasValueReturn(alternate)
    }
  }

  if (statement.type === 'WhileStatement') {
    const body = lowerNodeOrNull(statement.body)
    return body !== null && statementHasValueReturn(body)
  }

  if (statement.type === 'ForStatement') {
    const body = lowerNodeOrNull(statement.body)
    return body !== null && statementHasValueReturn(body)
  }

  if (statement.type === 'ForOfStatement') {
    const body = lowerNodeOrNull(statement.body)
    return body !== null && statementHasValueReturn(body)
  }

  if (statement.type === 'SwitchStatement') {
    const cases = lowerNodeArrayOrEmpty(statement.cases)

    for (let index = 0; index < cases.length; index = index + 1) {
      const item = cases[index]

      if (statementListHasValueReturn(lowerNodeArrayOrEmpty(item.consequent))) {
        return true
      }
    }
  }

  if (statement.type === 'TryStatement') {
    const block = lowerNodeOrNull(statement.block)

    if (block !== null && statementHasValueReturn(block)) {
      return true
    }

    const handler = lowerNodeOrNull(statement.handler)

    if (handler !== null) {
      const handlerBody = lowerNodeOrNull(handler.body)

      if (handlerBody !== null && statementHasValueReturn(handlerBody)) {
        return true
      }
    }

    const finalizer = lowerNodeOrNull(statement.finalizer)

    if (finalizer !== null) {
      return statementHasValueReturn(finalizer)
    }
  }

  return false
}

function lowerNodeReturnTypeName(node: AnyNode): string {
  if (node.returnType !== null && typeof node.returnType !== 'undefined') {
    return node.returnType
  }

  return 'unknown'
}

function resolvedValueType(value: string | null | undefined, fallback: string): string {
  if (value !== null && typeof value !== 'undefined' && value.length > 0) {
    return value
  }

  return fallback
}

function lowerReturnValueType(
  value: string | null | undefined,
  fallback: string,
  typeRef: TypeRef | null | undefined,
  libraries: CompilerLibrarySet
): string {
  if (typeRef !== null && typeof typeRef !== 'undefined' && typeRef.kind === 'nominal') {
    const nativeType = compilerLibraryNativeTypeForId(libraries, typeRef.typeId)

    if (nativeType !== null) {
      return nativeType.valueType
    }
  }

  return resolvedValueType(value, fallback)
}

function nullableString(value: string | null | undefined): string | null {
  if (value !== null && typeof value !== 'undefined' && value.length > 0) {
    return value
  }

  return null
}

function nullableNode(value: AnyNode | null | undefined): AnyNode | null {
  if (value !== null && typeof value !== 'undefined') {
    return value
  }

  return null
}

function nullableNodeArray(value: AnyNode[] | null | undefined): AnyNode[] | null {
  if (value !== null && typeof value !== 'undefined') {
    return value
  }

  return null
}

function lowerNodeOrNull(value: AnyNode | AnyNode[] | null | undefined): AnyNode | null {
  if (value === null || typeof value === 'undefined' || Array.isArray(value)) {
    return null
  }

  return value
}

function lowerNodeArrayOrEmpty(value: AnyNode | AnyNode[] | null | undefined): AnyNode[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
}
