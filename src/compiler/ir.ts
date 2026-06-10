import type { AnyNode, IrFeature, IrFunctionEffect, IrProgram, IrRuntimeRequirement, IrSyntaxFeatureUsage, IrThrowValueType, ProgramNode } from './types.ts'

export function lowerHirToIr(program: ProgramNode): IrProgram {
  const features = collectIrFeatures(program)

  return {
    type: 'IrProgram',
    version: 1,
    features,
    runtimeRequirements: collectRuntimeRequirements(features),
    functionEffects: collectIrFunctionEffects([{ body: program.body }]),
    syntaxFeatures: collectSyntaxFeatureUsages(program),
    body: program.body
  }
}

export function hasIrFeature(program: IrProgram, feature: IrFeature): boolean {
  return program.features.includes(feature)
}

export function hasIrRuntimeRequirement(program: IrProgram, requirement: IrRuntimeRequirement): boolean {
  return program.runtimeRequirements.includes(requirement)
}

export function collectIrFunctionEffects(programs: Array<{ body: AnyNode[] }>): IrFunctionEffect[] {
  return collectFunctionEffects(programs.flatMap(program => program.body.filter(item => item.type === 'FunctionDeclaration')))
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
    } else {
      requirements.add(feature)
    }
  }

  return [...requirements].sort()
}

function collectSyntaxFeatureUsages(program: ProgramNode): IrSyntaxFeatureUsage[] {
  const usages: IrSyntaxFeatureUsage[] = []

  visitSyntaxFeatureUsage(program, usages)

  return usages
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

  if (node.type === 'NewExpression' && runtimeConstructorName(node) != null) {
    features.add('runtime-values')
  }

  if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
    recordCallFeatures(node, features)
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

  if (collectionMethodCallName(expression) != null || arrayMethodCallName(expression) != null) {
    features.add('runtime-values')
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

  return ['filter', 'map', 'sort'].includes(expression.callee.property) ? expression.callee.property : null
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
