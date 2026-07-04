import { memberExpressionPath } from '../../member-paths.ts'
import type { AnyNode, IrFeature } from '../../types.ts'
import type { CompilerFeatureDescriptor } from '../types.ts'

type CoreRuntimeFeatureSet = Set<IrFeature>

type CoreRuntimeShape = AnyNode & {
  kind?: string
}

type CoreRuntimeFunctionType = AnyNode & {
  params?: CoreRuntimeRawNode[]
  returnType?: string | null
}

type CoreRuntimeRawNode = AnyNode

type CoreRuntimeChildNode = AnyNode & {
  arrayElementFunctionType?: CoreRuntimeFunctionType | null
  collectionKind?: string | null
  elements?: CoreRuntimeRawNode[]
  functionType?: CoreRuntimeFunctionType | null
  path?: string[]
  property?: string | null
  shape?: CoreRuntimeShape | null
  type?: string
  valueType?: string | null
}

type CoreRuntimeNode = AnyNode & {
  args?: CoreRuntimeChildNode[]
  arrayElementType?: string | null
  arrayElementFunctionType?: CoreRuntimeFunctionType | null
  callee?: CoreRuntimeChildNode | null
  collectionKind?: string | null
  elements?: CoreRuntimeRawNode[]
  functionType?: CoreRuntimeFunctionType | null
  index?: CoreRuntimeChildNode | null
  kind?: string | null
  left?: CoreRuntimeChildNode | null
  nullable?: boolean
  numericCast?: string | null
  object?: CoreRuntimeChildNode | null
  objectRuntimeMethod?: string | null
  operator?: string | null
  ownership?: string | null
  params?: CoreRuntimeRawNode[]
  path?: string[]
  property?: string | null
  raw?: string | null
  returnNullable?: boolean
  returnType?: string | null
  right?: CoreRuntimeChildNode | null
  shape?: CoreRuntimeShape | null
  stringRuntimeMethod?: string | null
  target?: CoreRuntimeChildNode | null
  timerRuntimeMethod?: string | null
  type?: string
  valueType?: string | null
}

export const asyncRuntimeFeature: CompilerFeatureDescriptor = {
  id: 'async-runtime',
  runtimeRequirements: ['async-runtime'],
  cPreludeIncludes: [],
  hasCPreludeHelpers: false
}
export const callbackValuesFeature: CompilerFeatureDescriptor = {
  id: 'callback-values',
  runtimeRequirements: ['callback-values'],
  cPreludeIncludes: [],
  hasCPreludeHelpers: false
}
export const collectionsFeature: CompilerFeatureDescriptor = {
  id: 'collections',
  runtimeRequirements: ['collections', 'managed-values'],
  cPreludeIncludes: [],
  hasCPreludeHelpers: false
}
export const objectsFeature: CompilerFeatureDescriptor = {
  id: 'objects',
  runtimeRequirements: ['managed-values', 'objects'],
  cPreludeIncludes: [],
  hasCPreludeHelpers: false
}
export const runtimeValuesFeature: CompilerFeatureDescriptor = {
  id: 'runtime-values',
  runtimeRequirements: ['managed-values'],
  cPreludeIncludes: [],
  hasCPreludeHelpers: false
}
export const stringBytesFeature: CompilerFeatureDescriptor = {
  id: 'string-bytes',
  runtimeRequirements: ['string-bytes'],
  cPreludeIncludes: [],
  hasCPreludeHelpers: false
}
export const weakReferencesFeature: CompilerFeatureDescriptor = {
  id: 'weak-references',
  runtimeRequirements: ['managed-values', 'objects', 'weak-references'],
  cPreludeIncludes: [],
  hasCPreludeHelpers: false
}

export const coreRuntimeFeatures: CompilerFeatureDescriptor[] = [
  asyncRuntimeFeature,
  callbackValuesFeature,
  collectionsFeature,
  objectsFeature,
  runtimeValuesFeature,
  stringBytesFeature,
  weakReferencesFeature
]

export function collectCoreRuntimeIrFeatures(node: AnyNode, features: CoreRuntimeFeatureSet): void {
  const item = node as CoreRuntimeNode

  if (item.nullable === true) {
    features.add('runtime-values')
  }

  if (item.valueType === 'promise' || item.returnType === 'promise') {
    features.add('async-runtime')
  }

  if (item.ownership === 'weak') {
    features.add('runtime-values')
    features.add('objects')
    features.add('weak-references')
  }

  if (item.type === 'FunctionDeclaration' || item.type === 'MethodDefinition') {
    recordCallableSignatureFeatures(item, features)
  }

  if (item.objectRuntimeMethod !== null && typeof item.objectRuntimeMethod !== 'undefined') {
    features.add('collections')
    features.add('objects')
    features.add('runtime-values')
  }

  if (item.type === 'VariableDeclaration' && item.valueType === 'function') {
    features.add('callback-values')
    features.add('runtime-values')
  }

  if (item.type === 'VariableDeclaration' && item.kind !== 'const' && item.valueType === 'string') {
    features.add('runtime-values')
  }

  if (item.type === 'ThrowStatement' || item.type === 'TryStatement') {
    features.add('runtime-values')
  }

  if (item.type === 'ObjectLiteral' || item.type === 'ArrayLiteral') {
    features.add('runtime-values')
  }

  if (item.arrayElementFunctionType !== null && typeof item.arrayElementFunctionType !== 'undefined') {
    features.add('callback-values')
    features.add('runtime-values')
  }

  if (item.type === 'ArrayLiteral' && arrayLiteralHasFunctionElement(item)) {
    features.add('callback-values')
    features.add('runtime-values')
  }

  if (item.type === 'ObjectLiteral') {
    features.add('objects')
  }

  if (item.type === 'ForOfStatement') {
    const shape = item.shape

    if (shape !== null && typeof shape !== 'undefined' && shape.kind === 'object') {
      features.add('objects')
      features.add('runtime-values')
    }
  }

  if (item.type === 'ArrayLiteral') {
    features.add('collections')
  }

  if (item.type === 'NewExpression' && runtimeConstructorName(item)) {
    features.add('runtime-values')

    if (collectionConstructorName(item)) {
      features.add('collections')
    } else if (objectConstructorName(item)) {
      features.add('objects')
    }
  }

  if (item.type === 'CallExpression' || item.type === 'OptionalCallExpression' || item.type === 'NewExpression') {
    recordCallFeatures(item, features)
  }

  if (item.type === 'TemplateLiteral') {
    const raw = item.raw

    if (raw !== null && typeof raw !== 'undefined' && raw.includes('${')) {
      features.add('runtime-values')
      features.add('string-bytes')
    }
  }

  if (item.type === 'IndexExpression' && item.collectionKind === 'map' && item.nullable === true) {
    features.add('collections')
    features.add('runtime-values')
  }

  if (isStringIndexExpression(item)) {
    features.add('runtime-values')
    features.add('string-bytes')
  }

  if (item.type === 'AssignmentExpression') {
    const target = item.target

    if (
      target !== null &&
      typeof target !== 'undefined' &&
      target.type === 'IndexExpression' &&
      target.collectionKind === 'map'
    ) {
      features.add('collections')
      features.add('runtime-values')
    }
  }

  if (item.type === 'AssignmentExpression' && isObjectFieldExpression(item.target)) {
    features.add('objects')
    features.add('runtime-values')
  }

  if (isObjectFieldExpression(item)) {
    features.add('objects')
    features.add('runtime-values')
  }

  if (item.type === 'OptionalCallExpression') {
    features.add('callback-values')
    features.add('runtime-values')
  }

  if (item.type === 'BinaryExpression') {
    if (item.operator === '+' && item.valueType === 'string') {
      features.add('runtime-values')
    }

    const operator = item.operator

    if (
      operator !== null &&
      typeof operator !== 'undefined' &&
      isFeatureEqualityOperator(operator) &&
      (mayBeStringBytesOperand(item.left) || mayBeStringBytesOperand(item.right))
    ) {
      features.add('string-bytes')
    }
  }

  if (item.type === 'MemberExpression' && item.property === 'length' && mayBeStringBytesOperand(item.object)) {
    features.add('string-bytes')
  }
}

function arrayLiteralHasFunctionElement(node: CoreRuntimeNode): boolean {
  const elements = node.elements

  if (elements === null || typeof elements === 'undefined') {
    return false
  }

  for (let index = 0; index < elements.length; index = index + 1) {
    const element = coreRuntimeNodeAt(elements, index)

    if (element.valueType === 'function') {
      return true
    }
  }

  return false
}

function recordCallableSignatureFeatures(node: CoreRuntimeNode, features: CoreRuntimeFeatureSet): void {
  const returnType = node.returnType

  if (
    (returnType !== null && typeof returnType !== 'undefined' && isRuntimeCallableReturnType(returnType)) ||
    node.returnNullable === true
  ) {
    features.add('runtime-values')
  }

  const params = node.params

  if (params === null || typeof params === 'undefined') {
    return
  }

  for (let index = 0; index < params.length; index = index + 1) {
    const param = coreRuntimeNodeAt(params, index)

    if (isRuntimeCallableParamValueType(param.valueType) || isRuntimeFunctionType(param.functionType)) {
      features.add('runtime-values')
    }

    if (
      param.valueType === 'function' &&
      (param.nullable === true ||
        isRuntimeFunctionType(param.functionType) ||
        isSupportedRuntimeCallbackType(param.functionType))
    ) {
      features.add('callback-values')
    }
  }
}

function recordCallFeatures(expression: CoreRuntimeNode, features: CoreRuntimeFeatureSet): void {
  const callee = expression.callee

  if (
    callee !== null &&
    typeof callee !== 'undefined' &&
    callee.valueType === 'function' &&
    isSupportedRuntimeCallbackType(callee.functionType)
  ) {
    features.add('callback-values')
    features.add('runtime-values')
  }

  if (plainFunctionCallHasStringArgument(expression)) {
    features.add('runtime-values')
    features.add('string-bytes')
  }

  if (isArrayFromCall(expression)) {
    features.add('collections')
    features.add('runtime-values')
    features.add('string-bytes')
  }

  if (isArrayIsArrayCall(expression)) {
    features.add('collections')
    features.add('runtime-values')
  }

  if (isCollectionMethodCall(expression) || isArrayMethodCall(expression)) {
    features.add('collections')
    features.add('runtime-values')
  }

  if (isStringConversionCall(expression)) {
    features.add('runtime-values')
    features.add('string-bytes')
  }

  if (isNumberConversionCall(expression)) {
    features.add('runtime-values')
    features.add('string-bytes')
  }

  const stringMethod = stringRuntimeMethodName(expression)

  if (stringMethod !== null && typeof stringMethod !== 'undefined') {
    features.add('runtime-values')
    features.add('string-bytes')

    if (stringMethod === 'split') {
      features.add('collections')
    }
  }
}

function plainFunctionCallHasStringArgument(expression: CoreRuntimeNode): boolean {
  const calleePath = simpleReferencePath(expression.callee)

  if (calleePath === null || typeof calleePath === 'undefined' || calleePath.length !== 1) {
    return false
  }

  if (
    isStringConversionCall(expression) ||
    isNumberConversionCall(expression) ||
    isNumericCastCall(expression) ||
    timerRuntimeCallName(expression)
  ) {
    return false
  }

  const args = expression.args

  if (args === null || typeof args === 'undefined') {
    return false
  }

  for (let index = 0; index < args.length; index = index + 1) {
    const arg = coreRuntimeNodeAt(args, index)

    if (arg.valueType === 'string') {
      return true
    }
  }

  return false
}

function runtimeConstructorName(expression: CoreRuntimeNode): string | null {
  const collectionConstructor = collectionConstructorName(expression)

  if (collectionConstructor !== null && typeof collectionConstructor !== 'undefined') {
    return collectionConstructor
  }

  return objectConstructorName(expression)
}

function collectionConstructorName(expression: CoreRuntimeNode): string | null {
  if (expression.valueType === 'map') {
    return 'Map'
  }

  if (expression.valueType === 'set') {
    return 'Set'
  }

  return null
}

function objectConstructorName(expression: CoreRuntimeNode): string | null {
  const calleePath = simpleReferencePath(expression.callee)

  if (calleePath === null || typeof calleePath === 'undefined') {
    return null
  }

  if (calleePath[0] === 'Error') {
    return calleePath[0]
  }

  return null
}

function isObjectFieldExpression(expression: CoreRuntimeNode | null | undefined): boolean {
  if (expression === null || typeof expression === 'undefined') {
    return false
  }

  if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
    const object = expression.object

    if (object === null || typeof object === 'undefined') {
      return false
    }

    const shape = object.shape

    return shape !== null && typeof shape !== 'undefined' && shape.kind === 'object'
  }

  if (expression.type !== 'IndexExpression' && expression.type !== 'OptionalIndexExpression') {
    return false
  }

  const object = expression.object

  if (object === null || typeof object === 'undefined') {
    return false
  }

  const shape = object.shape

  return (
    shape !== null && typeof shape !== 'undefined' && shape.kind === 'object' && expression.collectionKind !== 'map'
  )
}

function isStringIndexExpression(expression: CoreRuntimeNode | null | undefined): boolean {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'IndexExpression') {
    return false
  }

  const object = expression.object
  const index = expression.index

  return (
    object !== null &&
    typeof object !== 'undefined' &&
    index !== null &&
    typeof index !== 'undefined' &&
    object.valueType === 'string' &&
    index.valueType === 'number'
  )
}

function isCollectionMethodCall(expression: CoreRuntimeNode): boolean {
  const callee = expression.callee

  if (callee === null || typeof callee === 'undefined' || callee.type !== 'MemberExpression') {
    return false
  }

  const object = callee.object

  if (object === null || typeof object === 'undefined') {
    return false
  }

  return object.valueType === 'map' || object.valueType === 'set'
}

function isArrayMethodCall(expression: CoreRuntimeNode): boolean {
  const callee = expression.callee

  if (callee === null || typeof callee === 'undefined' || callee.type !== 'MemberExpression') {
    return false
  }

  const object = callee.object

  if (object === null || typeof object === 'undefined' || object.valueType !== 'array') {
    return false
  }

  return true
}

function isArrayFromCall(expression: CoreRuntimeNode): boolean {
  const path = memberExpressionPath(expression.callee)

  return (
    path !== null &&
    typeof path !== 'undefined' &&
    path.length === 2 &&
    path[0] === 'Array' &&
    path[1] === 'from'
  )
}

function isArrayIsArrayCall(expression: CoreRuntimeNode): boolean {
  const path = memberExpressionPath(expression.callee)

  return (
    path !== null &&
    typeof path !== 'undefined' &&
    path.length === 2 &&
    path[0] === 'Array' &&
    path[1] === 'isArray'
  )
}

function isStringConversionCall(expression: CoreRuntimeNode): boolean {
  const calleePath = simpleReferencePath(expression.callee)

  return calleePath !== null && typeof calleePath !== 'undefined' && calleePath[0] === 'String'
}

function isNumberConversionCall(expression: CoreRuntimeNode): boolean {
  const calleePath = simpleReferencePath(expression.callee)

  return calleePath !== null && typeof calleePath !== 'undefined' && calleePath[0] === 'Number'
}

function isNumericCastCall(expression: CoreRuntimeNode): boolean {
  return expression.numericCast !== null && typeof expression.numericCast !== 'undefined'
}

function stringRuntimeMethodName(expression: CoreRuntimeNode): string | null {
  if (expression.stringRuntimeMethod !== null && typeof expression.stringRuntimeMethod !== 'undefined') {
    return expression.stringRuntimeMethod
  }

  return null
}

function timerRuntimeCallName(expression: CoreRuntimeNode): string | null {
  if (
    expression.type === 'CallExpression' &&
    expression.timerRuntimeMethod !== null &&
    typeof expression.timerRuntimeMethod !== 'undefined'
  ) {
    return expression.timerRuntimeMethod
  }

  return null
}

function mayBeStringBytesOperand(expression: CoreRuntimeNode | null | undefined): boolean {
  if (expression === null || typeof expression === 'undefined') {
    return false
  }

  if (expression.valueType === 'string') {
    return true
  }

  return isPossibleStringBytesNodeType(expression.type)
}

function isRuntimeFunctionType(functionType: CoreRuntimeFunctionType | null | undefined): boolean {
  if (functionType === null || typeof functionType === 'undefined' || functionType.returnType !== 'void') {
    return false
  }

  let hasRuntimeParam = false
  const params = functionType.params

  if (params === null || typeof params === 'undefined') {
    return false
  }

  for (let index = 0; index < params.length; index = index + 1) {
    const param = coreRuntimeNodeAt(params, index)

    if (!isSupportedRuntimeFunctionParamValueType(param.valueType)) {
      return false
    }

    if (param.valueType === 'string' || param.valueType === 'object') {
      hasRuntimeParam = true
    }
  }

  return hasRuntimeParam
}

function isSupportedRuntimeCallbackType(functionType: CoreRuntimeFunctionType | null | undefined): boolean {
  if (functionType === null || typeof functionType === 'undefined') {
    return false
  }

  if (!isSupportedRuntimeCallbackReturnType(functionType.returnType)) {
    return false
  }

  const params = functionType.params

  if (params === null || typeof params === 'undefined') {
    return true
  }

  for (let index = 0; index < params.length; index = index + 1) {
    const param = coreRuntimeNodeAt(params, index)

    if (!isSupportedRuntimeFunctionParamValueType(param.valueType)) {
      return false
    }
  }

  return true
}

function isSupportedRuntimeCallbackReturnType(returnType: string | null | undefined): boolean {
  if (returnType === null || typeof returnType === 'undefined') {
    return false
  }

  return (
    returnType === 'void' ||
    returnType === 'number' ||
    returnType === 'boolean' ||
    returnType === 'string' ||
    returnType === 'bytes' ||
    returnType === 'object' ||
    returnType === 'array' ||
    returnType === 'map' ||
    returnType === 'set'
  )
}

function isFeatureEqualityOperator(operator: string): boolean {
  return operator === '===' || operator === '!=='
}

function isRuntimeCallableReturnType(valueType: string): boolean {
  return valueType === 'bytes' || valueType === 'string'
}

function isRuntimeCallableParamValueType(valueType: string | null | undefined): boolean {
  return valueType === 'bytes' || valueType === 'string' || valueType === 'object'
}

function isPossibleStringBytesNodeType(nodeType: string | null | undefined): boolean {
  if (nodeType === null || typeof nodeType === 'undefined') {
    return false
  }

  return (
    nodeType === 'StringLiteral' ||
    nodeType === 'TemplateLiteral' ||
    nodeType === 'Reference' ||
    nodeType === 'MemberExpression' ||
    nodeType === 'IndexExpression' ||
    nodeType === 'CallExpression' ||
    nodeType === 'BinaryExpression'
  )
}

function isSupportedRuntimeFunctionParamValueType(valueType: string | null | undefined): boolean {
  return valueType === 'number' || valueType === 'boolean' || valueType === 'string' || valueType === 'object'
}

function simpleReferencePath(expression: CoreRuntimeNode | null | undefined): string[] | null {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'Reference') {
    return null
  }

  const path = expression.path

  if (path === null || typeof path === 'undefined' || path.length !== 1) {
    return null
  }

  return path
}

function coreRuntimeNodeAt(nodes: CoreRuntimeRawNode[], index: number): CoreRuntimeRawNode {
  return nodes[index]
}
