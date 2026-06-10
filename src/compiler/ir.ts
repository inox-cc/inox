import type { AnyNode, IrFeature, IrProgram, IrRuntimeRequirement, ProgramNode } from './types.ts'

export function lowerHirToIr(program: ProgramNode): IrProgram {
  const features = collectIrFeatures(program)

  return {
    type: 'IrProgram',
    version: 1,
    features,
    runtimeRequirements: collectRuntimeRequirements(features),
    body: program.body
  }
}

export function hasIrFeature(program: IrProgram, feature: IrFeature): boolean {
  return program.features.includes(feature)
}

export function hasIrRuntimeRequirement(program: IrProgram, requirement: IrRuntimeRequirement): boolean {
  return program.runtimeRequirements.includes(requirement)
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
