import type { AnyNode, IrFeature, IrFunctionDeclaration, IrFunctionEffect, IrGlobalUsage, IrProgram, IrRuntimeRequirement, IrSyntaxFeatureUsage, IrThrowValueType, IrTopLevelItem, IrTopLevelItemKind, ModuleGraph, ProgramNode } from './types.ts'

const jsStdGlobalRoots = new Set([
  'Array',
  'Buffer',
  'Date',
  'Error',
  'Int8Array',
  'Int16Array',
  'Int32Array',
  'JSON',
  'Map',
  'Math',
  'Promise',
  'Set',
  'Uint8Array',
  'Uint16Array',
  'Uint32Array',
  'fetch',
  'fs',
  'http',
  'performance',
  'clearTimeout',
  'clearInterval',
  'clearImmediate',
  'setTimeout',
  'setInterval',
  'setImmediate'
])

export type IrModuleRecord = {
  path: string
  ir: IrProgram
}

type IrLocalThrowValueTypeOptions = {
  errorObjectNames?: Iterable<string>
  functionThrowValueTypes?: ReadonlyMap<string, readonly IrThrowValueType[]>
}

type IrTopLevelNodeEntry = {
  kind: IrTopLevelItemKind
  node: AnyNode
}

export function lowerHirToIr(program: ProgramNode): IrProgram {
  const features = collectIrFeatures(program)
  const topLevelItems = collectTopLevelItems(program)

  return {
    type: 'IrProgram',
    version: 1,
    features,
    runtimeRequirements: collectRuntimeRequirements(features),
    topLevelItems,
    functionDeclarations: collectFunctionDeclarations(program, topLevelItems),
    functionEffects: collectIrFunctionEffects([{ body: program.body, topLevelItems }]),
    syntaxFeatures: collectSyntaxFeatureUsages(program),
    globalUsages: collectGlobalUsages(program),
    body: program.body
  }
}

export function collectIrModuleRecords(graph: ModuleGraph): IrModuleRecord[] {
  return graph.modules.flatMap(module => module.ir == null
    ? []
    : [{
        path: module.path,
        ir: module.ir
      }])
}

export function collectIrPrograms(records: IrModuleRecord[]): IrProgram[] {
  return records.map(record => record.ir)
}

export function findIrEntryProgram(records: IrModuleRecord[], entry: string): IrProgram | null {
  return records.find(record => record.path === entry)?.ir ?? null
}

export function collectIrFeatureRequirements(programs: Array<{ features: IrFeature[] }>): IrFeature[] {
  return [...new Set(programs.flatMap(program => program.features))].sort()
}

export function collectIrFunctionEffects(programs: Array<{ body: AnyNode[], topLevelItems: IrTopLevelItem[] }>): IrFunctionEffect[] {
  return collectFunctionEffects(programs.flatMap(program => collectIrTopLevelNodes(program, 'function')))
}

export function collectIrStoredFunctionEffects(programs: Array<{ functionEffects: IrFunctionEffect[] }>): IrFunctionEffect[] {
  return programs.flatMap(program => program.functionEffects)
}

export function collectIrRuntimeRequirements(programs: Array<{ runtimeRequirements: IrRuntimeRequirement[] }>): IrRuntimeRequirement[] {
  return [...new Set(programs.flatMap(program => program.runtimeRequirements))].sort()
}

export function collectIrSyntaxFeatureUsages(programs: Array<{ syntaxFeatures: IrSyntaxFeatureUsage[] }>): IrSyntaxFeatureUsage[] {
  return programs.flatMap(program => program.syntaxFeatures)
}

export function collectIrLocalThrowValueTypes(statement: AnyNode | null | undefined, options: IrLocalThrowValueTypeOptions = {}): IrThrowValueType[] {
  const functionThrowValueTypes = new Map<string, IrThrowValueType[]>(
    [...(options.functionThrowValueTypes ?? new Map<string, IrThrowValueType[]>())]
      .map(([name, types]) => [name, [...types]])
  )
  const functionNames = new Set(functionThrowValueTypes.keys())
  const errorObjectNames = new Set(options.errorObjectNames ?? [])

  return uniqueThrowValueTypes(collectEscapingThrowValueTypesFromStatement(statement, functionThrowValueTypes, functionNames, errorObjectNames, false))
}

export function collectIrGlobalUsages(programs: Array<{ globalUsages: IrGlobalUsage[] }>): IrGlobalUsage[] {
  return programs.flatMap(program => program.globalUsages)
}

export function collectIrGlobalRoots(programs: Array<{ globalUsages: IrGlobalUsage[] }>): string[] {
  return [...new Set(collectIrGlobalUsages(programs).map(usage => usage.root))].sort()
}

export function collectIrFunctionDeclarations(programs: Array<{ functionDeclarations: IrFunctionDeclaration[] }>): IrFunctionDeclaration[] {
  return programs.flatMap(program => program.functionDeclarations)
}

export function hasIrFunctionDeclaration(program: IrProgram | null | undefined, name: string): boolean {
  return program?.functionDeclarations.some(item => item.name === name) === true
}

export function collectIrTopLevelNodeEntries(program: { body: AnyNode[], topLevelItems: IrTopLevelItem[] }): IrTopLevelNodeEntry[] {
  return program.topLevelItems.flatMap(item => {
    const node = program.body[item.index]

    return node == null
      ? []
      : [{
          kind: item.kind,
          node
        }]
  })
}

export function collectIrTopLevelNodes(program: { body: AnyNode[], topLevelItems: IrTopLevelItem[] }, kind: IrTopLevelItemKind): AnyNode[] {
  return collectIrTopLevelNodeEntries(program)
    .filter(item => item.kind === kind)
    .map(item => item.node)
}

export function collectIrTopLevelNodesFromPrograms(programs: Array<{ body: AnyNode[], topLevelItems: IrTopLevelItem[] }>, kind: IrTopLevelItemKind): AnyNode[] {
  return programs.flatMap(program => collectIrTopLevelNodes(program, kind))
}

function collectIrFeatures(program: ProgramNode): IrFeature[] {
  const features = new Set<IrFeature>()

  visitNode(program, features)

  return [...features].sort()
}

function collectRuntimeRequirements(features: IrFeature[]): IrRuntimeRequirement[] {
  const requirements = new Set<IrRuntimeRequirement>()

  for (const feature of features) {
    if (feature === 'runtime-values') {
      requirements.add('managed-values')
    } else if (feature === 'collections') {
      requirements.add('collections')
      requirements.add('managed-values')
    } else if (feature === 'objects') {
      requirements.add('managed-values')
      requirements.add('objects')
    } else if (feature === 'array-pop-null' || feature === 'map-get-null' || feature === 'map-index-set') {
      continue
    } else {
      requirements.add(feature)
    }
  }

  return [...requirements].sort()
}

function collectTopLevelItems(program: ProgramNode): IrTopLevelItem[] {
  return program.body.map((item, index) => ({
    kind: topLevelItemKind(item),
    index,
    loc: item.loc
  }))
}

function topLevelItemKind(item: AnyNode): IrTopLevelItemKind {
  if (item.type === 'ImportDeclaration') {
    return 'import'
  }

  if (item.type === 'FunctionDeclaration') {
    return 'function'
  }

  if (item.type === 'ClassDeclaration') {
    return 'class'
  }

  if (item.type === 'TypeAliasDeclaration') {
    return 'type'
  }

  return 'statement'
}

function collectFunctionDeclarations(program: ProgramNode, topLevelItems: IrTopLevelItem[]): IrFunctionDeclaration[] {
  return collectIrTopLevelNodes({
    body: program.body,
    topLevelItems
  }, 'function')
    .filter((item): item is AnyNode & { name: string } => typeof item.name === 'string')
    .map(item => ({
      name: item.name,
      exported: item.exported === true,
      async: item.async === true,
      params: item.params,
      returnType: item.returnType,
      returnNullable: item.returnNullable === true,
      ...(item.returnArrayElementType == null ? {} : { returnArrayElementType: item.returnArrayElementType }),
      ...(item.returnArrayElementDeclaredType == null ? {} : { returnArrayElementDeclaredType: item.returnArrayElementDeclaredType }),
      ...(item.returnMapKeyType == null ? {} : { returnMapKeyType: item.returnMapKeyType }),
      ...(item.returnMapValueType == null ? {} : { returnMapValueType: item.returnMapValueType }),
      ...(item.returnPromiseValueType == null ? {} : { returnPromiseValueType: item.returnPromiseValueType }),
      ...(item.returnSetElementType == null ? {} : { returnSetElementType: item.returnSetElementType }),
      ...(item.returnShape == null ? {} : { returnShape: item.returnShape }),
      loc: item.loc
    }))
}

function collectSyntaxFeatureUsages(program: ProgramNode): IrSyntaxFeatureUsage[] {
  const usages: IrSyntaxFeatureUsage[] = []

  visitSyntaxFeatureUsage(program, usages)

  return usages
}

function collectGlobalUsages(program: ProgramNode): IrGlobalUsage[] {
  const usages: IrGlobalUsage[] = []

  visitGlobalUsage(program, usages)

  return usages
}

function visitGlobalUsage(node: unknown, usages: IrGlobalUsage[]): void {
  if (node == null) {
    return
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      visitGlobalUsage(item, usages)
    }
    return
  }

  if (typeof node !== 'object') {
    return
  }

  const item = node as AnyNode

  if (item.type === 'MemberExpression' || item.type === 'OptionalMemberExpression') {
    const path = globalUsagePath(item)

    if (path != null) {
      usages.push({
        root: path[0],
        path,
        loc: item.loc
      })
      return
    }
  }

  if (item.type === 'IndexExpression' || item.type === 'OptionalIndexExpression') {
    const path = globalUsagePath(item.object)

    if (path != null) {
      usages.push({
        root: path[0],
        path,
        loc: item.loc
      })
      visitGlobalUsage(item.index, usages)
      return
    }
  }

  if (item.type === 'Reference' && item.path.length > 0 && jsStdGlobalRoots.has(item.path[0])) {
    usages.push({
      root: item.path[0],
      path: item.path,
      loc: item.loc
    })
  }

  for (const [key, value] of Object.entries(item)) {
    if (key === 'loc' || key === 'shape') {
      continue
    }

    visitGlobalUsage(value, usages)
  }
}

function globalUsagePath(expression: AnyNode | null | undefined): string[] | null {
  if (expression?.type === 'Reference' && expression.path.length > 0 && jsStdGlobalRoots.has(expression.path[0])) {
    return expression.path
  }

  if (expression?.type === 'MemberExpression' || expression?.type === 'OptionalMemberExpression') {
    const objectPath = globalUsagePath(expression.object)

    return objectPath == null ? null : [...objectPath, expression.property]
  }

  return null
}

function visitSyntaxFeatureUsage(node: unknown, usages: IrSyntaxFeatureUsage[]): void {
  if (node == null) {
    return
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      visitSyntaxFeatureUsage(item, usages)
    }
    return
  }

  if (typeof node !== 'object') {
    return
  }

  const item = node as AnyNode

  if (item.type === 'ClassDeclaration') {
    usages.push({
      feature: 'class',
      loc: item.loc
    })
  } else if (item.type === 'FunctionDeclaration' && item.async === true) {
    usages.push({
      feature: 'async-function',
      loc: item.loc
    })
  }

  for (const [key, value] of Object.entries(item)) {
    if (key === 'loc' || key === 'shape') {
      continue
    }

    visitSyntaxFeatureUsage(value, usages)
  }
}

function collectFunctionEffects(functions: AnyNode[]): IrFunctionEffect[] {
  const functionNames = new Set(functions.map(item => item.name))
  const functionThrowValueTypes = new Map<string, IrThrowValueType[]>(functions.map(item => [item.name, []]))
  let changed = true

  while (changed) {
    changed = false

    for (const item of functions) {
      const types = uniqueThrowValueTypes(collectEscapingThrowValueTypesFromStatements(item.body, functionThrowValueTypes, functionNames, new Set(), false))
      const previous = functionThrowValueTypes.get(item.name) ?? []

      if (!sameThrowValueTypes(previous, types)) {
        functionThrowValueTypes.set(item.name, types)
        changed = true
      }
    }
  }

  return functions.map(item => {
    const throwValueTypes = functionThrowValueTypes.get(item.name) ?? []

    return {
      name: item.name,
      throws: throwValueTypes.length > 0,
      throwValueTypes
    }
  })
}

function collectEscapingThrowValueTypesFromStatements(
  statements: AnyNode[],
  functionThrowValueTypes: Map<string, IrThrowValueType[]>,
  functionNames: Set<string>,
  errorObjectNames: Set<string>,
  hasErrorTarget: boolean
): IrThrowValueType[] {
  return statements.flatMap(statement => collectEscapingThrowValueTypesFromStatement(statement, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget))
}

function collectEscapingThrowValueTypesFromStatement(
  statement: AnyNode | null | undefined,
  functionThrowValueTypes: Map<string, IrThrowValueType[]>,
  functionNames: Set<string>,
  errorObjectNames: Set<string>,
  hasErrorTarget: boolean
): IrThrowValueType[] {
  if (statement == null) {
    return []
  }

  if (statement.type === 'ThrowStatement') {
    return hasErrorTarget ? [] : [inferThrowValueTypeForAnalysis(statement.argument, errorObjectNames)]
  }

  if (statement.type === 'VariableDeclaration') {
    const types = collectEscapingThrowValueTypesFromExpression(statement.init, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget)

    if (isErrorValueExpressionForAnalysis(statement.init, errorObjectNames)) {
      errorObjectNames.add(statement.name)
    }

    return types
  }

  if (statement.type === 'ExpressionStatement') {
    return collectEscapingThrowValueTypesFromExpression(statement.expression, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget)
  }

  if (statement.type === 'ReturnStatement') {
    return collectEscapingThrowValueTypesFromExpression(statement.argument, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget)
  }

  if (statement.type === 'BlockStatement') {
    return collectEscapingThrowValueTypesFromStatements(statement.body, functionThrowValueTypes, functionNames, new Set(errorObjectNames), hasErrorTarget)
  }

  if (statement.type === 'IfStatement') {
    return [
      ...collectEscapingThrowValueTypesFromExpression(statement.condition, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget),
      ...collectEscapingThrowValueTypesFromStatement(statement.consequent, functionThrowValueTypes, functionNames, new Set(errorObjectNames), hasErrorTarget),
      ...collectEscapingThrowValueTypesFromStatement(statement.alternate, functionThrowValueTypes, functionNames, new Set(errorObjectNames), hasErrorTarget)
    ]
  }

  if (statement.type === 'WhileStatement') {
    return [
      ...collectEscapingThrowValueTypesFromExpression(statement.condition, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget),
      ...collectEscapingThrowValueTypesFromStatement(statement.body, functionThrowValueTypes, functionNames, new Set(errorObjectNames), hasErrorTarget)
    ]
  }

  if (statement.type === 'ForStatement') {
    return [
      ...(statement.init?.type === 'VariableDeclaration'
        ? collectEscapingThrowValueTypesFromStatement(statement.init, functionThrowValueTypes, functionNames, new Set(errorObjectNames), hasErrorTarget)
        : collectEscapingThrowValueTypesFromExpression(statement.init, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget)),
      ...collectEscapingThrowValueTypesFromExpression(statement.test, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget),
      ...collectEscapingThrowValueTypesFromExpression(statement.update, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget),
      ...collectEscapingThrowValueTypesFromStatement(statement.body, functionThrowValueTypes, functionNames, new Set(errorObjectNames), hasErrorTarget)
    ]
  }

  if (statement.type === 'ForOfStatement') {
    return [
      ...collectEscapingThrowValueTypesFromExpression(statement.iterable, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget),
      ...collectEscapingThrowValueTypesFromStatement(statement.body, functionThrowValueTypes, functionNames, new Set(errorObjectNames), hasErrorTarget)
    ]
  }

  if (statement.type === 'SwitchStatement') {
    return [
      ...collectEscapingThrowValueTypesFromExpression(statement.discriminant, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget),
      ...statement.cases.flatMap(item => [
        ...collectEscapingThrowValueTypesFromExpression(item.test, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget),
        ...collectEscapingThrowValueTypesFromStatements(item.consequent, functionThrowValueTypes, functionNames, new Set(errorObjectNames), hasErrorTarget)
      ])
    ]
  }

  if (statement.type === 'TryStatement') {
    const blockHasTarget = statement.handler != null ? true : hasErrorTarget

    return [
      ...collectEscapingThrowValueTypesFromStatement(statement.block, functionThrowValueTypes, functionNames, new Set(errorObjectNames), blockHasTarget),
      ...collectEscapingThrowValueTypesFromStatement(statement.handler?.body, functionThrowValueTypes, functionNames, new Set(errorObjectNames), hasErrorTarget),
      ...collectEscapingThrowValueTypesFromStatement(statement.finalizer, functionThrowValueTypes, functionNames, new Set(errorObjectNames), hasErrorTarget)
    ]
  }

  return []
}

function collectEscapingThrowValueTypesFromExpression(
  expression: AnyNode | null | undefined,
  functionThrowValueTypes: Map<string, IrThrowValueType[]>,
  functionNames: Set<string>,
  errorObjectNames: Set<string>,
  hasErrorTarget: boolean
): IrThrowValueType[] {
  if (expression == null) {
    return []
  }

  if (expression.type === 'CallExpression') {
    const callTypes = !hasErrorTarget && expression.callee.type === 'Reference' && expression.callee.path.length === 1 && functionNames.has(expression.callee.path[0])
      ? functionThrowValueTypes.get(expression.callee.path[0]) ?? []
      : []

    return [
      ...callTypes,
      ...collectEscapingThrowValueTypesFromExpression(expression.callee, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget),
      ...expression.args.flatMap(arg => collectEscapingThrowValueTypesFromExpression(arg, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget))
    ]
  }

  if (expression.type === 'NewExpression' || expression.type === 'OptionalCallExpression') {
    return [
      ...collectEscapingThrowValueTypesFromExpression(expression.callee, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget),
      ...expression.args.flatMap(arg => collectEscapingThrowValueTypesFromExpression(arg, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget))
    ]
  }

  if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
    return collectEscapingThrowValueTypesFromExpression(expression.object, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget)
  }

  if (expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression') {
    return [
      ...collectEscapingThrowValueTypesFromExpression(expression.object, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget),
      ...collectEscapingThrowValueTypesFromExpression(expression.index, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget)
    ]
  }

  if (expression.type === 'AssignmentExpression') {
    return [
      ...collectEscapingThrowValueTypesFromExpression(expression.target, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget),
      ...collectEscapingThrowValueTypesFromExpression(expression.value, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget)
    ]
  }

  if (expression.type === 'BinaryExpression') {
    return [
      ...collectEscapingThrowValueTypesFromExpression(expression.left, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget),
      ...collectEscapingThrowValueTypesFromExpression(expression.right, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget)
    ]
  }

  if (expression.type === 'UnaryExpression' || expression.type === 'AwaitExpression') {
    return collectEscapingThrowValueTypesFromExpression(expression.argument, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget)
  }

  if (expression.type === 'ArrayLiteral') {
    return expression.elements.flatMap(item => collectEscapingThrowValueTypesFromExpression(item, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget))
  }

  if (expression.type === 'ObjectLiteral') {
    return expression.properties.flatMap(property => collectEscapingThrowValueTypesFromExpression(property.value, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget))
  }

  return []
}

function inferThrowValueTypeForAnalysis(expression: AnyNode | null | undefined, errorObjectNames: Set<string>): IrThrowValueType {
  if (isErrorValueExpressionForAnalysis(expression, errorObjectNames)) {
    return 'error'
  }

  if (expression?.type === 'StringLiteral' || expression?.type === 'TemplateLiteral' || expression?.valueType === 'string') {
    return 'string'
  }

  return 'other'
}

function isErrorValueExpressionForAnalysis(expression: AnyNode | null | undefined, errorObjectNames: Set<string>): boolean {
  if (isErrorConstructorExpression(expression)) {
    return true
  }

  return expression?.type === 'Reference' && expression.path.length === 1 && errorObjectNames.has(expression.path[0])
}

function isErrorConstructorExpression(expression: AnyNode | null | undefined): boolean {
  return expression?.type === 'NewExpression'
    && expression.callee?.type === 'Reference'
    && expression.callee.path.length === 1
    && expression.callee.path[0] === 'Error'
}

function uniqueThrowValueTypes(types: IrThrowValueType[]): IrThrowValueType[] {
  return [...new Set(types)]
}

function sameThrowValueTypes(left: IrThrowValueType[], right: IrThrowValueType[]): boolean {
  return left.length === right.length && left.every(item => right.includes(item))
}

function visitNode(node: unknown, features: Set<IrFeature>): void {
  if (node == null) {
    return
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      visitNode(item, features)
    }
    return
  }

  if (typeof node !== 'object') {
    return
  }

  const item = node as AnyNode

  recordNodeFeatures(item, features)

  for (const [key, value] of Object.entries(item)) {
    if (key === 'loc' || key === 'shape') {
      continue
    }

    visitNode(value, features)
  }
}

function recordNodeFeatures(node: AnyNode, features: Set<IrFeature>): void {
  if (node.nullable === true) {
    features.add('runtime-values')
  }

  if (node.valueType === 'promise' || node.returnType === 'promise') {
    features.add('async-runtime')
  }

  if (node.type === 'FunctionDeclaration' || node.type === 'MethodDefinition') {
    recordCallableSignatureFeatures(node, features)
  }

  if (node.type === 'VariableDeclaration' && node.valueType === 'function' && (node.nullable === true || isRuntimeFunctionType(node.functionType))) {
    features.add('callback-values')
    features.add('runtime-values')
  }

  if (node.type === 'ThrowStatement' || node.type === 'TryStatement') {
    features.add('runtime-values')
  }

  if (node.type === 'ObjectLiteral' || node.type === 'ArrayLiteral') {
    features.add('runtime-values')
  }

  if (node.type === 'ObjectLiteral') {
    features.add('objects')
  }

  if (node.type === 'ForOfStatement' && node.shape?.kind === 'object') {
    features.add('objects')
    features.add('runtime-values')
  }

  if (node.type === 'ArrayLiteral') {
    features.add('collections')
  }

  if (node.type === 'NewExpression' && runtimeConstructorName(node) != null) {
    features.add('runtime-values')

    if (collectionConstructorName(node) != null) {
      features.add('collections')
    } else if (objectConstructorName(node) != null) {
      features.add('objects')
    }
  }

  if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
    recordCallFeatures(node, features)
  }

  if (node.type === 'IndexExpression' && node.collectionKind === 'map' && node.nullable === true) {
    features.add('collections')
    features.add('runtime-values')
    features.add('map-get-null')
  }

  if (node.type === 'AssignmentExpression' && node.target?.type === 'IndexExpression' && node.target.collectionKind === 'map') {
    features.add('collections')
    features.add('runtime-values')
    features.add('map-index-set')
  }

  if (node.type === 'AssignmentExpression' && isObjectFieldExpression(node.target)) {
    features.add('objects')
    features.add('runtime-values')
  }

  if (isObjectFieldExpression(node)) {
    features.add('objects')
    features.add('runtime-values')
  }

  if (node.type === 'OptionalCallExpression') {
    features.add('callback-values')
    features.add('runtime-values')
  }

  if (node.type === 'BinaryExpression') {
    if (node.operator === '+' && node.valueType === 'string') {
      features.add('runtime-values')
    }

    if (['===', '!==', '==', '!='].includes(node.operator) && (mayBeStringBytesOperand(node.left) || mayBeStringBytesOperand(node.right))) {
      features.add('string-bytes')
    }
  }

  if (node.type === 'MemberExpression' && node.property === 'length' && mayBeStringBytesOperand(node.object)) {
    features.add('string-bytes')
  }
}

function recordCallableSignatureFeatures(node: AnyNode, features: Set<IrFeature>): void {
  if (node.returnType === 'string' || node.returnNullable === true) {
    features.add('runtime-values')
  }

  for (const param of node.params ?? []) {
    if (['string', 'object'].includes(param.valueType) || isRuntimeFunctionType(param.functionType)) {
      features.add('runtime-values')
    }

    if (param.valueType === 'function' && (param.nullable === true || isRuntimeFunctionType(param.functionType))) {
      features.add('callback-values')
    }
  }
}

function recordCallFeatures(expression: AnyNode, features: Set<IrFeature>): void {
  if (timeRuntimeCallName(expression.callee) != null) {
    features.add('clocks')
  }

  const arrayMethod = arrayMethodCallName(expression)

  const collectionMethod = collectionMethodCallName(expression)

  if (collectionMethod != null || arrayMethod != null) {
    features.add('collections')
    features.add('runtime-values')
  }

  if (arrayMethod === 'pop') {
    features.add('array-pop-null')
  }

  if (collectionMethod === 'get' && expression.nullable === true) {
    features.add('map-get-null')
  }

  if (isStringConversionCall(expression)) {
    features.add('runtime-values')
    features.add('string-bytes')
  }

  if (stringRuntimeMethodName(expression) != null) {
    features.add('runtime-values')
    features.add('string-bytes')
  }
}

function runtimeConstructorName(expression: AnyNode): string | null {
  if (expression.callee?.type !== 'Reference' || expression.callee.path.length !== 1) {
    return null
  }

  return ['Error', 'Map', 'Set'].includes(expression.callee.path[0]) ? expression.callee.path[0] : null
}

function collectionConstructorName(expression: AnyNode): string | null {
  if (expression.callee?.type !== 'Reference' || expression.callee.path.length !== 1) {
    return null
  }

  return ['Map', 'Set'].includes(expression.callee.path[0]) ? expression.callee.path[0] : null
}

function objectConstructorName(expression: AnyNode): string | null {
  if (expression.callee?.type !== 'Reference' || expression.callee.path.length !== 1) {
    return null
  }

  return expression.callee.path[0] === 'Error' ? expression.callee.path[0] : null
}

function isObjectFieldExpression(expression: AnyNode | null | undefined): boolean {
  if (expression?.type === 'MemberExpression' || expression?.type === 'OptionalMemberExpression') {
    return expression.object?.shape?.kind === 'object'
  }

  return (expression?.type === 'IndexExpression' || expression?.type === 'OptionalIndexExpression')
    && expression.object?.shape?.kind === 'object'
    && expression.collectionKind !== 'map'
}

function collectionMethodCallName(expression: AnyNode): string | null {
  if (expression.callee?.type !== 'MemberExpression') {
    return null
  }

  return ['add', 'clear', 'delete', 'get', 'has', 'set'].includes(expression.callee.property) ? expression.callee.property : null
}

function arrayMethodCallName(expression: AnyNode): string | null {
  if (expression.callee?.type !== 'MemberExpression') {
    return null
  }

  return ['filter', 'map', 'pop', 'push', 'sort'].includes(expression.callee.property) ? expression.callee.property : null
}

function isStringConversionCall(expression: AnyNode): boolean {
  return expression.callee?.type === 'Reference'
    && expression.callee.path.length === 1
    && expression.callee.path[0] === 'String'
}

function stringRuntimeMethodName(expression: AnyNode): string | null {
  if (expression.callee?.type !== 'MemberExpression') {
    return null
  }

  return ['endsWith', 'includes', 'slice', 'startsWith', 'trim'].includes(expression.callee.property) ? expression.callee.property : null
}

function timeRuntimeCallName(callee: AnyNode): string | null {
  if (callee?.type !== 'MemberExpression' || callee.object.type !== 'Reference' || callee.object.path.length !== 1) {
    return null
  }

  if (callee.object.path[0] === 'Date' && callee.property === 'now') {
    return 'Date.now'
  }

  if (callee.object.path[0] === 'performance' && callee.property === 'now') {
    return 'performance.now'
  }

  return null
}

function mayBeStringBytesOperand(expression: AnyNode | null | undefined): boolean {
  if (expression == null) {
    return false
  }

  if (expression.valueType === 'string') {
    return true
  }

  return expression.type != null
    && ['StringLiteral', 'TemplateLiteral', 'Reference', 'MemberExpression', 'IndexExpression', 'CallExpression', 'BinaryExpression'].includes(expression.type)
}

function isRuntimeFunctionType(functionType: AnyNode | null | undefined): boolean {
  return functionType != null
    && functionType.returnType === 'void'
    && functionType.params.some(param => ['string', 'object'].includes(param.valueType))
    && functionType.params.every(param => ['number', 'boolean', 'string', 'object'].includes(param.valueType))
}
