import { collectIrTopLevelNodes } from './top-level.ts'
import type { AnyNode, IrFunctionEffect, IrThrowValueType, IrTopLevelItem } from '../types.ts'

type IrLocalThrowValueTypeOptions = {
  errorObjectNames?: any
  functionThrowValueTypes?: any
}

type NodeList = AnyNode[]
type MaybeNode = AnyNode | null | undefined
type ThrowValueTypeMap = Map<string, IrThrowValueType[]>
type ThrowValueTypeSet = Set<IrThrowValueType>
type StringSet = Set<string>
type FunctionEffectProgram = {
  body: NodeList
  topLevelItems: IrTopLevelItem[]
}
type StoredFunctionEffectProgram = {
  functionEffects: IrFunctionEffect[]
}

export function collectIrFunctionEffects(programs: FunctionEffectProgram[]): IrFunctionEffect[] {
  const functions: NodeList = []

  for (const program of programs) {
    pushNodes(functions, collectIrTopLevelNodes(program, 'function'))
  }

  return collectFunctionEffects(functions)
}

export function collectIrStoredFunctionEffects(programs: StoredFunctionEffectProgram[]): IrFunctionEffect[] {
  const effects: IrFunctionEffect[] = []

  for (const program of programs) {
    for (const effect of program.functionEffects) {
      effects.push(effect)
    }
  }

  return effects
}

export function collectIrLocalThrowValueTypes(
  statement: MaybeNode,
  options: IrLocalThrowValueTypeOptions = {}
): IrThrowValueType[] {
  const functionThrowValueTypes = cloneFunctionThrowValueTypeMap(options.functionThrowValueTypes)
  const functionNames = functionNameSetFromMap(functionThrowValueTypes)
  const errorObjectNames = stringSetFromIterable(options.errorObjectNames)

  return uniqueThrowValueTypes(
    collectEscapingThrowValueTypesFromStatement(
      statement,
      functionThrowValueTypes,
      functionNames,
      errorObjectNames,
      false
    )
  )
}

function collectFunctionEffects(functions: NodeList): IrFunctionEffect[] {
  const functionNames = createStringSet()
  const functionThrowValueTypes = createFunctionThrowValueTypeMap()
  let changed = true

  for (const item of functions) {
    functionNames.add(item.name)
    functionThrowValueTypes.set(item.name, [])
  }

  while (changed) {
    changed = false

    for (const item of functions) {
      const types = uniqueThrowValueTypes(
        collectEscapingThrowValueTypesFromStatements(
          item.body,
          functionThrowValueTypes,
          functionNames,
          createStringSet(),
          false
        )
      )
      const previous = functionThrowValueTypes.get(item.name) ?? []

      if (!sameThrowValueTypes(previous, types)) {
        functionThrowValueTypes.set(item.name, types)
        changed = true
      }
    }
  }

  const effects: IrFunctionEffect[] = []

  for (const item of functions) {
    const throwValueTypes = functionThrowValueTypes.get(item.name) ?? []

    effects.push({
      name: item.name,
      throws: throwValueTypes.length > 0,
      throwValueTypes
    })
  }

  return effects
}

function collectEscapingThrowValueTypesFromStatements(
  statements: NodeList,
  functionThrowValueTypes: ThrowValueTypeMap,
  functionNames: StringSet,
  errorObjectNames: StringSet,
  hasErrorTarget: boolean
): IrThrowValueType[] {
  const types: IrThrowValueType[] = []

  for (const statement of statements) {
    pushThrowValueTypes(
      types,
      collectEscapingThrowValueTypesFromStatement(
        statement,
        functionThrowValueTypes,
        functionNames,
        errorObjectNames,
        hasErrorTarget
      )
    )
  }

  return types
}

function collectEscapingThrowValueTypesFromStatement(
  statement: MaybeNode,
  functionThrowValueTypes: ThrowValueTypeMap,
  functionNames: StringSet,
  errorObjectNames: StringSet,
  hasErrorTarget: boolean
): IrThrowValueType[] {
  const types: IrThrowValueType[] = []

  if (statement == null) {
    return types
  }

  if (statement.type === 'ThrowStatement') {
    if (!hasErrorTarget) {
      types.push(inferThrowValueTypeForAnalysis(statement.argument, errorObjectNames))
    }

    return types
  }

  if (statement.type === 'VariableDeclaration') {
    pushThrowValueTypes(
      types,
      collectEscapingThrowValueTypesFromExpression(
        statement.init,
        functionThrowValueTypes,
        functionNames,
        errorObjectNames,
        hasErrorTarget
      )
    )

    if (isErrorValueExpressionForAnalysis(statement.init, errorObjectNames)) {
      errorObjectNames.add(statement.name)
    }

    return types
  }

  if (statement.type === 'ExpressionStatement') {
    return collectEscapingThrowValueTypesFromExpression(
      statement.expression,
      functionThrowValueTypes,
      functionNames,
      errorObjectNames,
      hasErrorTarget
    )
  }

  if (statement.type === 'ReturnStatement') {
    return collectEscapingThrowValueTypesFromExpression(
      statement.argument,
      functionThrowValueTypes,
      functionNames,
      errorObjectNames,
      hasErrorTarget
    )
  }

  if (statement.type === 'BlockStatement') {
    return collectEscapingThrowValueTypesFromStatements(
      statement.body,
      functionThrowValueTypes,
      functionNames,
      cloneStringSet(errorObjectNames),
      hasErrorTarget
    )
  }

  if (statement.type === 'IfStatement') {
    pushThrowValueTypes(
      types,
      collectEscapingThrowValueTypesFromExpression(
        statement.condition,
        functionThrowValueTypes,
        functionNames,
        errorObjectNames,
        hasErrorTarget
      )
    )
    pushThrowValueTypes(
      types,
      collectEscapingThrowValueTypesFromStatement(
        statement.consequent,
        functionThrowValueTypes,
        functionNames,
        cloneStringSet(errorObjectNames),
        hasErrorTarget
      )
    )
    pushThrowValueTypes(
      types,
      collectEscapingThrowValueTypesFromStatement(
        statement.alternate,
        functionThrowValueTypes,
        functionNames,
        cloneStringSet(errorObjectNames),
        hasErrorTarget
      )
    )

    return types
  }

  if (statement.type === 'WhileStatement') {
    pushThrowValueTypes(
      types,
      collectEscapingThrowValueTypesFromExpression(
        statement.condition,
        functionThrowValueTypes,
        functionNames,
        errorObjectNames,
        hasErrorTarget
      )
    )
    pushThrowValueTypes(
      types,
      collectEscapingThrowValueTypesFromStatement(
        statement.body,
        functionThrowValueTypes,
        functionNames,
        cloneStringSet(errorObjectNames),
        hasErrorTarget
      )
    )

    return types
  }

  if (statement.type === 'ForStatement') {
    if (statement.init != null && statement.init.type === 'VariableDeclaration') {
      pushThrowValueTypes(
        types,
        collectEscapingThrowValueTypesFromStatement(
          statement.init,
          functionThrowValueTypes,
          functionNames,
          cloneStringSet(errorObjectNames),
          hasErrorTarget
        )
      )
    } else {
      pushThrowValueTypes(
        types,
        collectEscapingThrowValueTypesFromExpression(
          statement.init,
          functionThrowValueTypes,
          functionNames,
          errorObjectNames,
          hasErrorTarget
        )
      )
    }

    pushThrowValueTypes(
      types,
      collectEscapingThrowValueTypesFromExpression(
        statement.test,
        functionThrowValueTypes,
        functionNames,
        errorObjectNames,
        hasErrorTarget
      )
    )
    pushThrowValueTypes(
      types,
      collectEscapingThrowValueTypesFromExpression(
        statement.update,
        functionThrowValueTypes,
        functionNames,
        errorObjectNames,
        hasErrorTarget
      )
    )
    pushThrowValueTypes(
      types,
      collectEscapingThrowValueTypesFromStatement(
        statement.body,
        functionThrowValueTypes,
        functionNames,
        cloneStringSet(errorObjectNames),
        hasErrorTarget
      )
    )

    return types
  }

  if (statement.type === 'ForOfStatement') {
    pushThrowValueTypes(
      types,
      collectEscapingThrowValueTypesFromExpression(
        statement.iterable,
        functionThrowValueTypes,
        functionNames,
        errorObjectNames,
        hasErrorTarget
      )
    )
    pushThrowValueTypes(
      types,
      collectEscapingThrowValueTypesFromStatement(
        statement.body,
        functionThrowValueTypes,
        functionNames,
        cloneStringSet(errorObjectNames),
        hasErrorTarget
      )
    )

    return types
  }

  if (statement.type === 'SwitchStatement') {
    pushThrowValueTypes(
      types,
      collectEscapingThrowValueTypesFromExpression(
        statement.discriminant,
        functionThrowValueTypes,
        functionNames,
        errorObjectNames,
        hasErrorTarget
      )
    )

    for (const item of statement.cases) {
      pushThrowValueTypes(
        types,
        collectEscapingThrowValueTypesFromExpression(
          item.test,
          functionThrowValueTypes,
          functionNames,
          errorObjectNames,
          hasErrorTarget
        )
      )
      pushThrowValueTypes(
        types,
        collectEscapingThrowValueTypesFromStatements(
          item.consequent,
          functionThrowValueTypes,
          functionNames,
          cloneStringSet(errorObjectNames),
          hasErrorTarget
        )
      )
    }

    return types
  }

  if (statement.type === 'TryStatement') {
    let blockHasTarget = hasErrorTarget

    if (statement.handler != null) {
      blockHasTarget = true
    }

    pushThrowValueTypes(
      types,
      collectEscapingThrowValueTypesFromStatement(
        statement.block,
        functionThrowValueTypes,
        functionNames,
        cloneStringSet(errorObjectNames),
        blockHasTarget
      )
    )

    if (statement.handler != null) {
      pushThrowValueTypes(
        types,
        collectEscapingThrowValueTypesFromStatement(
          statement.handler.body,
          functionThrowValueTypes,
          functionNames,
          cloneStringSet(errorObjectNames),
          hasErrorTarget
        )
      )
    }

    pushThrowValueTypes(
      types,
      collectEscapingThrowValueTypesFromStatement(
        statement.finalizer,
        functionThrowValueTypes,
        functionNames,
        cloneStringSet(errorObjectNames),
        hasErrorTarget
      )
    )

    return types
  }

  return types
}

function collectEscapingThrowValueTypesFromExpression(
  expression: MaybeNode,
  functionThrowValueTypes: ThrowValueTypeMap,
  functionNames: StringSet,
  errorObjectNames: StringSet,
  hasErrorTarget: boolean
): IrThrowValueType[] {
  const types: IrThrowValueType[] = []

  if (expression == null) {
    return types
  }

  if (expression.type === 'CallExpression') {
    if (
      !hasErrorTarget &&
      expression.callee.type === 'Reference' &&
      expression.callee.path.length === 1 &&
      functionNames.has(expression.callee.path[0])
    ) {
      pushThrowValueTypes(types, functionThrowValueTypes.get(expression.callee.path[0]) ?? [])
    }

    pushThrowValueTypes(
      types,
      collectEscapingThrowValueTypesFromExpression(
        expression.callee,
        functionThrowValueTypes,
        functionNames,
        errorObjectNames,
        hasErrorTarget
      )
    )
    pushExpressionListThrowValueTypes(
      types,
      expression.args,
      functionThrowValueTypes,
      functionNames,
      errorObjectNames,
      hasErrorTarget
    )

    return types
  }

  if (expression.type === 'NewExpression' || expression.type === 'OptionalCallExpression') {
    pushThrowValueTypes(
      types,
      collectEscapingThrowValueTypesFromExpression(
        expression.callee,
        functionThrowValueTypes,
        functionNames,
        errorObjectNames,
        hasErrorTarget
      )
    )
    pushExpressionListThrowValueTypes(
      types,
      expression.args,
      functionThrowValueTypes,
      functionNames,
      errorObjectNames,
      hasErrorTarget
    )

    return types
  }

  if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
    return collectEscapingThrowValueTypesFromExpression(
      expression.object,
      functionThrowValueTypes,
      functionNames,
      errorObjectNames,
      hasErrorTarget
    )
  }

  if (expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression') {
    pushThrowValueTypes(
      types,
      collectEscapingThrowValueTypesFromExpression(
        expression.object,
        functionThrowValueTypes,
        functionNames,
        errorObjectNames,
        hasErrorTarget
      )
    )
    pushThrowValueTypes(
      types,
      collectEscapingThrowValueTypesFromExpression(
        expression.index,
        functionThrowValueTypes,
        functionNames,
        errorObjectNames,
        hasErrorTarget
      )
    )

    return types
  }

  if (expression.type === 'AssignmentExpression') {
    pushThrowValueTypes(
      types,
      collectEscapingThrowValueTypesFromExpression(
        expression.target,
        functionThrowValueTypes,
        functionNames,
        errorObjectNames,
        hasErrorTarget
      )
    )
    pushThrowValueTypes(
      types,
      collectEscapingThrowValueTypesFromExpression(
        expression.value,
        functionThrowValueTypes,
        functionNames,
        errorObjectNames,
        hasErrorTarget
      )
    )

    return types
  }

  if (expression.type === 'BinaryExpression') {
    pushThrowValueTypes(
      types,
      collectEscapingThrowValueTypesFromExpression(
        expression.left,
        functionThrowValueTypes,
        functionNames,
        errorObjectNames,
        hasErrorTarget
      )
    )
    pushThrowValueTypes(
      types,
      collectEscapingThrowValueTypesFromExpression(
        expression.right,
        functionThrowValueTypes,
        functionNames,
        errorObjectNames,
        hasErrorTarget
      )
    )

    return types
  }

  if (
    expression.type === 'UnaryExpression' ||
    expression.type === 'UpdateExpression' ||
    expression.type === 'AwaitExpression'
  ) {
    return collectEscapingThrowValueTypesFromExpression(
      expression.argument,
      functionThrowValueTypes,
      functionNames,
      errorObjectNames,
      hasErrorTarget
    )
  }

  if (expression.type === 'ArrayLiteral') {
    pushExpressionListThrowValueTypes(
      types,
      expression.elements,
      functionThrowValueTypes,
      functionNames,
      errorObjectNames,
      hasErrorTarget
    )

    return types
  }

  if (expression.type === 'ObjectLiteral') {
    for (const property of expression.properties) {
      pushThrowValueTypes(
        types,
        collectEscapingThrowValueTypesFromExpression(
          property.value,
          functionThrowValueTypes,
          functionNames,
          errorObjectNames,
          hasErrorTarget
        )
      )
    }
  }

  return types
}

function inferThrowValueTypeForAnalysis(
  expression: MaybeNode,
  errorObjectNames: StringSet
): IrThrowValueType {
  if (isErrorValueExpressionForAnalysis(expression, errorObjectNames)) {
    return 'error'
  }

  if (expression != null) {
    if (expression.type === 'StringLiteral' || expression.type === 'TemplateLiteral' || expression.valueType === 'string') {
      return 'string'
    }
  }

  return 'other'
}

function isErrorValueExpressionForAnalysis(
  expression: MaybeNode,
  errorObjectNames: StringSet
): boolean {
  if (isErrorConstructorExpression(expression)) {
    return true
  }

  if (expression != null) {
    return expression.type === 'Reference' && expression.path.length === 1 && errorObjectNames.has(expression.path[0])
  }

  return false
}

function isErrorConstructorExpression(expression: MaybeNode): boolean {
  if (expression == null) {
    return false
  }

  if (expression.type !== 'NewExpression') {
    return false
  }

  if (expression.callee == null) {
    return false
  }

  return (
    expression.callee.type === 'Reference' &&
    expression.callee.path.length === 1 &&
    expression.callee.path[0] === 'Error'
  )
}

function createFunctionThrowValueTypeMap(): ThrowValueTypeMap {
  const result: ThrowValueTypeMap = new Map()
  return result
}

function createStringSet(): StringSet {
  const result: StringSet = new Set()
  return result
}

function createThrowValueTypeSet(): ThrowValueTypeSet {
  const result: ThrowValueTypeSet = new Set()
  return result
}

function cloneFunctionThrowValueTypeMap(input: any): ThrowValueTypeMap {
  const result = createFunctionThrowValueTypeMap()

  if (input == null) {
    return result
  }

  for (const entry of input) {
    const values: IrThrowValueType[] = []

    for (const value of entry[1]) {
      values.push(value)
    }

    result.set(entry[0], values)
  }

  return result
}

function functionNameSetFromMap(map: ThrowValueTypeMap): StringSet {
  const names = createStringSet()

  for (const name of map.keys()) {
    names.add(name)
  }

  return names
}

function stringSetFromIterable(input: any): StringSet {
  const result = createStringSet()

  if (input == null) {
    return result
  }

  for (const value of input) {
    result.add(value)
  }

  return result
}

function cloneStringSet(source: StringSet): StringSet {
  const result = createStringSet()

  for (const value of source) {
    result.add(value)
  }

  return result
}

function pushNodes(target: NodeList, values: NodeList): void {
  for (const value of values) {
    target.push(value)
  }
}

function pushExpressionListThrowValueTypes(
  target: IrThrowValueType[],
  expressions: NodeList,
  functionThrowValueTypes: ThrowValueTypeMap,
  functionNames: StringSet,
  errorObjectNames: StringSet,
  hasErrorTarget: boolean
): void {
  for (const expression of expressions) {
    pushThrowValueTypes(
      target,
      collectEscapingThrowValueTypesFromExpression(
        expression,
        functionThrowValueTypes,
        functionNames,
        errorObjectNames,
        hasErrorTarget
      )
    )
  }
}

function pushThrowValueTypes(target: IrThrowValueType[], values: IrThrowValueType[]): void {
  for (const value of values) {
    target.push(value)
  }
}

function uniqueThrowValueTypes(types: IrThrowValueType[]): IrThrowValueType[] {
  const seen = createThrowValueTypeSet()
  const result: IrThrowValueType[] = []

  for (const throwType of types) {
    if (!seen.has(throwType)) {
      seen.add(throwType)
      result.push(throwType)
    }
  }

  return result
}

function sameThrowValueTypes(left: IrThrowValueType[], right: IrThrowValueType[]): boolean {
  if (left.length !== right.length) {
    return false
  }

  for (const item of left) {
    if (!right.includes(item)) {
      return false
    }
  }

  return true
}
