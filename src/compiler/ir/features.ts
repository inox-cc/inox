import { binaryConstructorNameFromPath } from '../stdlib/descriptors/binary.ts'
import {
  arrayRuntimeMethodName,
  collectionConstructorNameFromPath,
  isMapMethod,
  isSetMethod,
  stringRuntimeMethodName as collectionStringRuntimeMethodName
} from '../stdlib/descriptors/collections.ts'
import { cryptoRuntimeMethodNameFromPath } from '../stdlib/descriptors/crypto.ts'
import { debugRuntimeMethodNameFromPath } from '../stdlib/descriptors/debug.ts'
import { fsRuntimeMethodForPath } from '../stdlib/descriptors/fs.ts'
import { jsonRuntimeMethodNameFromPath } from '../stdlib/descriptors/json.ts'
import { timeRuntimeMethodNameFromPath } from '../stdlib/descriptors/time.ts'
import { timerRuntimeMethodNameFromPath } from '../stdlib/descriptors/timers.ts'
import { memberExpressionPath } from '../member-paths.ts'
import type { AnyNode, IrFeature, IrRuntimeRequirement, IrSyntaxFeatureUsage, ProgramNode } from '../types.ts'

export function collectIrFeatures(program: ProgramNode): IrFeature[] {
  const features = new Set<IrFeature>()

  visitNode(program, features)

  return [...features].sort()
}

export function collectIrFeatureRequirements(programs: Array<{ features: IrFeature[] }>): IrFeature[] {
  return [...new Set(programs.flatMap((program) => program.features))].sort()
}

export function collectRuntimeRequirements(features: IrFeature[]): IrRuntimeRequirement[] {
  const requirements = new Set<IrRuntimeRequirement>()

  for (const feature of features) {
    if (feature === 'runtime-values') {
      requirements.add('managed-values')
    } else if (feature === 'binary') {
      requirements.add('binary')
      requirements.add('managed-values')
    } else if (feature === 'collections') {
      requirements.add('collections')
      requirements.add('managed-values')
    } else if (feature === 'crypto') {
      requirements.add('binary')
      requirements.add('managed-values')
    } else if (feature === 'objects') {
      requirements.add('managed-values')
      requirements.add('objects')
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

  return [...requirements].sort()
}

export function collectIrRuntimeRequirements(
  programs: Array<{ runtimeRequirements: IrRuntimeRequirement[] }>
): IrRuntimeRequirement[] {
  return [...new Set(programs.flatMap((program) => program.runtimeRequirements))].sort()
}

export function collectSyntaxFeatureUsages(program: ProgramNode): IrSyntaxFeatureUsage[] {
  const usages: IrSyntaxFeatureUsage[] = []

  visitSyntaxFeatureUsage(program, usages)

  return usages
}

export function collectIrSyntaxFeatureUsages(
  programs: Array<{ syntaxFeatures: IrSyntaxFeatureUsage[] }>
): IrSyntaxFeatureUsage[] {
  return programs.flatMap((program) => program.syntaxFeatures)
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
    } else if (binaryConstructorName(node) != null) {
      features.add('binary')
    } else if (objectConstructorName(node) != null) {
      features.add('objects')
    }
  }

  if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
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
    node.target?.type === 'IndexExpression' &&
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

function recordCallableSignatureFeatures(node: AnyNode, features: Set<IrFeature>): void {
  if (['bytes', 'string'].includes(node.returnType) || node.returnNullable === true) {
    features.add('runtime-values')
  }

  for (const param of node.params ?? []) {
    if (['bytes', 'string', 'object'].includes(param.valueType) || isRuntimeFunctionType(param.functionType)) {
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

  if (timerRuntimeCallName(expression.callee) != null) {
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
  if (expression.callee?.type !== 'Reference' || expression.callee.path.length !== 1) {
    return null
  }

  return expression.callee.path[0] === 'Error'
    ? 'Error'
    : (collectionConstructorNameFromPath(expression.callee.path) ??
        binaryConstructorNameFromPath(expression.callee.path))
}

function collectionConstructorName(expression: AnyNode): string | null {
  if (expression.callee?.type !== 'Reference' || expression.callee.path.length !== 1) {
    return null
  }

  return collectionConstructorNameFromPath(expression.callee.path)
}

function objectConstructorName(expression: AnyNode): string | null {
  if (expression.callee?.type !== 'Reference' || expression.callee.path.length !== 1) {
    return null
  }

  return expression.callee.path[0] === 'Error' ? expression.callee.path[0] : null
}

function binaryConstructorName(expression: AnyNode): string | null {
  if (expression.callee?.type !== 'Reference' || expression.callee.path.length !== 1) {
    return null
  }

  return binaryConstructorNameFromPath(expression.callee.path)
}

function isBinaryArrayLiteralConstructor(expression: AnyNode): boolean {
  return binaryConstructorName(expression) != null && expression.args?.[0]?.type === 'ArrayLiteral'
}

function binaryRuntimeMethodName(expression: AnyNode): string | null {
  if (expression.type !== 'CallExpression' || expression.callee?.type !== 'MemberExpression') {
    return null
  }

  return typeof expression.binaryRuntimeMethod === 'string' ? expression.binaryRuntimeMethod : null
}

function cryptoRuntimeMethodName(expression: AnyNode): string | null {
  if (expression.type !== 'CallExpression' || expression.callee?.type !== 'MemberExpression') {
    return null
  }

  return cryptoRuntimeMethodNameFromPath(memberExpressionPath(expression.callee)) === expression.cryptoRuntimeMethod
    ? expression.cryptoRuntimeMethod
    : null
}

function debugRuntimeMethodName(expression: AnyNode): string | null {
  if (expression.type !== 'CallExpression' || expression.callee?.type !== 'MemberExpression') {
    return null
  }

  return debugRuntimeMethodNameFromPath(memberExpressionPath(expression.callee)) === expression.debugRuntimeMethod
    ? expression.debugRuntimeMethod
    : null
}

function isObjectFieldExpression(expression: AnyNode | null | undefined): boolean {
  if (expression?.type === 'MemberExpression' || expression?.type === 'OptionalMemberExpression') {
    return expression.object?.shape?.kind === 'object'
  }

  return (
    (expression?.type === 'IndexExpression' || expression?.type === 'OptionalIndexExpression') &&
    expression.object?.shape?.kind === 'object' &&
    expression.collectionKind !== 'map'
  )
}

function collectionMethodCallName(expression: AnyNode): string | null {
  if (expression.callee?.type !== 'MemberExpression') {
    return null
  }

  return isMapMethod(expression.callee.property) || isSetMethod(expression.callee.property)
    ? expression.callee.property
    : null
}

function arrayMethodCallName(expression: AnyNode): string | null {
  if (expression.callee?.type !== 'MemberExpression') {
    return null
  }

  return arrayRuntimeMethodName(expression.callee.property)
}

function isStringConversionCall(expression: AnyNode): boolean {
  return (
    expression.callee?.type === 'Reference' &&
    expression.callee.path.length === 1 &&
    expression.callee.path[0] === 'String'
  )
}

function isNumberConversionCall(expression: AnyNode): boolean {
  return (
    expression.callee?.type === 'Reference' &&
    expression.callee.path.length === 1 &&
    expression.callee.path[0] === 'Number'
  )
}

function isNumericCastCall(expression: AnyNode): boolean {
  return (
    expression.callee?.type === 'Reference' &&
    expression.callee.path.length === 1 &&
    ['i32', 'u32', 'u64', 'f32', 'f64'].includes(expression.callee.path[0])
  )
}

function stringRuntimeMethodName(expression: AnyNode): string | null {
  if (expression.callee?.type !== 'MemberExpression') {
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

function timerRuntimeCallName(callee: AnyNode): string | null {
  if (callee?.type !== 'Reference' || callee.path.length !== 1) {
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
  return (
    functionType != null &&
    functionType.returnType === 'void' &&
    functionType.params.some((param) => ['string', 'object'].includes(param.valueType)) &&
    functionType.params.every((param) => ['number', 'boolean', 'string', 'object'].includes(param.valueType))
  )
}
