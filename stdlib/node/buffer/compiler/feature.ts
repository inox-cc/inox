import { binaryConstructorNameFromPath } from './descriptor.ts'
import type { AnyNode, IrFeature } from '../../../../compiler/types.ts'
import type { CompilerFeatureDescriptor } from '../../../../compiler/features/types.ts'
import { nullableString, simpleReferencePath } from '../../../../compiler/features/runtime-backed/common.ts'
import type { RuntimeBackedFeatureNode } from '../../../../compiler/features/runtime-backed/common.ts'

export const binaryFeature: CompilerFeatureDescriptor = {
  id: 'binary',
  runtimeRequirements: ['binary', 'managed-values'],
  cPreludeIncludes: [],
  hasCPreludeHelpers: false
}

export function collectBinaryIrFeatures(node: AnyNode, features: Set<IrFeature>): void {
  const item = node as RuntimeBackedFeatureNode

  if (item.valueType === 'bytes' || item.returnType === 'bytes') {
    features.add('binary')
    features.add('runtime-values')
  }

  if (isBinaryConstructorExpression(item)) {
    features.add('binary')
    features.add('runtime-values')
  }

  if (binaryRuntimeMethodName(item)) {
    features.add('binary')
    features.add('runtime-values')
  }
}

export function binaryFeatureChildNodes(node: AnyNode): AnyNode[] | null {
  const item = node as RuntimeBackedFeatureNode

  if (!isBinaryArrayLiteralConstructor(item)) {
    return null
  }

  const result: AnyNode[] = []
  const args = nodeArgsOrEmpty(item)
  const firstArg = anyNodeAt(args, 0)
  const elements = nodeElementsOrEmpty(firstArg)

  pushNodeIfPresent(result, item.callee)

  for (let elementIndex = 0; elementIndex < elements.length; elementIndex = elementIndex + 1) {
    result.push(anyNodeAt(elements, elementIndex))
  }

  for (let argIndex = 1; argIndex < args.length; argIndex = argIndex + 1) {
    result.push(anyNodeAt(args, argIndex))
  }

  return result
}

function isBinaryConstructorExpression(expression: RuntimeBackedFeatureNode): boolean {
  return expression.type === 'NewExpression' && binaryConstructorName(expression) !== null
}

function isBinaryArrayLiteralConstructor(expression: RuntimeBackedFeatureNode): boolean {
  if (!isBinaryConstructorExpression(expression)) {
    return false
  }

  const args = nodeArgsOrEmpty(expression)

  if (args.length === 0) {
    return false
  }

  const first = anyNodeAt(args, 0)

  return first.type === 'ArrayLiteral'
}

function binaryConstructorName(expression: RuntimeBackedFeatureNode): string | null {
  const calleePath = simpleReferencePath(expression.callee)

  if (calleePath === null || typeof calleePath === 'undefined') {
    return null
  }

  return binaryConstructorNameFromPath(calleePath)
}

function binaryRuntimeMethodName(expression: RuntimeBackedFeatureNode): string | null {
  const callee = expression.callee
  const method = nullableString(expression.binaryRuntimeMethod)

  if (
    expression.type !== 'CallExpression' ||
    callee === null ||
    typeof callee === 'undefined' ||
    callee.type !== 'MemberExpression'
  ) {
    return null
  }

  if (method !== null && typeof method !== 'undefined') {
    return method
  }

  return null
}

function nodeArgsOrEmpty(node: RuntimeBackedFeatureNode): AnyNode[] {
  const args = node.args
  const result: AnyNode[] = []

  if (args === null || typeof args === 'undefined') {
    return result
  }

  for (let index = 0; index < args.length; index = index + 1) {
    result.push(anyNodeAt(args, index))
  }

  return result
}

function nodeElementsOrEmpty(node: AnyNode | null | undefined): AnyNode[] {
  const result: AnyNode[] = []

  if (node === null || typeof node === 'undefined') {
    return result
  }

  const elements = node.elements

  if (elements === null || typeof elements === 'undefined') {
    return result
  }

  for (let index = 0; index < elements.length; index = index + 1) {
    result.push(anyNodeAt(elements, index))
  }

  return result
}

function anyNodeAt(nodes: AnyNode[], index: number): AnyNode {
  return nodes[index]
}

function pushNodeIfPresent(target: AnyNode[], node: AnyNode | null | undefined): void {
  if (node === null || typeof node === 'undefined') {
    return
  }

  target.push(node)
}
