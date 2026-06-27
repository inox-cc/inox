import {
  collectCompilerFeatureIrFeatures,
  compilerFeatureRuntimeRequirements
} from '../features/index.ts'
import { memberExpressionPath } from '../member-paths.ts'
import { binaryConstructorNameFromPath } from '../stdlib/descriptors/binary.ts'
import {
  arrayRuntimeMethodName,
  collectionConstructorNameFromPath,
  stringRuntimeMethodName as collectionStringRuntimeMethodName,
  isMapMethod,
  isSetMethod
} from '../stdlib/descriptors/collections.ts'
import { timerRuntimeMethodNameFromPath } from '../stdlib/descriptors/timers.ts'
import type { AnyNode, IrFeature, IrRuntimeRequirement, IrSyntaxFeatureUsage, ProgramNode } from '../types.ts'

type FeatureRawNode = AnyNode

type FeatureShape = AnyNode & {
  kind?: string
}

type FeatureFunctionType = AnyNode & {
  params?: FeatureRawNode[]
  returnType?: string | null
}

type FeatureChildNode = AnyNode & {
  arrayElementFunctionType?: FeatureFunctionType | null
  collectionKind?: string | null
  elements?: FeatureRawNode[]
  path?: string[]
  property?: string | null
  shape?: FeatureShape | null
  type?: string
  valueType?: string | null
}

type FeatureNode = AnyNode & {
  args?: FeatureChildNode[]
  arrayElementFunctionType?: FeatureFunctionType | null
  binaryRuntimeMethod?: string | null
  callee?: FeatureChildNode | null
  childProcessRuntimeMethod?: string | null
  collectionKind?: string | null
  cryptoRuntimeMethod?: string | null
  debugRuntimeMethod?: string | null
  elements?: FeatureRawNode[]
  fsRuntimeMethod?: string | null
  fsRuntimeConstant?: string | null
  functionType?: FeatureFunctionType | null
  left?: FeatureChildNode | null
  nullable?: boolean
  object?: FeatureChildNode | null
  operator?: string | null
  osRuntimeConstant?: string | null
  osRuntimeMethod?: string | null
  objectRuntimeMethod?: string | null
  ownership?: string | null
  params?: FeatureRawNode[]
  path?: string[]
  pathRuntimeConstant?: string | null
  pathRuntimeMethod?: string | null
  processRuntimeEnvName?: string | null
  processRuntimeMethod?: string | null
  processRuntimeProperty?: string | null
  property?: string | null
  raw?: string | null
  returnNullable?: boolean
  returnType?: string | null
  right?: FeatureChildNode | null
  shape?: FeatureShape | null
  target?: FeatureChildNode | null
  timerRuntimeMethod?: string | null
  type?: string
  urlRuntimeMethod?: string | null
  valueType?: string | null
}

type ChildNode = FeatureNode
type FeatureProgram = {
  features: IrFeature[]
}
type IrFeatureSet = Set<IrFeature>
type RuntimeRequirementProgram = {
  runtimeRequirements: IrRuntimeRequirement[]
}
type IrRuntimeRequirementSet = Set<IrRuntimeRequirement>
type SyntaxFeatureProgram = {
  syntaxFeatures: IrSyntaxFeatureUsage[]
}

export function collectIrFeatures(program: ProgramNode): IrFeature[] {
  const features = createFeatureSet()

  visitNode(program, features)

  const result = sortedIrFeatures(features)

  return result
}

function featureProgramAt(programs: FeatureProgram[], index: number): FeatureProgram {
  return programs[index]
}

function irFeatureAt(features: IrFeature[], index: number): IrFeature {
  return features[index]
}

function runtimeRequirementProgramAt(programs: RuntimeRequirementProgram[], index: number): RuntimeRequirementProgram {
  return programs[index]
}

function runtimeRequirementAt(requirements: IrRuntimeRequirement[], index: number): IrRuntimeRequirement {
  return requirements[index]
}

function syntaxFeatureProgramAt(programs: SyntaxFeatureProgram[], index: number): SyntaxFeatureProgram {
  return programs[index]
}

function syntaxFeatureUsageAt(usages: IrSyntaxFeatureUsage[], index: number): IrSyntaxFeatureUsage {
  return usages[index]
}

function featureNodeAt(nodes: FeatureRawNode[], index: number): FeatureRawNode {
  return nodes[index]
}

function featureArrayNodeAt(nodes: FeatureRawNode[], index: number): FeatureRawNode {
  return nodes[index]
}

function featureChildNodeAt(nodes: FeatureChildNode[], index: number): FeatureChildNode {
  return nodes[index]
}

function featureNodeArgsOrEmpty(node: FeatureNode): FeatureChildNode[] {
  const args = node.args

  if (args !== null && typeof args !== 'undefined') {
    return args
  }

  return []
}

function featureNodeElementsOrEmpty(node: FeatureChildNode): FeatureRawNode[] {
  const elements = node.elements

  if (elements !== null && typeof elements !== 'undefined') {
    return elements
  }

  return []
}

function arrayLiteralHasFunctionElement(node: FeatureNode): boolean {
  const elements = node.elements

  if (elements === null || typeof elements === 'undefined') {
    return false
  }

  for (let index = 0; index < elements.length; index = index + 1) {
    const element = featureNodeAt(elements, index)

    if (element.valueType === 'function') {
      return true
    }
  }

  return false
}

export function collectIrFeatureRequirements(programs: FeatureProgram[]): IrFeature[] {
  const features = createFeatureSet()

  for (let programIndex = 0; programIndex < programs.length; programIndex = programIndex + 1) {
    const program = featureProgramAt(programs, programIndex)

    for (let featureIndex = 0; featureIndex < program.features.length; featureIndex = featureIndex + 1) {
      const feature = irFeatureAt(program.features, featureIndex)

      features.add(feature)
    }
  }

  const result = sortedIrFeatures(features)

  return result
}

export function collectRuntimeRequirements(features: IrFeature[]): IrRuntimeRequirement[] {
  const requirements = createRuntimeRequirementSet()

  for (let index = 0; index < features.length; index = index + 1) {
    const feature = irFeatureAt(features, index)
    const featureRequirements = compilerFeatureRuntimeRequirements(feature)

    if (featureRequirements !== null && typeof featureRequirements !== 'undefined') {
      addRuntimeRequirements(requirements, featureRequirements)
      continue
    }

    if (feature === 'runtime-values') {
      requirements.add('managed-values')
    } else if (feature === 'collections') {
      requirements.add('collections')
      requirements.add('managed-values')
    } else if (feature === 'objects') {
      requirements.add('managed-values')
      requirements.add('objects')
    } else {
      const requirement = runtimeRequirementFeature(feature)

      if (requirement !== null && typeof requirement !== 'undefined') {
        requirements.add(requirement)
      }
    }
  }

  const result = sortedRuntimeRequirements(requirements)

  return result
}

export function collectIrRuntimeRequirements(programs: RuntimeRequirementProgram[]): IrRuntimeRequirement[] {
  const requirements = createRuntimeRequirementSet()

  for (let programIndex = 0; programIndex < programs.length; programIndex = programIndex + 1) {
    const program = runtimeRequirementProgramAt(programs, programIndex)

    for (
      let requirementIndex = 0;
      requirementIndex < program.runtimeRequirements.length;
      requirementIndex = requirementIndex + 1
    ) {
      const requirement = runtimeRequirementAt(program.runtimeRequirements, requirementIndex)

      requirements.add(requirement)
    }
  }

  const result = sortedRuntimeRequirements(requirements)

  return result
}

export function collectSyntaxFeatureUsages(program: ProgramNode): IrSyntaxFeatureUsage[] {
  const usages: IrSyntaxFeatureUsage[] = []

  visitSyntaxFeatureUsage(program, usages)

  return usages
}

export function collectIrSyntaxFeatureUsages(programs: SyntaxFeatureProgram[]): IrSyntaxFeatureUsage[] {
  const usages: IrSyntaxFeatureUsage[] = []

  for (let programIndex = 0; programIndex < programs.length; programIndex = programIndex + 1) {
    const program = syntaxFeatureProgramAt(programs, programIndex)

    for (let usageIndex = 0; usageIndex < program.syntaxFeatures.length; usageIndex = usageIndex + 1) {
      const usage = syntaxFeatureUsageAt(program.syntaxFeatures, usageIndex)

      usages.push(usage)
    }
  }

  return usages
}

function sortedIrFeatures(features: IrFeatureSet): IrFeature[] {
  const result: IrFeature[] = []

  pushIrFeatureIfPresent(features, result, 'array-pop-null')
  pushIrFeatureIfPresent(features, result, 'async-runtime')
  pushIrFeatureIfPresent(features, result, 'binary')
  pushIrFeatureIfPresent(features, result, 'callback-values')
  pushIrFeatureIfPresent(features, result, 'child-process')
  pushIrFeatureIfPresent(features, result, 'clocks')
  pushIrFeatureIfPresent(features, result, 'collections')
  pushIrFeatureIfPresent(features, result, 'crypto')
  pushIrFeatureIfPresent(features, result, 'debug-memory')
  pushIrFeatureIfPresent(features, result, 'fs')
  pushIrFeatureIfPresent(features, result, 'json')
  pushIrFeatureIfPresent(features, result, 'map-get-null')
  pushIrFeatureIfPresent(features, result, 'map-index-set')
  pushIrFeatureIfPresent(features, result, 'number-from-string-null')
  pushIrFeatureIfPresent(features, result, 'numeric-casts')
  pushIrFeatureIfPresent(features, result, 'objects')
  pushIrFeatureIfPresent(features, result, 'os')
  pushIrFeatureIfPresent(features, result, 'path')
  pushIrFeatureIfPresent(features, result, 'process')
  pushIrFeatureIfPresent(features, result, 'regexp')
  pushIrFeatureIfPresent(features, result, 'runtime-values')
  pushIrFeatureIfPresent(features, result, 'string-bytes')
  pushIrFeatureIfPresent(features, result, 'timers')
  pushIrFeatureIfPresent(features, result, 'url')
  pushIrFeatureIfPresent(features, result, 'weak-references')

  return result
}

function sortedRuntimeRequirements(requirements: IrRuntimeRequirementSet): IrRuntimeRequirement[] {
  const result: IrRuntimeRequirement[] = []

  pushRuntimeRequirementIfPresent(requirements, result, 'async-runtime')
  pushRuntimeRequirementIfPresent(requirements, result, 'binary')
  pushRuntimeRequirementIfPresent(requirements, result, 'callback-values')
  pushRuntimeRequirementIfPresent(requirements, result, 'child-process')
  pushRuntimeRequirementIfPresent(requirements, result, 'clocks')
  pushRuntimeRequirementIfPresent(requirements, result, 'collections')
  pushRuntimeRequirementIfPresent(requirements, result, 'crypto')
  pushRuntimeRequirementIfPresent(requirements, result, 'debug-memory')
  pushRuntimeRequirementIfPresent(requirements, result, 'fs')
  pushRuntimeRequirementIfPresent(requirements, result, 'json')
  pushRuntimeRequirementIfPresent(requirements, result, 'managed-values')
  pushRuntimeRequirementIfPresent(requirements, result, 'objects')
  pushRuntimeRequirementIfPresent(requirements, result, 'os')
  pushRuntimeRequirementIfPresent(requirements, result, 'path')
  pushRuntimeRequirementIfPresent(requirements, result, 'process')
  pushRuntimeRequirementIfPresent(requirements, result, 'string-bytes')
  pushRuntimeRequirementIfPresent(requirements, result, 'timers')
  pushRuntimeRequirementIfPresent(requirements, result, 'url')
  pushRuntimeRequirementIfPresent(requirements, result, 'weak-references')

  return result
}

function pushIrFeatureIfPresent(features: IrFeatureSet, result: IrFeature[], feature: IrFeature): void {
  if (features.has(feature)) {
    result.push(feature)
  }
}

function pushRuntimeRequirementIfPresent(
  requirements: IrRuntimeRequirementSet,
  result: IrRuntimeRequirement[],
  requirement: IrRuntimeRequirement
): void {
  if (requirements.has(requirement)) {
    result.push(requirement)
  }
}

function createFeatureSet(): IrFeatureSet {
  return new Set()
}

function createRuntimeRequirementSet(): IrRuntimeRequirementSet {
  return new Set()
}

function visitSyntaxFeatureUsage(node: FeatureRawNode | FeatureRawNode[] | null, usages: IrSyntaxFeatureUsage[]): void {
  if (node !== null && typeof node !== 'undefined') {
    if (Array.isArray(node)) {
      for (let index = 0; index < node.length; index = index + 1) {
        const item = featureArrayNodeAt(node, index)

        visitSyntaxFeatureUsage(item, usages)
      }
      return
    }

    const item: FeatureNode = node

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
}

function visitNode(node: FeatureRawNode | FeatureRawNode[] | null, features: IrFeatureSet): void {
  if (node !== null && typeof node !== 'undefined') {
    if (Array.isArray(node)) {
      for (let index = 0; index < node.length; index = index + 1) {
        const item = featureArrayNodeAt(node, index)

        visitNode(item, features)
      }
      return
    }

    const item = node

    recordNodeFeatures(item, features)

    if (isBinaryArrayLiteralConstructor(item)) {
      visitNode(item.callee, features)

      const args = featureNodeArgsOrEmpty(item)
      const firstArg = featureChildNodeAt(args, 0)
      const elements = featureNodeElementsOrEmpty(firstArg)

      for (let elementIndex = 0; elementIndex < elements.length; elementIndex = elementIndex + 1) {
        const element = featureNodeAt(elements, elementIndex)

        visitNode(element, features)
      }

      for (let argIndex = 1; argIndex < args.length; argIndex = argIndex + 1) {
        const arg = featureChildNodeAt(args, argIndex)

        visitNode(arg, features)
      }

      return
    }

    visitFeatureChildren(item, features)
  }
}

function visitSyntaxFeatureChild(value: any, usages: IrSyntaxFeatureUsage[]): void {
  if (value === null || typeof value === 'undefined' || typeof value !== 'object') {
    return
  }

  visitSyntaxFeatureUsage(value, usages)
}

function visitSyntaxFeatureChildren(item: ChildNode, usages: IrSyntaxFeatureUsage[]): void {
  visitSyntaxFeatureChild(item.body, usages)
  visitSyntaxFeatureChild(item.params, usages)
  visitSyntaxFeatureChild(item.fields, usages)
  visitSyntaxFeatureChild(item.methods, usages)
  visitSyntaxFeatureChild(item.init, usages)
  visitSyntaxFeatureChild(item.condition, usages)
  visitSyntaxFeatureChild(item.consequent, usages)
  visitSyntaxFeatureChild(item.alternate, usages)
  visitSyntaxFeatureChild(item.test, usages)
  visitSyntaxFeatureChild(item.update, usages)
  visitSyntaxFeatureChild(item.iterable, usages)
  visitSyntaxFeatureChild(item.discriminant, usages)
  visitSyntaxFeatureChild(item.cases, usages)
  visitSyntaxFeatureChild(item.block, usages)
  visitSyntaxFeatureChild(item.handler, usages)
  visitSyntaxFeatureChild(item.finalizer, usages)
  visitSyntaxFeatureChild(item.argument, usages)
  visitSyntaxFeatureChild(item.args, usages)
  visitSyntaxFeatureChild(item.callee, usages)
  visitSyntaxFeatureChild(item.object, usages)
  visitSyntaxFeatureChild(item.index, usages)
  visitSyntaxFeatureChild(item.target, usages)
  visitSyntaxFeatureChild(item.value, usages)
  visitSyntaxFeatureChild(item.valueType, usages)
  visitSyntaxFeatureChild(item.functionType, usages)
  visitSyntaxFeatureChild(item.returnShape, usages)
  visitSyntaxFeatureChild(item.left, usages)
  visitSyntaxFeatureChild(item.right, usages)
  visitSyntaxFeatureChild(item.elements, usages)
  visitSyntaxFeatureChild(item.properties, usages)
  visitSyntaxFeatureChild(item.expression, usages)
}

function visitFeatureChild(value: any, features: IrFeatureSet): void {
  if (value === null || typeof value === 'undefined' || typeof value !== 'object') {
    return
  }

  visitNode(value, features)
}

function visitFeatureChildren(item: ChildNode, features: IrFeatureSet): void {
  visitFeatureChild(item.body, features)
  visitFeatureChild(item.params, features)
  visitFeatureChild(item.fields, features)
  visitFeatureChild(item.methods, features)
  visitFeatureChild(item.init, features)
  visitFeatureChild(item.condition, features)
  visitFeatureChild(item.consequent, features)
  visitFeatureChild(item.alternate, features)
  visitFeatureChild(item.test, features)
  visitFeatureChild(item.update, features)
  visitFeatureChild(item.iterable, features)
  visitFeatureChild(item.discriminant, features)
  visitFeatureChild(item.cases, features)
  visitFeatureChild(item.block, features)
  visitFeatureChild(item.handler, features)
  visitFeatureChild(item.finalizer, features)
  visitFeatureChild(item.argument, features)
  visitFeatureChild(item.args, features)
  visitFeatureChild(item.callee, features)
  visitFeatureChild(item.object, features)
  visitFeatureChild(item.index, features)
  visitFeatureChild(item.target, features)
  visitFeatureChild(item.value, features)
  visitFeatureChild(item.valueType, features)
  visitFeatureChild(item.functionType, features)
  visitFeatureChild(item.returnShape, features)
  visitFeatureChild(item.left, features)
  visitFeatureChild(item.right, features)
  visitFeatureChild(item.elements, features)
  visitFeatureChild(item.properties, features)
  visitFeatureChild(item.expression, features)
}

function recordNodeFeatures(node: FeatureNode, features: IrFeatureSet): void {
  collectCompilerFeatureIrFeatures(node, features)

  if (node.nullable === true) {
    features.add('runtime-values')
  }

  if (node.valueType === 'promise' || node.returnType === 'promise') {
    features.add('async-runtime')
  }

  if (node.type === 'FunctionDeclaration' || node.type === 'MethodDefinition') {
    recordCallableSignatureFeatures(node, features)
  }

  if (node.objectRuntimeMethod !== null && typeof node.objectRuntimeMethod !== 'undefined') {
    features.add('collections')
    features.add('objects')
    features.add('runtime-values')
  }

  if (
    node.type === 'VariableDeclaration' &&
    node.valueType === 'function'
  ) {
    features.add('callback-values')
    features.add('runtime-values')
  }

  if (node.type === 'VariableDeclaration' && node.kind !== 'const' && node.valueType === 'string') {
    features.add('runtime-values')
  }

  if (node.type === 'ThrowStatement' || node.type === 'TryStatement') {
    features.add('runtime-values')
  }

  if (node.type === 'ObjectLiteral' || node.type === 'ArrayLiteral') {
    features.add('runtime-values')
  }

  if (node.arrayElementFunctionType !== null && typeof node.arrayElementFunctionType !== 'undefined') {
    features.add('callback-values')
    features.add('runtime-values')
  }

  if (node.type === 'ArrayLiteral' && arrayLiteralHasFunctionElement(node)) {
    features.add('callback-values')
    features.add('runtime-values')
  }

  if (node.type === 'ObjectLiteral') {
    features.add('objects')
  }

  if (node.type === 'ForOfStatement') {
    const shape = node.shape

    if (shape !== null && typeof shape !== 'undefined' && shape.kind === 'object') {
      features.add('objects')
      features.add('runtime-values')
    }
  }

  if (node.type === 'ArrayLiteral') {
    features.add('collections')
  }

  if (node.type === 'NewExpression' && runtimeConstructorName(node)) {
    features.add('runtime-values')

    if (collectionConstructorName(node)) {
      features.add('collections')
    } else if (objectConstructorName(node)) {
      features.add('objects')
    }
  }

  if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression' || node.type === 'NewExpression') {
    recordCallFeatures(node, features)
  }

  if (node.type === 'TemplateLiteral') {
    const raw = node.raw

    if (raw !== null && typeof raw !== 'undefined' && raw.includes('${')) {
      features.add('runtime-values')
      features.add('string-bytes')
    }
  }

  if (node.type === 'IndexExpression' && node.collectionKind === 'map' && node.nullable === true) {
    features.add('collections')
    features.add('runtime-values')
  }

  if (isStringIndexExpression(node)) {
    features.add('runtime-values')
    features.add('string-bytes')
  }

  if (node.type === 'AssignmentExpression') {
    const target = node.target

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

    const operator = node.operator

    if (
      operator !== null &&
      typeof operator !== 'undefined' &&
      isFeatureEqualityOperator(operator) &&
      (mayBeStringBytesOperand(node.left) || mayBeStringBytesOperand(node.right))
    ) {
      features.add('string-bytes')
    }
  }

  if (node.type === 'MemberExpression' && node.property === 'length' && mayBeStringBytesOperand(node.object)) {
    features.add('string-bytes')
  }
}

function recordCallableSignatureFeatures(node: FeatureNode, features: IrFeatureSet): void {
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
    const param = featureNodeAt(params, index)

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

function recordCallFeatures(expression: FeatureNode, features: IrFeatureSet): void {
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

  const arrayMethod = arrayMethodCallName(expression)

  const collectionMethod = collectionMethodCallName(expression)

  if (
    (collectionMethod !== null && typeof collectionMethod !== 'undefined') ||
    (arrayMethod !== null && typeof arrayMethod !== 'undefined')
  ) {
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

function addRuntimeRequirements(requirements: IrRuntimeRequirementSet, values: IrRuntimeRequirement[]): void {
  for (let index = 0; index < values.length; index = index + 1) {
    requirements.add(values[index])
  }
}

function runtimeRequirementFeature(feature: IrFeature): IrRuntimeRequirement | null {
  if (feature === 'async-runtime') {
    return 'async-runtime'
  }

  if (feature === 'callback-values') {
    return 'callback-values'
  }

  if (feature === 'collections') {
    return 'collections'
  }

  if (feature === 'objects') {
    return 'objects'
  }

  if (feature === 'string-bytes') {
    return 'string-bytes'
  }

  return null
}

function nullableString(value: string | null | undefined): string | null {
  if (value === null || typeof value === 'undefined') {
    return null
  }

  return value
}

function plainFunctionCallHasStringArgument(expression: FeatureNode): boolean {
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
    const arg = featureNodeAt(args, index)

    if (arg.valueType === 'string') {
      return true
    }
  }

  return false
}

function runtimeConstructorName(expression: FeatureNode): string | null {
  const calleePath = simpleReferencePath(expression.callee)

  if (calleePath === null || typeof calleePath === 'undefined') {
    return null
  }

  if (calleePath.length === 1) {
    const root = calleePath[0]

    if (root === 'Error') {
      return 'Error'
    }

    if (root === 'Map') {
      return 'Map'
    }

    if (root === 'Set') {
      return 'Set'
    }
  }

  return binaryConstructorNameFromPath(calleePath)
}

function collectionConstructorName(expression: FeatureNode): string | null {
  const calleePath = simpleReferencePath(expression.callee)

  if (calleePath === null || typeof calleePath === 'undefined') {
    return null
  }

  return collectionConstructorNameFromPath(calleePath)
}

function objectConstructorName(expression: FeatureNode): string | null {
  const calleePath = simpleReferencePath(expression.callee)

  if (calleePath === null || typeof calleePath === 'undefined') {
    return null
  }

  if (calleePath[0] === 'Error') {
    return calleePath[0]
  }

  return null
}

function binaryConstructorName(expression: FeatureNode): string | null {
  const calleePath = simpleReferencePath(expression.callee)

  if (calleePath === null || typeof calleePath === 'undefined') {
    return null
  }

  return binaryConstructorNameFromPath(calleePath)
}

function isBinaryArrayLiteralConstructor(expression: FeatureNode): boolean {
  const args = expression.args

  if (!binaryConstructorName(expression) || args === null || typeof args === 'undefined') {
    return false
  }

  if (args.length === 0) {
    return false
  }

  const first = args[0]

  return first.type === 'ArrayLiteral'
}

function isObjectFieldExpression(expression: FeatureNode | null | undefined): boolean {
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

function isStringIndexExpression(expression: FeatureNode | null | undefined): boolean {
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

function collectionMethodCallName(expression: FeatureNode): string | null {
  const callee = expression.callee

  if (callee === null || typeof callee === 'undefined' || callee.type !== 'MemberExpression') {
    return null
  }

  const property = callee.property

  if (property !== null && typeof property !== 'undefined' && (isMapMethod(property) || isSetMethod(property))) {
    return property
  }

  return null
}

function arrayMethodCallName(expression: FeatureNode): string | null {
  const callee = expression.callee

  if (callee === null || typeof callee === 'undefined' || callee.type !== 'MemberExpression') {
    return null
  }

  const property = callee.property

  if (property === null || typeof property === 'undefined') {
    return null
  }

  const method = arrayRuntimeMethodName(property)

  if (method === null || typeof method === 'undefined') {
    return null
  }

  const object = callee.object

  if (object === null || typeof object === 'undefined' || object.valueType !== 'array') {
    return null
  }

  return method
}

function isArrayFromCall(expression: FeatureNode): boolean {
  const path = memberExpressionPath(expression.callee)

  return (
    path !== null &&
    typeof path !== 'undefined' &&
    path.length === 2 &&
    path[0] === 'Array' &&
    path[1] === 'from'
  )
}

function isStringConversionCall(expression: FeatureNode): boolean {
  const calleePath = simpleReferencePath(expression.callee)

  return calleePath !== null && typeof calleePath !== 'undefined' && calleePath[0] === 'String'
}

function isNumberConversionCall(expression: FeatureNode): boolean {
  const calleePath = simpleReferencePath(expression.callee)

  return calleePath !== null && typeof calleePath !== 'undefined' && calleePath[0] === 'Number'
}

function isNumericCastCall(expression: FeatureNode): boolean {
  const calleePath = simpleReferencePath(expression.callee)

  return calleePath !== null && typeof calleePath !== 'undefined' && isNumericCastName(calleePath[0])
}

function stringRuntimeMethodName(expression: FeatureNode): string | null {
  const callee = expression.callee

  if (callee === null || typeof callee === 'undefined' || callee.type !== 'MemberExpression') {
    return null
  }

  const property = callee.property

  if (property === null || typeof property === 'undefined') {
    return null
  }

  return collectionStringRuntimeMethodName(property)
}

function timerRuntimeCallName(expression: FeatureNode): string | null {
  if (
    expression.type === 'CallExpression' &&
    expression.timerRuntimeMethod !== null &&
    typeof expression.timerRuntimeMethod !== 'undefined'
  ) {
    return expression.timerRuntimeMethod
  }

  const callee = expression.callee

  const calleePath = simpleReferencePath(callee)

  if (calleePath === null || typeof calleePath === 'undefined') {
    return null
  }

  return timerRuntimeMethodNameFromPath(calleePath)
}

function mayBeStringBytesOperand(expression: FeatureNode | null | undefined): boolean {
  if (expression === null || typeof expression === 'undefined') {
    return false
  }

  if (expression.valueType === 'string') {
    return true
  }

  return isPossibleStringBytesNodeType(expression.type)
}

function isRuntimeFunctionType(functionType: FeatureFunctionType | null | undefined): boolean {
  if (functionType === null || typeof functionType === 'undefined' || functionType.returnType !== 'void') {
    return false
  }

  let hasRuntimeParam = false

  const params = functionType.params

  if (params === null || typeof params === 'undefined') {
    return false
  }

  for (let index = 0; index < params.length; index = index + 1) {
    const param = featureNodeAt(params, index)

    if (!isSupportedRuntimeFunctionParamValueType(param.valueType)) {
      return false
    }

    if (param.valueType === 'string' || param.valueType === 'object') {
      hasRuntimeParam = true
    }
  }

  return hasRuntimeParam
}

function isSupportedRuntimeCallbackType(functionType: FeatureFunctionType | null | undefined): boolean {
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
    const param = featureNodeAt(params, index)

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

function isNumericCastName(name: string | undefined): boolean {
  return name === 'i32' || name === 'u32' || name === 'u64' || name === 'f32' || name === 'f64'
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

function simpleReferencePath(expression: FeatureNode | null | undefined): string[] | null {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'Reference') {
    return null
  }

  const path = expression.path

  if (path === null || typeof path === 'undefined' || path.length !== 1) {
    return null
  }

  return path
}
