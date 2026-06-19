import { collectIrTopLevelNodes } from './top-level.ts'
import type { AnyNode, IrFunctionEffect, IrThrowValueType, IrTopLevelItem } from '../types.ts'

type ThrowValueTypeMap = Map<string, IrThrowValueType[]>
type StringMap = Map<string, string>
type StringSet = Set<string>

export type IrLocalThrowValueTypeOptions = {
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
  className?: string | null
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
  methods?: EffectChildList
  name?: string | null
  object?: EffectChildNode | null
  path?: string[]
  property?: string | null
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
  return collectFunctionEffects(collectFunctionEffectNodes(programs, false), [], false)
}

export function collectIrFunctionEffectsWithExternalEffects(
  programs: FunctionEffectProgram[],
  externalEffects: IrFunctionEffect[],
  includeClassMethods: boolean
): IrFunctionEffect[] {
  return collectFunctionEffects(collectFunctionEffectNodes(programs, includeClassMethods), externalEffects, includeClassMethods)
}

export function irClassMethodEffectName(className: string, methodName: string): string {
  return `${className}.${methodName}`
}

function collectFunctionEffectNodes(
  programs: FunctionEffectProgram[],
  includeClassMethods: boolean
): NodeList {
  const functions: NodeList = []

  for (let index = 0; index < programs.length; index = index + 1) {
    const program = programs[index]
    pushNodes(functions, collectIrTopLevelNodes(program, 'function'))

    if (includeClassMethods) {
      pushNodes(functions, collectClassMethodEffectNodes(program))
    }
  }

  return functions
}

function collectClassMethodEffectNodes(program: FunctionEffectProgram): NodeList {
  const functions: NodeList = []
  const classes = collectIrTopLevelNodes(program, 'class')

  for (let classIndex = 0; classIndex < classes.length; classIndex = classIndex + 1) {
    const classNode: EffectNode = classes[classIndex]
    const className = nodeName(classNode)
    const methods = nodeList(classNode.methods)

    for (let methodIndex = 0; methodIndex < methods.length; methodIndex = methodIndex + 1) {
      const method: EffectNode = methods[methodIndex]

      if (method.name === 'constructor') {
        continue
      }

      const functionNode: EffectNode = {
        type: method.type,
        body: method.body,
        className,
        name: irClassMethodEffectName(className, nodeName(method))
      }
      functions.push(functionNode)
    }
  }

  return functions
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

export function mergeIrFunctionEffects(left: IrFunctionEffect[], right: IrFunctionEffect[]): IrFunctionEffect[] {
  const effects: IrFunctionEffect[] = []

  for (let index = 0; index < left.length; index = index + 1) {
    pushMergedIrFunctionEffect(effects, left[index])
  }

  for (let index = 0; index < right.length; index = index + 1) {
    pushMergedIrFunctionEffect(effects, right[index])
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
      createStringMap(),
      false,
      false
    )
  )
}

function collectFunctionEffects(
  functions: NodeList,
  externalEffects: IrFunctionEffect[],
  includeClassMethods: boolean
): IrFunctionEffect[] {
  const functionNames = createStringSet()
  const externalFunctionNames = createStringSet()
  const functionThrowValueTypes = createFunctionThrowValueTypeMap()
  let changed = true

  for (let index = 0; index < externalEffects.length; index = index + 1) {
    const effect = externalEffects[index]
    externalFunctionNames.add(effect.name)
    functionNames.add(effect.name)
    functionThrowValueTypes.set(effect.name, normalizedEffectThrowValueTypes(effect))
  }

  for (let index = 0; index < functions.length; index = index + 1) {
    const item: EffectNode = functions[index]
    const name = nodeName(item)
    functionNames.add(name)
    if (!functionThrowValueTypes.has(name)) {
      functionThrowValueTypes.set(name, [])
    }
  }

  while (changed) {
    changed = false

    for (let index = 0; index < functions.length; index = index + 1) {
      const item: EffectNode = functions[index]
      const name = nodeName(item)

      if (externalFunctionNames.has(name)) {
        continue
      }

      const classInstanceTypes = createStringMap()

      if (item.className != null) {
        classInstanceTypes.set('this', item.className)
      }

      const types = uniqueThrowValueTypes(
        collectEscapingThrowValueTypesFromStatements(
          nodeList(item.body),
          functionThrowValueTypes,
          functionNames,
          createStringSet(),
          classInstanceTypes,
          includeClassMethods,
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
  classInstanceTypes: StringMap,
  includeClassMethods: boolean,
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
        classInstanceTypes,
        includeClassMethods,
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
  classInstanceTypes: StringMap,
  includeClassMethods: boolean,
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
        classInstanceTypes,
        includeClassMethods,
        hasErrorTarget
      )
    )

    if (isErrorValueExpressionForAnalysis(statement.init, errorObjectNames)) {
      const name = nodeName(statement)

      if (name !== '') {
        errorObjectNames.add(name)
      }
    }

    if (statement.init != null && statement.init.className != null) {
      const name = nodeName(statement)

      if (name !== '') {
        classInstanceTypes.set(name, statement.init.className)
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
      classInstanceTypes,
      includeClassMethods,
      hasErrorTarget
    )
  }

  if (statement.type === 'ReturnStatement') {
    return collectEscapingThrowValueTypesFromExpression(
      statement.argument,
      functionThrowValueTypes,
      functionNames,
      errorObjectNames,
      classInstanceTypes,
      includeClassMethods,
      hasErrorTarget
    )
  }

  if (statement.type === 'BlockStatement') {
    return collectEscapingThrowValueTypesFromStatements(
      nodeList(statement.body),
      functionThrowValueTypes,
      functionNames,
      cloneStringSet(errorObjectNames),
      cloneStringMap(classInstanceTypes),
      includeClassMethods,
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
        classInstanceTypes,
        includeClassMethods,
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
        cloneStringMap(classInstanceTypes),
        includeClassMethods,
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
        cloneStringMap(classInstanceTypes),
        includeClassMethods,
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
        classInstanceTypes,
        includeClassMethods,
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
        cloneStringMap(classInstanceTypes),
        includeClassMethods,
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
          cloneStringMap(classInstanceTypes),
          includeClassMethods,
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
          classInstanceTypes,
          includeClassMethods,
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
        classInstanceTypes,
        includeClassMethods,
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
        classInstanceTypes,
        includeClassMethods,
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
        cloneStringMap(classInstanceTypes),
        includeClassMethods,
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
        classInstanceTypes,
        includeClassMethods,
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
        cloneStringMap(classInstanceTypes),
        includeClassMethods,
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
        classInstanceTypes,
        includeClassMethods,
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
          classInstanceTypes,
          includeClassMethods,
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
          cloneStringMap(classInstanceTypes),
          includeClassMethods,
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
        cloneStringMap(classInstanceTypes),
        includeClassMethods,
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
          cloneStringMap(classInstanceTypes),
          includeClassMethods,
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
        cloneStringMap(classInstanceTypes),
        includeClassMethods,
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
  classInstanceTypes: StringMap,
  includeClassMethods: boolean,
  hasErrorTarget: boolean
): IrThrowValueType[] {
  const types: IrThrowValueType[] = []

  if (expression == null) {
    return types
  }

  if (expression.type === 'CallExpression') {
    const callee = expression.callee
    const functionName = callEffectName(callee, classInstanceTypes, includeClassMethods)

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
        classInstanceTypes,
        includeClassMethods,
        hasErrorTarget
      )
    )
    pushExpressionListThrowValueTypes(
      types,
      nodeList(expression.args),
      functionThrowValueTypes,
      functionNames,
      errorObjectNames,
      classInstanceTypes,
      includeClassMethods,
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
        classInstanceTypes,
        includeClassMethods,
        hasErrorTarget
      )
    )
    pushExpressionListThrowValueTypes(
      types,
      nodeList(expression.args),
      functionThrowValueTypes,
      functionNames,
      errorObjectNames,
      classInstanceTypes,
      includeClassMethods,
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
      classInstanceTypes,
      includeClassMethods,
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
        classInstanceTypes,
        includeClassMethods,
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
        classInstanceTypes,
        includeClassMethods,
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
        classInstanceTypes,
        includeClassMethods,
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
        classInstanceTypes,
        includeClassMethods,
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
        classInstanceTypes,
        includeClassMethods,
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
        classInstanceTypes,
        includeClassMethods,
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
      classInstanceTypes,
      includeClassMethods,
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
      classInstanceTypes,
      includeClassMethods,
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
          classInstanceTypes,
          includeClassMethods,
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

  if (expression.className != null) {
    return true
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

function callEffectName(
  callee: EffectChildNode | null | undefined,
  classInstanceTypes: StringMap,
  includeClassMethods: boolean
): string | null {
  const directName = singleReferenceName(callee)

  if (directName != null) {
    return directName
  }

  if (!includeClassMethods || callee == null) {
    return null
  }

  const member = callee as EffectNode

  if (member.type !== 'MemberExpression' || member.property == null) {
    return null
  }

  const className = classNameForEffectReceiver(member.object, classInstanceTypes)

  if (className == null) {
    return null
  }

  return irClassMethodEffectName(className, member.property)
}

function classNameForEffectReceiver(
  expression: EffectChildNode | null | undefined,
  classInstanceTypes: StringMap
): string | null {
  if (expression == null) {
    return null
  }

  const node = expression as EffectNode

  if (node.className != null) {
    return node.className
  }

  const name = singleReferenceName(expression)

  if (name != null) {
    return classInstanceTypes.get(name) ?? null
  }

  return null
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

function createStringMap(): StringMap {
  const result: StringMap = new Map()
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

function cloneStringMap(source: StringMap): StringMap {
  return new Map(source)
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
  classInstanceTypes: StringMap,
  includeClassMethods: boolean,
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
        classInstanceTypes,
        includeClassMethods,
        hasErrorTarget
      )
    )
  }
}

function pushThrowValueTypes(target: IrThrowValueType[], values: IrThrowValueType[]): void {
  for (let index = 0; index < values.length; index = index + 1) {
    const value = values[index]

    if (!throwValueTypesInclude(target, value)) {
      target.push(value)
    }
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

function pushMergedIrFunctionEffect(target: IrFunctionEffect[], effect: IrFunctionEffect): void {
  const effectThrowValueTypes = normalizedEffectThrowValueTypes(effect)

  for (let index = 0; index < target.length; index = index + 1) {
    const existing = target[index]

    if (existing.name === effect.name) {
      const throwValueTypes = uniqueThrowValueTypes(existing.throwValueTypes)
      pushThrowValueTypes(throwValueTypes, effectThrowValueTypes)
      target[index] = {
        name: existing.name,
        throws: existing.throws || effect.throws || throwValueTypes.length > 0,
        throwValueTypes
      }
      return
    }
  }

  target.push({
    name: effect.name,
    throws: effect.throws,
    throwValueTypes: effectThrowValueTypes
  })
}

function normalizedEffectThrowValueTypes(effect: IrFunctionEffect): IrThrowValueType[] {
  if (effect.throws && effect.throwValueTypes.length === 0) {
    const throwValueTypes: IrThrowValueType[] = ['other']
    return throwValueTypes
  }

  return uniqueThrowValueTypes(effect.throwValueTypes)
}
