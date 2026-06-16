import { binaryConstructorNameFromPath } from '../stdlib/descriptors/binary.ts'
import {
  arrayRuntimeMethodName,
  collectionConstructorNameFromPath,
  isMapMethod,
  isSetMethod,
  stringRuntimeMethodName as collectionStringRuntimeMethodName
} from '../stdlib/descriptors/collections.ts'
import { debugRuntimeMethodNameFromPath } from '../stdlib/descriptors/debug.ts'
import { fsRuntimeMethodForPath } from '../stdlib/descriptors/fs.ts'
import { jsonRuntimeMethodNameFromPath } from '../stdlib/descriptors/json.ts'
import { timeRuntimeMethodNameFromPath } from '../stdlib/descriptors/time.ts'
import { timerRuntimeMethodNameFromPath } from '../stdlib/descriptors/timers.ts'
import { memberExpressionPath } from '../member-paths.ts'
import type { AnyNode, IrFeature, IrRuntimeRequirement, IrSyntaxFeatureUsage, ProgramNode } from '../types.ts'

type ChildNode = {
  [key: string]: unknown
}

type FeatureCollector = {
  add(feature: IrFeature): void
}

type RuntimeRequirementCollector = {
  add(requirement: IrRuntimeRequirement): void
}

const NODE_CHILD_KEYS = [
  'body',
  'params',
  'fields',
  'methods',
  'init',
  'condition',
  'consequent',
  'alternate',
  'test',
  'update',
  'iterable',
  'discriminant',
  'cases',
  'block',
  'handler',
  'finalizer',
  'argument',
  'args',
  'callee',
  'object',
  'index',
  'target',
  'value',
  'valueType',
  'functionType',
  'returnShape',
  'left',
  'right',
  'elements',
  'properties',
  'expression'
]

export function collectIrFeatures(program: ProgramNode): IrFeature[] {
  const features = createFeatureSet()

  visitNode(program, features)

  return sortedIrFeatures(features)
}

export function collectIrFeatureRequirements(programs: Array<{ features: IrFeature[] }>): IrFeature[] {
  const features = createFeatureSet()

  for (const program of programs) {
    for (const feature of program.features) {
      features.add(feature)
    }
  }

  return sortedIrFeatures(features)
}

export function collectRuntimeRequirements(features: IrFeature[]): IrRuntimeRequirement[] {
  const requirements = createRuntimeRequirementSet()

  for (const feature of features) {
    if (feature === 'runtime-values') {
      requirements.add('managed-values')
    } else if (feature === 'child-process') {
      requirements.add('child-process')
      requirements.add('managed-values')
      requirements.add('string-bytes')
    } else if (feature === 'binary') {
      requirements.add('binary')
      requirements.add('managed-values')
    } else if (feature === 'collections') {
      requirements.add('collections')
      requirements.add('managed-values')
    } else if (feature === 'crypto') {
      requirements.add('binary')
      requirements.add('crypto')
      requirements.add('managed-values')
    } else if (feature === 'objects') {
      requirements.add('managed-values')
      requirements.add('objects')
    } else if (feature === 'os') {
      requirements.add('managed-values')
      requirements.add('os')
      requirements.add('string-bytes')
    } else if (feature === 'path') {
      requirements.add('managed-values')
      requirements.add('path')
      requirements.add('string-bytes')
    } else if (feature === 'process') {
      requirements.add('managed-values')
      requirements.add('process')
      requirements.add('string-bytes')
    } else if (feature === 'url') {
      requirements.add('managed-values')
      requirements.add('objects')
      requirements.add('string-bytes')
      requirements.add('url')
    } else if (feature === 'weak-references') {
      requirements.add('managed-values')
      requirements.add('objects')
      requirements.add('weak-references')
    } else if (feature === 'debug-memory') {
      requirements.add('managed-values')
      requirements.add('objects')
      requirements.add('debug-memory')
    } else if (feature === 'fs') {
      requirements.add('async-runtime')
      requirements.add('fs')
    } else if (feature === 'json') {
      requirements.add('collections')
      requirements.add('json')
      requirements.add('managed-values')
      requirements.add('objects')
      requirements.add('string-bytes')
    } else if (feature === 'timers') {
      requirements.add('async-runtime')
      requirements.add('callback-values')
      requirements.add('managed-values')
      requirements.add('timers')
    } else if (
      feature === 'array-pop-null' ||
      feature === 'map-get-null' ||
      feature === 'map-index-set' ||
      feature === 'number-from-string-null' ||
      feature === 'numeric-casts'
    ) {
      continue
    } else {
      requirements.add(feature)
    }
  }

  return sortedRuntimeRequirements(requirements)
}

export function collectIrRuntimeRequirements(
  programs: Array<{ runtimeRequirements: IrRuntimeRequirement[] }>
): IrRuntimeRequirement[] {
  const requirements = createRuntimeRequirementSet()

  for (const program of programs) {
    for (const requirement of program.runtimeRequirements) {
      requirements.add(requirement)
    }
  }

  return sortedRuntimeRequirements(requirements)
}

export function collectSyntaxFeatureUsages(program: ProgramNode): IrSyntaxFeatureUsage[] {
  const usages: IrSyntaxFeatureUsage[] = []

  visitSyntaxFeatureUsage(program, usages)

  return usages
}

export function collectIrSyntaxFeatureUsages(
  programs: Array<{ syntaxFeatures: IrSyntaxFeatureUsage[] }>
): IrSyntaxFeatureUsage[] {
  const usages: IrSyntaxFeatureUsage[] = []

  for (const program of programs) {
    for (const usage of program.syntaxFeatures) {
      usages.push(usage)
    }
  }

  return usages
}

function sortedIrFeatures(features: Set<IrFeature>): IrFeature[] {
  const result: IrFeature[] = []

  for (const feature of features) {
    result.push(feature)
  }

  result.sort()
  return result
}

function sortedRuntimeRequirements(requirements: Set<IrRuntimeRequirement>): IrRuntimeRequirement[] {
  const result: IrRuntimeRequirement[] = []

  for (const requirement of requirements) {
    result.push(requirement)
  }

  result.sort()
  return result
}

function createFeatureSet(): Set<IrFeature> {
  return new Set()
}

function createRuntimeRequirementSet(): Set<IrRuntimeRequirement> {
  return new Set()
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

  visitSyntaxFeatureChildren(item, usages)
}

function visitNode(node: unknown, features: FeatureCollector): void {
  if (node == null) {
    return
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      visitNode(item, features)
    }
    return
  }

  const item = node as AnyNode

  recordNodeFeatures(item, features)

  if (isBinaryArrayLiteralConstructor(item)) {
    visitNode(item.callee, features)

    for (const element of item.args[0].elements) {
      visitNode(element, features)
    }

    for (const arg of item.args.slice(1)) {
      visitNode(arg, features)
    }

    return
  }

  visitFeatureChildren(item, features)
}

function visitSyntaxFeatureChildren(item: ChildNode, usages: IrSyntaxFeatureUsage[]): void {
  for (const key of NODE_CHILD_KEYS) {
    const value = item[key]

    if (value != null) {
      visitSyntaxFeatureUsage(value, usages)
    }
  }
}

function visitFeatureChildren(item: ChildNode, features: FeatureCollector): void {
  for (const key of NODE_CHILD_KEYS) {
    const value = item[key]

    if (value != null) {
      visitNode(value, features)
    }
  }
}

function recordNodeFeatures(node: AnyNode, features: FeatureCollector): void {
  if (node.nullable === true) {
    features.add('runtime-values')
  }

  if (node.ownership === 'weak') {
    features.add('runtime-values')
    features.add('objects')
    features.add('weak-references')
  }

  if (node.valueType === 'promise' || node.returnType === 'promise') {
    features.add('async-runtime')
  }

  if (node.valueType === 'bytes' || node.returnType === 'bytes') {
    features.add('binary')
    features.add('runtime-values')
  }

  if (node.type === 'FunctionDeclaration' || node.type === 'MethodDefinition') {
    recordCallableSignatureFeatures(node, features)
  }

  if (node.osRuntimeMethod != null || node.osRuntimeConstant != null) {
    features.add('os')
    features.add('runtime-values')
  }

  if (
    node.type === 'VariableDeclaration' &&
    node.valueType === 'function' &&
    (node.nullable === true || isRuntimeFunctionType(node.functionType))
  ) {
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

  if (node.type === 'ForOfStatement' && node.shape != null && node.shape.kind === 'object') {
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
    } else if (binaryConstructorName(node) != null) {
      features.add('binary')
    } else if (objectConstructorName(node) != null) {
      features.add('objects')
    }
  }

  if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression' || node.type === 'NewExpression') {
    recordCallFeatures(node, features)
  }

  if (node.type === 'TemplateLiteral' && node.raw.includes('${')) {
    features.add('runtime-values')
    features.add('string-bytes')
  }

  if (node.type === 'IndexExpression' && node.collectionKind === 'map' && node.nullable === true) {
    features.add('collections')
    features.add('runtime-values')
    features.add('map-get-null')
  }

  if (
    node.type === 'AssignmentExpression' &&
    node.target != null &&
    node.target.type === 'IndexExpression' &&
    node.target.collectionKind === 'map'
  ) {
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

  if (node.type === 'MemberExpression' && node.fsRuntimeConstant != null) {
    features.add('fs')
  }

  if (node.pathRuntimeConstant != null) {
    features.add('path')
    features.add('runtime-values')
    features.add('string-bytes')
  }

  if (node.processRuntimeProperty != null || node.processRuntimeEnvName != null) {
    features.add('process')
    features.add('runtime-values')
    features.add('string-bytes')
  }

  if (node.type === 'OptionalCallExpression') {
    features.add('callback-values')
    features.add('runtime-values')
  }

  if (node.type === 'BinaryExpression') {
    if (node.operator === '+' && node.valueType === 'string') {
      features.add('runtime-values')
    }

    if (
      ['===', '!==', '==', '!='].includes(node.operator) &&
      (mayBeStringBytesOperand(node.left) || mayBeStringBytesOperand(node.right))
    ) {
      features.add('string-bytes')
    }
  }

  if (node.type === 'MemberExpression' && node.property === 'length' && mayBeStringBytesOperand(node.object)) {
    features.add('string-bytes')
  }
}

function recordCallableSignatureFeatures(node: AnyNode, features: FeatureCollector): void {
  if (['bytes', 'string'].includes(node.returnType) || node.returnNullable === true) {
    features.add('runtime-values')
  }

  if (node.params == null) {
    return
  }

  for (const param of node.params) {
    if (['bytes', 'string', 'object'].includes(param.valueType) || isRuntimeFunctionType(param.functionType)) {
      features.add('runtime-values')
    }

    if (param.valueType === 'function' && (param.nullable === true || isRuntimeFunctionType(param.functionType))) {
      features.add('callback-values')
    }
  }
}

function recordCallFeatures(expression: AnyNode, features: FeatureCollector): void {
  if (timeRuntimeCallName(expression.callee) != null) {
    features.add('clocks')
  }

  if (expression.fsRuntimeMethod != null || fsRuntimeMethodForPath(memberExpressionPath(expression.callee)) != null) {
    features.add('fs')
  }

  if (jsonRuntimeCallName(expression.callee) != null) {
    features.add('json')
    features.add('runtime-values')
  }

  if (cryptoRuntimeMethodName(expression) != null) {
    features.add('crypto')
    features.add('runtime-values')
  }

  if (debugRuntimeMethodName(expression) != null) {
    features.add('debug-memory')
    features.add('objects')
    features.add('runtime-values')
  }

  if (pathRuntimeMethodName(expression) != null) {
    features.add('path')
    features.add('runtime-values')
    features.add('string-bytes')
  }

  if (urlRuntimeMethodName(expression) != null) {
    features.add('url')
    features.add('runtime-values')
    features.add('string-bytes')
  }

  if (processRuntimeMethodName(expression) != null) {
    features.add('process')
    features.add('runtime-values')
    features.add('string-bytes')
  }

  if (childProcessRuntimeMethodName(expression) != null) {
    features.add('child-process')
    features.add('runtime-values')
    features.add('string-bytes')
  }

  if (timerRuntimeCallName(expression) != null) {
    features.add('timers')
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

  if (isNumberConversionCall(expression)) {
    features.add('number-from-string-null')
    features.add('runtime-values')
    features.add('string-bytes')
  }

  if (isNumericCastCall(expression)) {
    features.add('numeric-casts')
  }

  if (binaryRuntimeMethodName(expression) != null) {
    features.add('binary')
    features.add('runtime-values')
  }

  const stringMethod = stringRuntimeMethodName(expression)

  if (stringMethod != null) {
    features.add('runtime-values')
    features.add('string-bytes')

    if (stringMethod === 'split') {
      features.add('collections')
    }
  }
}

function runtimeConstructorName(expression: AnyNode): string | null {
  if (!isSimpleReference(expression.callee)) {
    return null
  }

  if (expression.callee.path[0] === 'Error') {
    return 'Error'
  }

  const collectionName = collectionConstructorNameFromPath(expression.callee.path)

  if (collectionName != null) {
    return collectionName
  }

  return binaryConstructorNameFromPath(expression.callee.path)
}

function collectionConstructorName(expression: AnyNode): string | null {
  if (!isSimpleReference(expression.callee)) {
    return null
  }

  return collectionConstructorNameFromPath(expression.callee.path)
}

function objectConstructorName(expression: AnyNode): string | null {
  if (!isSimpleReference(expression.callee)) {
    return null
  }

  if (expression.callee.path[0] === 'Error') {
    return expression.callee.path[0]
  }

  return null
}

function binaryConstructorName(expression: AnyNode): string | null {
  if (!isSimpleReference(expression.callee)) {
    return null
  }

  return binaryConstructorNameFromPath(expression.callee.path)
}

function isBinaryArrayLiteralConstructor(expression: AnyNode): boolean {
  return (
    binaryConstructorName(expression) != null &&
    expression.args != null &&
    expression.args[0] != null &&
    expression.args[0].type === 'ArrayLiteral'
  )
}

function binaryRuntimeMethodName(expression: AnyNode): string | null {
  if (expression.type !== 'CallExpression' || expression.callee == null || expression.callee.type !== 'MemberExpression') {
    return null
  }

  if (expression.binaryRuntimeMethod != null) {
    return expression.binaryRuntimeMethod
  }

  return null
}

function cryptoRuntimeMethodName(expression: AnyNode): string | null {
  if (expression.type !== 'CallExpression' || expression.cryptoRuntimeMethod == null) {
    return null
  }

  return expression.cryptoRuntimeMethod
}

function debugRuntimeMethodName(expression: AnyNode): string | null {
  if (expression.type !== 'CallExpression' || expression.callee == null || expression.callee.type !== 'MemberExpression') {
    return null
  }

  if (debugRuntimeMethodNameFromPath(memberExpressionPath(expression.callee)) === expression.debugRuntimeMethod) {
    return expression.debugRuntimeMethod
  }

  return null
}

function pathRuntimeMethodName(expression: AnyNode): string | null {
  if (expression.type !== 'CallExpression' || expression.pathRuntimeMethod == null) {
    return null
  }

  return expression.pathRuntimeMethod
}

function urlRuntimeMethodName(expression: AnyNode): string | null {
  if (
    (expression.type !== 'CallExpression' && expression.type !== 'NewExpression') ||
    expression.urlRuntimeMethod == null
  ) {
    return null
  }

  return expression.urlRuntimeMethod
}

function processRuntimeMethodName(expression: AnyNode): string | null {
  if (expression.type !== 'CallExpression' || expression.processRuntimeMethod == null) {
    return null
  }

  return expression.processRuntimeMethod
}

function childProcessRuntimeMethodName(expression: AnyNode): string | null {
  if (expression.type !== 'CallExpression' || expression.childProcessRuntimeMethod == null) {
    return null
  }

  return expression.childProcessRuntimeMethod
}

function isObjectFieldExpression(expression: AnyNode | null | undefined): boolean {
  if (expression == null) {
    return false
  }

  if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
    return (
      expression.object != null &&
      expression.object.shape != null &&
      expression.object.shape.kind === 'object'
    )
  }

  return (
    (expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression') &&
    expression.object != null &&
    expression.object.shape != null &&
    expression.object.shape.kind === 'object' &&
    expression.collectionKind !== 'map'
  )
}

function collectionMethodCallName(expression: AnyNode): string | null {
  if (expression.callee == null || expression.callee.type !== 'MemberExpression') {
    return null
  }

  if (isMapMethod(expression.callee.property) || isSetMethod(expression.callee.property)) {
    return expression.callee.property
  }

  return null
}

function arrayMethodCallName(expression: AnyNode): string | null {
  if (expression.callee == null || expression.callee.type !== 'MemberExpression') {
    return null
  }

  return arrayRuntimeMethodName(expression.callee.property)
}

function isStringConversionCall(expression: AnyNode): boolean {
  return (
    expression.callee != null &&
    expression.callee.type === 'Reference' &&
    expression.callee.path.length === 1 &&
    expression.callee.path[0] === 'String'
  )
}

function isNumberConversionCall(expression: AnyNode): boolean {
  return (
    expression.callee != null &&
    expression.callee.type === 'Reference' &&
    expression.callee.path.length === 1 &&
    expression.callee.path[0] === 'Number'
  )
}

function isNumericCastCall(expression: AnyNode): boolean {
  return (
    expression.callee != null &&
    expression.callee.type === 'Reference' &&
    expression.callee.path.length === 1 &&
    ['i32', 'u32', 'u64', 'f32', 'f64'].includes(expression.callee.path[0])
  )
}

function stringRuntimeMethodName(expression: AnyNode): string | null {
  if (expression.callee == null || expression.callee.type !== 'MemberExpression') {
    return null
  }

  return collectionStringRuntimeMethodName(expression.callee.property)
}

function timeRuntimeCallName(callee: AnyNode): string | null {
  return timeRuntimeMethodNameFromPath(memberExpressionPath(callee))
}

function jsonRuntimeCallName(callee: AnyNode): string | null {
  return jsonRuntimeMethodNameFromPath(memberExpressionPath(callee))
}

function timerRuntimeCallName(expression: AnyNode): string | null {
  if (expression.type === 'CallExpression' && expression.timerRuntimeMethod != null) {
    return expression.timerRuntimeMethod
  }

  const callee = expression.callee

  if (!isSimpleReference(callee)) {
    return null
  }

  return timerRuntimeMethodNameFromPath(callee.path)
}

function mayBeStringBytesOperand(expression: AnyNode | null | undefined): boolean {
  if (expression == null) {
    return false
  }

  if (expression.valueType === 'string') {
    return true
  }

  return (
    expression.type != null &&
    [
      'StringLiteral',
      'TemplateLiteral',
      'Reference',
      'MemberExpression',
      'IndexExpression',
      'CallExpression',
      'BinaryExpression'
    ].includes(expression.type)
  )
}

function isRuntimeFunctionType(functionType: AnyNode | null | undefined): boolean {
  if (functionType == null || functionType.returnType !== 'void') {
    return false
  }

  let hasRuntimeParam = false

  for (const param of functionType.params) {
    if (!['number', 'boolean', 'string', 'object'].includes(param.valueType)) {
      return false
    }

    if (param.valueType === 'string' || param.valueType === 'object') {
      hasRuntimeParam = true
    }
  }

  return hasRuntimeParam
}

function isSimpleReference(expression: AnyNode | null | undefined): boolean {
  return expression != null && expression.type === 'Reference' && expression.path.length === 1
}
