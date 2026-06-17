import { collectIrTopLevelNodes } from './top-level.ts'
import type { AnyNode, IrFunctionEffect, IrThrowValueType, IrTopLevelItem } from '../types.ts'

type ThrowValueTypeMap = Map<string, IrThrowValueType[]>
type StringSet = Set<string>

type IrLocalThrowValueTypeOptions = {
  errorObjectNames?: StringSet | null
  functionThrowValueTypes?: ThrowValueTypeMap | null
}

type EffectChildNode = AnyNode
type EffectChildList = EffectChildNode[]

type EffectCaseNode = EffectChildNode & {
  consequent?: EffectChildList
  test?: EffectChildNode | null
}

type EffectPropertyNode = EffectChildNode & {
  value?: EffectChildNode | null
}

type EffectHandlerNode = EffectChildNode & {
  body?: EffectChildNode | null
}

type EffectNode = EffectChildNode & {
  alternate?: EffectChildNode | null
  argument?: EffectChildNode | null
  args?: EffectChildList
  block?: EffectChildNode | null
  body?: any
  callee?: EffectChildNode | null
  cases?: EffectCaseNode[]
  condition?: EffectChildNode | null
  consequent?: EffectChildNode | null
  discriminant?: EffectChildNode | null
  elements?: EffectChildList
  expression?: EffectChildNode | null
  finalizer?: EffectChildNode | null
  handler?: EffectHandlerNode | null
  index?: EffectChildNode | null
  init?: EffectChildNode | null
  iterable?: EffectChildNode | null
  left?: EffectChildNode | null
  name?: string | null
  object?: EffectChildNode | null
  path?: string[]
  properties?: EffectPropertyNode[]
  right?: EffectChildNode | null
  target?: EffectChildNode | null
  test?: EffectChildNode | null
  type?: string | null
  update?: EffectChildNode | null
  value?: EffectChildNode | null
  valueType?: string | null
}

type NodeList = EffectChildList
type MaybeNode = EffectNode | null | undefined
type ThrowValueTypeSet = Set<IrThrowValueType>
type FunctionEffectProgram = {
  body: NodeList
  topLevelItems: IrTopLevelItem[]
}
type StoredFunctionEffectProgram = {
  functionEffects: IrFunctionEffect[]
}

export function collectIrFunctionEffects(programs: FunctionEffectProgram[]): IrFunctionEffect[] {
  const functions: NodeList = []

  for (let index = 0; index < programs.length; index = index + 1) {
    const program = programs[index]
    pushNodes(functions, collectIrTopLevelNodes(program, 'function'))
  }

  return collectFunctionEffects(functions)
}

export function collectIrStoredFunctionEffects(programs: StoredFunctionEffectProgram[]): IrFunctionEffect[] {
  const effects: IrFunctionEffect[] = []

  for (let programIndex = 0; programIndex < programs.length; programIndex = programIndex + 1) {
    const program = programs[programIndex]
    const functionEffects = program.functionEffects

    for (let effectIndex = 0; effectIndex < functionEffects.length; effectIndex = effectIndex + 1) {
      const effect = functionEffects[effectIndex]
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
  const errorObjectNames = cloneOptionalStringSet(options.errorObjectNames)

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

  for (let index = 0; index < functions.length; index = index + 1) {
    const item: EffectNode = functions[index]
    const name = nodeName(item)
    functionNames.add(name)
    functionThrowValueTypes.set(name, [])
  }

  while (changed) {
    changed = false

    for (let index = 0; index < functions.length; index = index + 1) {
      const item: EffectNode = functions[index]
      const name = nodeName(item)
      const types = uniqueThrowValueTypes(
        collectEscapingThrowValueTypesFromStatements(
          nodeList(item.body),
          functionThrowValueTypes,
          functionNames,
          createStringSet(),
          false
        )
      )
      const previous = functionThrowValueTypes.get(name) ?? []

      if (!sameThrowValueTypes(previous, types)) {
        functionThrowValueTypes.set(name, types)
        changed = true
      }
    }
  }

  const effects: IrFunctionEffect[] = []

  for (let index = 0; index < functions.length; index = index + 1) {
    const item: EffectNode = functions[index]
    const name = nodeName(item)
    const throwValueTypes = functionThrowValueTypes.get(name) ?? []

    effects.push({
      name,
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

  for (let index = 0; index < statements.length; index = index + 1) {
    const statement = statements[index]
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
      const name = nodeName(statement)

      if (name !== '') {
        errorObjectNames.add(name)
      }
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
      nodeList(statement.body),
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
    const init = statement.init

    if (init != null && init.type === 'VariableDeclaration') {
      pushThrowValueTypes(
        types,
        collectEscapingThrowValueTypesFromStatement(
          init,
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
          init,
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

    const cases = caseList(statement.cases)

    for (let index = 0; index < cases.length; index = index + 1) {
      const item = cases[index]
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
          nodeList(item.consequent),
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

    const handler = statement.handler

    if (handler != null) {
      pushThrowValueTypes(
        types,
        collectEscapingThrowValueTypesFromStatement(
          handler.body,
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
    const callee = expression.callee
    const functionName = singleReferenceName(callee)

    if (!hasErrorTarget && functionName != null && functionNames.has(functionName)) {
      pushThrowValueTypes(types, functionThrowValueTypes.get(functionName) ?? [])
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
      nodeList(expression.args),
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
      nodeList(expression.args),
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
      nodeList(expression.elements),
      functionThrowValueTypes,
      functionNames,
      errorObjectNames,
      hasErrorTarget
    )

    return types
  }

  if (expression.type === 'ObjectLiteral') {
    const properties = propertyList(expression.properties)

    for (let index = 0; index < properties.length; index = index + 1) {
      const property = properties[index]
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
    const name = singleReferenceName(expression)

    if (name != null) {
      return errorObjectNames.has(name)
    }
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

  const name = singleReferenceName(expression.callee)
  return name === 'Error'
}

function nodeName(node: EffectNode): string {
  const name = node.name

  if (name == null) {
    return ''
  }

  return name
}

function nodeList(values: EffectChildList | null | undefined): NodeList {
  if (values == null) {
    return []
  }

  return values
}

function caseList(values: EffectCaseNode[] | null | undefined): EffectCaseNode[] {
  if (values == null) {
    return []
  }

  return values
}

function propertyList(values: EffectPropertyNode[] | null | undefined): EffectPropertyNode[] {
  if (values == null) {
    return []
  }

  return values
}

function singleReferenceName(expression: EffectChildNode | null | undefined): string | null {
  if (expression == null) {
    return null
  }

  const reference = expression as EffectNode

  if (reference.type !== 'Reference') {
    return null
  }

  return singleStringPathName(reference.path)
}

function singleStringPathName(path: string[] | null | undefined): string | null {
  if (path == null || path.length !== 1) {
    return null
  }

  return stringValueAt(path, 0)
}

function stringValueAt(values: string[], index: number): string {
  return values[index]
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

function cloneFunctionThrowValueTypeMap(input: ThrowValueTypeMap | null | undefined): ThrowValueTypeMap {
  if (input == null) {
    return createFunctionThrowValueTypeMap()
  }

  return new Map(input)
}

function functionNameSetFromMap(map: ThrowValueTypeMap): StringSet {
  const names = createStringSet()

  for (const name of map.keys()) {
    names.add(name)
  }

  return names
}

function cloneOptionalStringSet(input: StringSet | null | undefined): StringSet {
  if (input == null) {
    return createStringSet()
  }

  return new Set(input)
}

function cloneStringSet(source: StringSet): StringSet {
  return new Set(source)
}

function pushNodes(target: NodeList, values: NodeList): void {
  for (let index = 0; index < values.length; index = index + 1) {
    const value = values[index]
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
  for (let index = 0; index < expressions.length; index = index + 1) {
    const expression = expressions[index]
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
  for (let index = 0; index < values.length; index = index + 1) {
    const value = values[index]
    target.push(value)
  }
}

function uniqueThrowValueTypes(types: IrThrowValueType[]): IrThrowValueType[] {
  const seen = createThrowValueTypeSet()
  const result: IrThrowValueType[] = []

  for (let index = 0; index < types.length; index = index + 1) {
    const throwType = types[index]
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

  for (let index = 0; index < left.length; index = index + 1) {
    const item = left[index]

    if (!throwValueTypesInclude(right, item)) {
      return false
    }
  }

  return true
}

function throwValueTypesInclude(values: IrThrowValueType[], item: IrThrowValueType): boolean {
  for (let index = 0; index < values.length; index = index + 1) {
    if (values[index] === item) {
      return true
    }
  }

  return false
}
