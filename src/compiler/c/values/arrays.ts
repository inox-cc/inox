import {
  cloneCArrayShapeMap,
  cloneCFunctionReturnMapTypeMap,
  cloneCFunctionTypeMap,
  cloneCObjectShapeFieldMap,
  cloneCPromiseConstructorHandlerMap,
  cloneCStringMap,
  cloneCStringSet,
  emitPrepareOwnedValueWrite,
  emitRuntimeTypeCheck,
  emitStatusCheck,
  nextCName,
  registerOwnedValue
} from '../context.ts'
import { arrayRuntimeMethodName } from '../../stdlib/descriptors/collections.ts'
import { emitCConditionClause } from './expressions.ts'
import { emitRuntimeFieldValueCheck } from '../runtime-values.ts'
import { cRuntimeValueTag } from '../value-types.ts'
import { emitSliceIndexNormalizationLines } from './slices.ts'
import type { AnyNode, Diagnostic } from '../../types.ts'
import type {
  CArrayElementInfo,
  CFunctionReturnMapType,
  CFunctionType,
  CKnownArrayElement,
  CObjectFieldInfo,
  CObjectShapeField,
  CPreparedCallOptions as PreparedCallOptions,
  CPreparedExpression as PreparedExpression,
  CPromiseConstructorHandler,
  CRuntimeArrayElement
} from '../types.ts'

type CFunctionReturnMapTypeMap = Map<string, CFunctionReturnMapType>
type CFunctionTypeMap = Map<string, CFunctionType>
type CObjectShapeFieldMap = Map<string, CObjectShapeField[]>
type CPromiseConstructorHandlerMap = Map<string, CPromiseConstructorHandler>
type CStringMap = Map<string, string>
type CStringNullableMap = Map<string, string | null>
type CStringSet = Set<string>

type ArrayFunctionContext = {
  arrayLoweringDependencies?: ArrayLoweringDependencies
  arrayShapes?: Map<string, CArrayElementInfo[]>
  boxedVariables: CStringSet
  classInstanceTypes?: CStringMap
  cleanupEnabled: boolean
  diagnostics: Diagnostic[]
  errorObjectNames?: CStringSet
  failureStatement?: string | null
  failureStatementUsed?: boolean
  functionReturnArrayElementTypes?: CStringNullableMap
  functionTypes: CFunctionTypeMap
  mapTypes: CFunctionReturnMapTypeMap
  narrowedNullableScalars: CStringSet
  nextId: number
  nullableVariables: CStringSet
  objectShapes: CObjectShapeFieldMap
  ownedValues: string[]
  promiseConstructorHandlers?: CPromiseConstructorHandlerMap
  promiseRejectionValueTypes?: CStringMap
  promiseValueTypes?: CStringMap
  returnType?: string
  runtimeArrayElementTypes: CStringMap
  runtimeCallbacks: CStringSet
  runtimeStrings: CStringSet
  setElementTypes: CStringMap
  statusReturn: boolean
  throwingFunction: boolean
  usedCleanupGoto: boolean
  variables: CStringMap
}

type ArrayVariableScopeSnapshot = {
  arrayShapes: Map<string, CArrayElementInfo[]>
  boxedVariables: CStringSet
  classInstanceTypes: CStringMap
  errorObjectNames: CStringSet
  functionTypes: CFunctionTypeMap
  mapTypes: CFunctionReturnMapTypeMap
  narrowedNullableScalars: CStringSet
  nullableVariables: CStringSet
  objectShapes: CObjectShapeFieldMap
  promiseConstructorHandlers: CPromiseConstructorHandlerMap
  promiseRejectionValueTypes: CStringMap
  promiseValueTypes: CStringMap
  runtimeArrayElementTypes: CStringMap
  runtimeCallbacks: CStringSet
  runtimeStrings: CStringSet
  setElementTypes: CStringMap
  variables: CStringMap
}

export type ArrayLoweringDependencies = {
  emitCArrayLiteralValueExpression(expression: AnyNode, context: ArrayFunctionContext): PreparedExpression
  emitCStringSplitValueExpression(expression: AnyNode, context: ArrayFunctionContext): PreparedArrayExpression | null
  emitCValueExpression(expression: AnyNode, context: ArrayFunctionContext): PreparedExpression
  emitPreparedNumberExpression(expression: AnyNode, context: ArrayFunctionContext): PreparedExpression
  inferExpressionType(expression: AnyNode, context: ArrayFunctionContext): string
  resolveKnownObjectIndex(expression: AnyNode, context: ArrayFunctionContext): CObjectFieldInfo | null
  resolveKnownObjectMember(expression: AnyNode, context: ArrayFunctionContext): CObjectFieldInfo | null
}

export type PreparedArrayExpression = PreparedExpression & {
  elementType: string
}

type PreparedArrayReceiver = {
  lines: string[]
  expression: string
  elementType: string
}

type KnownForOfArray = {
  name: string
  elements: CArrayElementInfo[]
}

type RuntimeForOfArray = {
  name: string
  elementType: string
  lines: string[]
}

type ArrayNode = AnyNode
type ArrayMaybeNode = ArrayNode | null | undefined

type ArrayCallbackBody =
  | {
      kind: 'prepared-return'
      returnExpression: AnyNode
    }
  | {
      kind: 'statement-list'
      statements: AnyNode[]
    }

function arrayDeps(context: ArrayFunctionContext): ArrayLoweringDependencies {
  const deps = context.arrayLoweringDependencies

  if (deps != null) {
    return deps
  }

  throw new Error('array lowering dependencies are not configured')
}

function optionalArrayDeps(context: ArrayFunctionContext): ArrayLoweringDependencies | null {
  if (context.arrayLoweringDependencies == null) {
    return null
  }

  return context.arrayLoweringDependencies
}

function isSupportedRuntimeArrayElementType(valueType: string): boolean {
  return valueType === 'number' || valueType === 'boolean' || valueType === 'string'
}

function appendLines(out: string[], lines: string[]): void {
  for (const line of lines) {
    out.push(line)
  }
}

function appendPrefixedLines(out: string[], lines: string[], prefix: string): void {
  for (const line of lines) {
    out.push(`${prefix}${line}`)
  }
}

function ensureArrayShapes(context: ArrayFunctionContext): Map<string, CArrayElementInfo[]> {
  let shapes = context.arrayShapes

  if (shapes != null) {
    return shapes
  }

  const nextShapes: Map<string, CArrayElementInfo[]> = new Map()
  context.arrayShapes = nextShapes

  return nextShapes
}

function ensureClassInstanceTypes(context: ArrayFunctionContext): CStringMap {
  let classInstanceTypes = context.classInstanceTypes

  if (classInstanceTypes != null) {
    return classInstanceTypes
  }

  const nextClassInstanceTypes: CStringMap = new Map()
  context.classInstanceTypes = nextClassInstanceTypes

  return nextClassInstanceTypes
}

function ensureErrorObjectNames(context: ArrayFunctionContext): CStringSet {
  let errorObjectNames = context.errorObjectNames

  if (errorObjectNames != null) {
    return errorObjectNames
  }

  const nextErrorObjectNames: CStringSet = new Set()
  context.errorObjectNames = nextErrorObjectNames

  return nextErrorObjectNames
}

function ensurePromiseConstructorHandlers(context: ArrayFunctionContext): CPromiseConstructorHandlerMap {
  let promiseConstructorHandlers = context.promiseConstructorHandlers

  if (promiseConstructorHandlers != null) {
    return promiseConstructorHandlers
  }

  const nextPromiseConstructorHandlers: CPromiseConstructorHandlerMap = new Map()
  context.promiseConstructorHandlers = nextPromiseConstructorHandlers

  return nextPromiseConstructorHandlers
}

function ensurePromiseRejectionValueTypes(context: ArrayFunctionContext): CStringMap {
  let promiseRejectionValueTypes = context.promiseRejectionValueTypes

  if (promiseRejectionValueTypes != null) {
    return promiseRejectionValueTypes
  }

  const nextPromiseRejectionValueTypes: CStringMap = new Map()
  context.promiseRejectionValueTypes = nextPromiseRejectionValueTypes

  return nextPromiseRejectionValueTypes
}

function ensurePromiseValueTypes(context: ArrayFunctionContext): CStringMap {
  let promiseValueTypes = context.promiseValueTypes

  if (promiseValueTypes != null) {
    return promiseValueTypes
  }

  const nextPromiseValueTypes: CStringMap = new Map()
  context.promiseValueTypes = nextPromiseValueTypes

  return nextPromiseValueTypes
}

function maybeArrayShapes(context: ArrayFunctionContext): Map<string, CArrayElementInfo[]> | null {
  if (context.arrayShapes == null) {
    return null
  }

  return context.arrayShapes
}

function findArrayShape(context: ArrayFunctionContext, name: string): CArrayElementInfo[] | null {
  const shapes = maybeArrayShapes(context)

  if (shapes == null) {
    return null
  }

  const shape = shapes.get(name)

  if (shape == null) {
    return null
  }

  return shape
}

function resolveFunctionReturnArrayElementType(context: ArrayFunctionContext, name: string): string | null {
  if (context.functionReturnArrayElementTypes == null) {
    return null
  }

  const elementType = context.functionReturnArrayElementTypes.get(name)

  if (elementType == null) {
    return null
  }

  return elementType
}

function pushArrayVariableScope(context: ArrayFunctionContext): ArrayVariableScopeSnapshot {
  const snapshot = {
    arrayShapes: ensureArrayShapes(context),
    boxedVariables: context.boxedVariables,
    classInstanceTypes: ensureClassInstanceTypes(context),
    errorObjectNames: ensureErrorObjectNames(context),
    functionTypes: context.functionTypes,
    mapTypes: context.mapTypes,
    narrowedNullableScalars: context.narrowedNullableScalars,
    nullableVariables: context.nullableVariables,
    objectShapes: context.objectShapes,
    promiseConstructorHandlers: ensurePromiseConstructorHandlers(context),
    promiseRejectionValueTypes: ensurePromiseRejectionValueTypes(context),
    promiseValueTypes: ensurePromiseValueTypes(context),
    runtimeArrayElementTypes: context.runtimeArrayElementTypes,
    runtimeCallbacks: context.runtimeCallbacks,
    runtimeStrings: context.runtimeStrings,
    setElementTypes: context.setElementTypes,
    variables: context.variables
  }

  context.arrayShapes = cloneCArrayShapeMap(snapshot.arrayShapes)
  context.boxedVariables = cloneCStringSet(snapshot.boxedVariables)
  context.classInstanceTypes = cloneCStringMap(snapshot.classInstanceTypes)
  context.errorObjectNames = cloneCStringSet(snapshot.errorObjectNames)
  context.functionTypes = cloneCFunctionTypeMap(snapshot.functionTypes)
  context.mapTypes = cloneCFunctionReturnMapTypeMap(snapshot.mapTypes)
  context.narrowedNullableScalars = cloneCStringSet(snapshot.narrowedNullableScalars)
  context.nullableVariables = cloneCStringSet(snapshot.nullableVariables)
  context.objectShapes = cloneCObjectShapeFieldMap(snapshot.objectShapes)
  context.promiseConstructorHandlers = cloneCPromiseConstructorHandlerMap(snapshot.promiseConstructorHandlers)
  context.promiseRejectionValueTypes = cloneCStringMap(snapshot.promiseRejectionValueTypes)
  context.promiseValueTypes = cloneCStringMap(snapshot.promiseValueTypes)
  context.runtimeArrayElementTypes = cloneCStringMap(snapshot.runtimeArrayElementTypes)
  context.runtimeCallbacks = cloneCStringSet(snapshot.runtimeCallbacks)
  context.runtimeStrings = cloneCStringSet(snapshot.runtimeStrings)
  context.setElementTypes = cloneCStringMap(snapshot.setElementTypes)
  context.variables = cloneCStringMap(snapshot.variables)

  return snapshot
}

function restoreArrayVariableScope(context: ArrayFunctionContext, snapshot: ArrayVariableScopeSnapshot): void {
  context.arrayShapes = snapshot.arrayShapes
  context.boxedVariables = snapshot.boxedVariables
  context.classInstanceTypes = snapshot.classInstanceTypes
  context.errorObjectNames = snapshot.errorObjectNames
  context.functionTypes = snapshot.functionTypes
  context.mapTypes = snapshot.mapTypes
  context.narrowedNullableScalars = snapshot.narrowedNullableScalars
  context.nullableVariables = snapshot.nullableVariables
  context.objectShapes = snapshot.objectShapes
  context.promiseConstructorHandlers = snapshot.promiseConstructorHandlers
  context.promiseRejectionValueTypes = snapshot.promiseRejectionValueTypes
  context.promiseValueTypes = snapshot.promiseValueTypes
  context.runtimeArrayElementTypes = snapshot.runtimeArrayElementTypes
  context.runtimeCallbacks = snapshot.runtimeCallbacks
  context.runtimeStrings = snapshot.runtimeStrings
  context.setElementTypes = snapshot.setElementTypes
  context.variables = snapshot.variables
}

function parseArrayIndex(value: string): number {
  let out = 0

  if (value.length === 0) {
    return -1
  }

  for (let index = 0; index < value.length; index = index + 1) {
    const code = value.charCodeAt(index)

    if (code < 48 || code > 57) {
      return -1
    }

    out = out * 10 + (code - 48)
  }

  return out
}

function inferArrayMetadataExpressionType(expression: AnyNode, context: ArrayFunctionContext): string {
  const deps = optionalArrayDeps(context)

  if (deps != null) {
    return deps.inferExpressionType(expression, context)
  }

  if (expression.valueType != null && expression.valueType !== 'unknown') {
    return expression.valueType
  }

  if (expression.type === 'NumberLiteral') {
    return 'number'
  }

  if (expression.type === 'StringLiteral') {
    return 'string'
  }

  if (expression.type === 'BooleanLiteral') {
    return 'boolean'
  }

  if (expression.type === 'ArrayLiteral') {
    return 'array'
  }

  if (expression.type === 'Reference' && expression.path.length === 1) {
    const valueType = context.variables.get(expression.path[0])

    if (valueType != null) {
      return valueType
    }
  }

  return 'unknown'
}

function cloneArrayShape(shape: CArrayElementInfo[]): CArrayElementInfo[] {
  const out: CArrayElementInfo[] = []

  for (const element of shape) {
    out.push({
      valueType: element.valueType
    })
  }

  return out
}

function arrayElementInfoAt(elements: CArrayElementInfo[], index: number): CArrayElementInfo {
  return elements[index]
}

function arrayCallbackStatementAt(statements: ArrayNode[], index: number): ArrayNode {
  return statements[index]
}

function arrayNodeAt(nodes: ArrayNode[], index: number): ArrayNode {
  return nodes[index]
}

function maybeArrayNodeAt(nodes: ArrayNode[], index: number): ArrayNode | null {
  if (index >= nodes.length) {
    return null
  }

  return arrayNodeAt(nodes, index)
}

function arrayElementInfoWithoutLast(elements: CArrayElementInfo[]): CArrayElementInfo[] {
  const out: CArrayElementInfo[] = []

  for (let index = 0; index < elements.length - 1; index = index + 1) {
    out.push(arrayElementInfoAt(elements, index))
  }

  return out
}

export function isArrayMethodCall(expression: ArrayMaybeNode): boolean {
  if (expression == null) {
    return false
  }

  if (expression.type !== 'CallExpression') {
    return false
  }

  const callee = expression.callee

  if (callee.type !== 'MemberExpression') {
    return false
  }

  return arrayRuntimeMethodName(callee.property) != null
}

export function isArrayLengthExpression(expression: ArrayMaybeNode, context: ArrayFunctionContext): boolean {
  if (expression == null) {
    return false
  }

  if (expression.type !== 'MemberExpression' || expression.property !== 'length') {
    return false
  }

  return inferArrayMetadataExpressionType(expression.object, context) === 'array'
}

export function resolveKnownArrayIndex(
  expression: ArrayMaybeNode,
  context: ArrayFunctionContext
): CKnownArrayElement | null {
  if (expression == null || expression.type !== 'IndexExpression') {
    return null
  }

  const object = expression.object
  const indexExpression = expression.index

  if (object.type !== 'Reference' || object.path.length !== 1 || indexExpression.type !== 'NumberLiteral') {
    return null
  }

  const arrayName = object.path[0]
  const elements = findArrayShape(context, arrayName)

  if (elements != null) {
    const index = parseArrayIndex(indexExpression.value)

    if (index < 0 || index >= elements.length) {
      return null
    }

    const element = arrayElementInfoAt(elements, index)

    return {
      arrayName,
      index,
      valueType: element.valueType
    }
  }

  return null
}

export function resolveRuntimeArrayIndex(
  expression: ArrayMaybeNode,
  context: ArrayFunctionContext
): CRuntimeArrayElement | null {
  if (expression == null || expression.type !== 'IndexExpression') {
    return null
  }

  const valueType = resolveRuntimeArrayElementType(expression.object, context)

  if (valueType == null) {
    return null
  }

  if (expression.index.type !== 'NumberLiteral') {
    if (inferArrayMetadataExpressionType(expression.index, context) !== 'number') {
      return null
    }

    return {
      index: 0,
      indexExpression: expression.index,
      valueType
    }
  }

  const index = parseArrayIndex(expression.index.value)

  if (index < 0) {
    return null
  }

  return {
    index,
    indexExpression: null,
    valueType
  }
}

export function resolveOptionalRuntimeArrayIndex(
  expression: ArrayMaybeNode,
  context: ArrayFunctionContext
): CRuntimeArrayElement | null {
  if (expression == null || expression.type !== 'OptionalIndexExpression') {
    return null
  }

  const valueType = resolveRuntimeArrayElementType(expression.object, context)

  if (valueType == null) {
    return null
  }

  if (expression.index.type !== 'NumberLiteral') {
    if (inferArrayMetadataExpressionType(expression.index, context) !== 'number') {
      return null
    }

    return {
      index: 0,
      indexExpression: expression.index,
      valueType
    }
  }

  const index = parseArrayIndex(expression.index.value)

  if (index < 0) {
    return null
  }

  return {
    index,
    indexExpression: null,
    valueType
  }
}

export function resolveRuntimeArrayElementType(expression: ArrayMaybeNode, context: ArrayFunctionContext): string | null {
  if (expression == null) {
    return null
  }

  if (expression.valueType === 'array') {
    if (expression.arrayElementType != null) {
      return expression.arrayElementType
    }

    return 'unknown'
  }

  if (expression.type === 'Reference' && expression.path.length === 1) {
    const runtimeElementType = context.runtimeArrayElementTypes.get(expression.path[0])

    if (runtimeElementType != null) {
      return runtimeElementType
    }

    const shape = findArrayShape(context, expression.path[0])

    if (shape != null) {
      return resolveForOfElementType(shape)
    }

    return null
  }

  if (expression.type === 'CallExpression') {
    const functionReturn = resolveFunctionReturnNameFromCall(expression)

    if (expression.valueType !== 'array') {
      return null
    }

    if (expression.arrayElementType != null) {
      return expression.arrayElementType
    }

    if (functionReturn != null) {
      const functionElementType = resolveFunctionReturnArrayElementType(context, functionReturn)

      if (functionElementType != null) {
        return functionElementType
      }
    }

    return 'unknown'
  }

  if (expression.type === 'MemberExpression') {
    const deps = optionalArrayDeps(context)
    let member: CObjectFieldInfo | null = null

    if (deps != null) {
      member = deps.resolveKnownObjectMember(expression, context)
    }

    if (member != null) {
      if (member.valueType !== 'array') {
        return null
      }

      if (member.arrayElementType != null) {
        return member.arrayElementType
      }

      return 'unknown'
    }

    return null
  }

  if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
    const deps = optionalArrayDeps(context)
    let field: CObjectFieldInfo | null = null

    if (deps != null) {
      field = deps.resolveKnownObjectIndex(expression, context)
    }

    if (field != null) {
      if (field.valueType !== 'array') {
        return null
      }

      if (field.arrayElementType != null) {
        return field.arrayElementType
      }

      return 'unknown'
    }

    return null
  }

  return null
}

function resolveFunctionReturnNameFromCall(expression: ArrayMaybeNode): string | null {
  if (expression == null || expression.type !== 'CallExpression') {
    return null
  }

  const callee = expression.callee

  if (callee.type !== 'Reference' || callee.path.length !== 1) {
    return null
  }

  return callee.path[0]
}

export function emitPreparedRuntimeArrayIndexValue(
  expression: AnyNode,
  element: CRuntimeArrayElement,
  context: ArrayFunctionContext,
  prefix: string
): PreparedExpression {
  const array = arrayDeps(context).emitCValueExpression(expression.object, context)
  const index = emitPreparedRuntimeArrayIndexExpression(element, context)
  const value = nextCName(context, prefix)
  registerOwnedValue(context, value)
  const lines: string[] = []

  appendLines(lines, array.lines)
  appendLines(lines, index.lines)
  appendLines(lines, emitPrepareOwnedValueWrite(value))
  lines.push(emitStatusCheck(`ccjs_array_get(${array.expression}, ${index.expression}, &${value})`, context))

  return {
    lines,
    expression: value
  }
}

function emitPreparedRuntimeArrayIndexExpression(
  element: CRuntimeArrayElement,
  context: ArrayFunctionContext
): PreparedExpression {
  const indexExpression = element.indexExpression

  if (indexExpression == null) {
    return {
      lines: [],
      expression: `${element.index}`
    }
  }

  const index = arrayDeps(context).emitPreparedNumberExpression(indexExpression, context)

  return {
    lines: index.lines,
    expression: `(size_t)(${index.expression})`
  }
}

export function emitPreparedKnownArrayIndexValueExpression(
  expression: AnyNode,
  context: ArrayFunctionContext
): PreparedExpression | null {
  const element = resolveKnownArrayIndex(expression, context)

  if (element != null) {
    const elementValueType = element.valueType

    if (elementValueType !== 'array' && elementValueType !== 'string') {
      return null
    }

    const temp = nextCName(context, 'ccjs_value')
    let tag = 'CCJS_TAG_STRING'

    if (elementValueType === 'array') {
      tag = 'CCJS_TAG_ARRAY'
    }

    registerOwnedValue(context, temp)
    const lines: string[] = []

    appendLines(lines, emitPrepareOwnedValueWrite(temp))
    lines.push(emitStatusCheck(`ccjs_array_get(${element.arrayName}, ${element.index}, &${temp})`, context))
    appendLines(lines, emitRuntimeFieldValueCheck(temp, tag, expression, context))

    return {
      lines,
      expression: temp
    }
  }

  return null
}

export function emitPreparedRuntimeArrayIndexValueExpression(
  expression: AnyNode,
  context: ArrayFunctionContext
): PreparedExpression | null {
  const runtimeElement = resolveRuntimeArrayIndex(expression, context)

  if (runtimeElement != null) {
    const value = emitPreparedRuntimeArrayIndexValue(expression, runtimeElement, context, 'ccjs_value')

    if (runtimeElement.valueType === 'string') {
      const lines: string[] = []

      appendLines(lines, value.lines)
      appendLines(lines, emitRuntimeFieldValueCheck(value.expression, 'CCJS_TAG_STRING', expression, context))

      return {
        lines,
        expression: value.expression
      }
    }

    const tag = cRuntimeValueTag(runtimeElement.valueType) ?? ''

    if (tag === '') {
      return value
    }

    const checkedLines: string[] = []

    appendLines(checkedLines, value.lines)
    appendLines(checkedLines, emitRuntimeFieldValueCheck(value.expression, tag, expression, context))

    return {
      lines: checkedLines,
      expression: value.expression
    }
  }

  return null
}

export function resolveKnownArrayLength(expression: ArrayMaybeNode, context: ArrayFunctionContext): string | null {
  if (expression == null || expression.type !== 'MemberExpression' || expression.property !== 'length') {
    return null
  }

  if (expression.object.type === 'ArrayLiteral') {
    return `${expression.object.elements.length}`
  }

  if (expression.object.type !== 'Reference' || expression.object.path.length !== 1) {
    return null
  }

  const arrayName = expression.object.path[0]
  const elements = findArrayShape(context, arrayName)

  if (elements == null) {
    return null
  }

  return `${elements.length}`
}

export function emitPreparedArrayLengthExpression(
  expression: ArrayMaybeNode,
  context: ArrayFunctionContext
): PreparedExpression | null {
  if (expression == null || expression.type !== 'MemberExpression' || expression.property !== 'length') {
    return null
  }

  const knownLength = resolveKnownArrayLength(expression, context)

  if (knownLength != null) {
    return {
      lines: [],
      expression: knownLength
    }
  }

  const deps = arrayDeps(context)

  if (
    deps.inferExpressionType(expression.object, context) !== 'array' &&
    !isDynamicObjectArrayLengthReceiver(expression.object, context, deps)
  ) {
    return null
  }

  const value = deps.emitCValueExpression(expression.object, context)
  const temp = nextCName(context, 'ccjs_array_len')
  const lines: string[] = []

  appendLines(lines, value.lines)
  lines.push(`size_t ${temp} = 0;`)
  lines.push(emitStatusCheck(`ccjs_array_len(${value.expression}, &${temp})`, context))

  return {
    lines,
    expression: temp
  }
}

function isDynamicObjectArrayLengthReceiver(
  expression: ArrayMaybeNode,
  context: ArrayFunctionContext,
  deps: ArrayLoweringDependencies
): boolean {
  if (expression == null) {
    return false
  }

  if (expression.type === 'MemberExpression') {
    const member = deps.resolveKnownObjectMember(expression, context)

    if (member != null) {
      return false
    }

    return deps.inferExpressionType(expression.object, context) === 'object'
  }

  if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
    const field = deps.resolveKnownObjectIndex(expression, context)

    if (field != null) {
      return false
    }

    return deps.inferExpressionType(expression.object, context) === 'object'
  }

  return false
}

export function resolveKnownForOfArray(
  expression: ArrayMaybeNode,
  context: ArrayFunctionContext
): KnownForOfArray | null {
  if (expression == null || expression.type !== 'Reference' || expression.path.length !== 1) {
    return null
  }

  const name = expression.path[0]
  const elements = findArrayShape(context, name)

  if (elements == null) {
    return null
  }

  return {
    name,
    elements
  }
}

export function resolveRuntimeForOfArray(
  expression: ArrayMaybeNode,
  context: ArrayFunctionContext
): RuntimeForOfArray | null {
  if (expression == null) {
    return null
  }

  const elementType = resolveRuntimeArrayElementType(expression, context)

  if (elementType == null) {
    return null
  }

  if (expression.type === 'Reference' && expression.path.length === 1) {
    return {
      name: expression.path[0],
      elementType,
      lines: []
    }
  }

  const value = arrayDeps(context).emitCValueExpression(expression, context)

  return {
    name: value.expression,
    elementType,
    lines: value.lines
  }
}

export function resolveForOfElementType(elements: CArrayElementInfo[]): string {
  if (elements.length === 0) {
    return 'unknown'
  }

  const first = arrayElementInfoAt(elements, 0)

  const firstValueType = first.valueType

  if (firstValueType === 'unknown') {
    return 'unknown'
  }

  const sourceElements: CArrayElementInfo[] = elements

  for (const element of sourceElements) {
    if (element.valueType !== firstValueType) {
      return 'unknown'
    }
  }

  return firstValueType
}

export function updateKnownArrayElementValueType(
  element: CKnownArrayElement,
  valueType: string,
  context: ArrayFunctionContext
): void {
  if (valueType === 'unknown') {
    return
  }

  const elements = findArrayShape(context, element.arrayName)

  if (elements != null) {
    if (element.index < 0 || element.index >= elements.length) {
      return
    }

    elements[element.index] = {
      valueType
    }
  }
}

export function emitArraySortVariableDeclaration(
  statement: AnyNode,
  sorted: PreparedArrayExpression,
  context: ArrayFunctionContext
): string[] {
  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'array')

  const shape = findArrayShape(context, sorted.expression)

  if (shape != null) {
    ensureArrayShapes(context).set(statement.name, cloneArrayShape(shape))
  } else {
    let elementType = sorted.elementType

    if (statement.arrayElementType != null) {
      elementType = statement.arrayElementType
    }

    context.runtimeArrayElementTypes.set(statement.name, elementType)
  }

  const lines: string[] = []

  appendLines(lines, sorted.lines)
  appendLines(lines, emitPrepareOwnedValueWrite(statement.name))
  lines.push(`${statement.name} = ${sorted.expression};`)
  lines.push(`ccjs_retain(${statement.name});`)

  return lines
}

export function emitArrayFilterVariableDeclaration(
  statement: AnyNode,
  filtered: PreparedArrayExpression,
  context: ArrayFunctionContext
): string[] {
  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'array')

  let elementType = filtered.elementType

  if (statement.arrayElementType != null) {
    elementType = statement.arrayElementType
  }

  context.runtimeArrayElementTypes.set(statement.name, elementType)

  const lines: string[] = []

  appendLines(lines, filtered.lines)
  appendLines(lines, emitPrepareOwnedValueWrite(statement.name))
  lines.push(`${statement.name} = ${filtered.expression};`)
  lines.push(`ccjs_retain(${statement.name});`)

  return lines
}

export function emitArrayMapVariableDeclaration(
  statement: AnyNode,
  mapped: PreparedArrayExpression,
  context: ArrayFunctionContext
): string[] {
  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'array')

  let elementType = mapped.elementType

  if (statement.arrayElementType != null) {
    elementType = statement.arrayElementType
  }

  context.runtimeArrayElementTypes.set(statement.name, elementType)

  const lines: string[] = []

  appendLines(lines, mapped.lines)
  appendLines(lines, emitPrepareOwnedValueWrite(statement.name))
  lines.push(`${statement.name} = ${mapped.expression};`)
  lines.push(`ccjs_retain(${statement.name});`)

  return lines
}

export function emitArraySliceVariableDeclaration(
  statement: AnyNode,
  sliced: PreparedArrayExpression,
  context: ArrayFunctionContext
): string[] {
  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'array')

  let elementType = sliced.elementType

  if (statement.arrayElementType != null) {
    elementType = statement.arrayElementType
  }

  context.runtimeArrayElementTypes.set(statement.name, elementType)

  const lines: string[] = []

  appendLines(lines, sliced.lines)
  appendLines(lines, emitPrepareOwnedValueWrite(statement.name))
  lines.push(`${statement.name} = ${sliced.expression};`)
  lines.push(`ccjs_retain(${statement.name});`)

  return lines
}

export function emitPreparedArraySortCallExpression(
  expression: ArrayMaybeNode,
  context: ArrayFunctionContext
): PreparedArrayExpression | null {
  if (expression == null || expression.type !== 'CallExpression') {
    return null
  }

  const callee = expression.callee

  if (callee.type !== 'MemberExpression' || callee.property !== 'sort' || expression.args.length > 1) {
    return null
  }

  const receiver = emitPreparedArrayReceiver(callee.object, context)

  if (receiver != null) {
    if (expression.args.length === 1) {
      return emitPreparedArrayComparatorSortCallExpression(expression, receiver, context)
    }

    const lines: string[] = []

    appendLines(lines, receiver.lines)
    lines.push(emitStatusCheck(`ccjs_array_sort(${receiver.expression})`, context))

    return {
      lines,
      expression: receiver.expression,
      elementType: receiver.elementType
    }
  }

  return null
}

export function emitPreparedArraySliceCallExpression(
  expression: ArrayMaybeNode,
  context: ArrayFunctionContext
): PreparedArrayExpression | null {
  if (expression == null || expression.type !== 'CallExpression') {
    return null
  }

  const callee = expression.callee

  if (callee.type !== 'MemberExpression' || callee.property !== 'slice' || expression.args.length > 2) {
    return null
  }

  const receiver = emitPreparedArrayReceiver(callee.object, context)

  if (receiver == null) {
    return null
  }

  let start: PreparedExpression = {
    lines: [],
    expression: '0'
  }
  const lengthName = nextCName(context, 'ccjs_array_slice_length')
  const startRaw = nextCName(context, 'ccjs_array_slice_start_raw')
  const startIndex = nextCName(context, 'ccjs_array_slice_start')
  const endRaw = nextCName(context, 'ccjs_array_slice_end_raw')
  const endIndex = nextCName(context, 'ccjs_array_slice_end')
  let end: PreparedExpression = {
    lines: [],
    expression: `((double)${lengthName})`
  }
  const out = nextCName(context, 'ccjs_array_slice')
  const lines: string[] = []

  if (expression.args[0] != null) {
    start = arrayDeps(context).emitPreparedNumberExpression(expression.args[0], context)
  }

  if (expression.args[1] != null) {
    end = arrayDeps(context).emitPreparedNumberExpression(expression.args[1], context)
  }

  registerOwnedValue(context, out)

  appendLines(lines, receiver.lines)
  appendLines(lines, start.lines)
  appendLines(lines, end.lines)
  lines.push(`size_t ${lengthName} = 0;`)
  lines.push(emitStatusCheck(`ccjs_array_len(${receiver.expression}, &${lengthName})`, context))
  lines.push(`double ${startRaw} = ${start.expression};`)
  lines.push(`double ${endRaw} = ${end.expression};`)
  appendLines(lines, emitSliceIndexNormalizationLines(startRaw, lengthName, startIndex, context, 'ccjs_array_slice_start'))
  appendLines(lines, emitSliceIndexNormalizationLines(endRaw, lengthName, endIndex, context, 'ccjs_array_slice_end'))
  lines.push(`if (${endIndex} < ${startIndex}) ${endIndex} = ${startIndex};`)
  appendLines(lines, emitPrepareOwnedValueWrite(out))
  lines.push(
    emitStatusCheck(
      `ccjs_array_slice(&ccjs_default_allocator, ${receiver.expression}, ${startIndex}, ${endIndex}, &${out})`,
      context
    )
  )

  return {
    lines,
    expression: out,
    elementType: receiver.elementType
  }
}

export function emitPreparedArrayPushCallExpression(
  expression: ArrayMaybeNode,
  context: ArrayFunctionContext
): PreparedArrayExpression | null {
  if (expression == null || expression.type !== 'CallExpression') {
    return null
  }

  const callee = expression.callee

  if (callee.type !== 'MemberExpression' || callee.property !== 'push' || expression.args.length !== 1) {
    return null
  }

  const receiver = emitPreparedArrayReceiver(callee.object, context)

  if (receiver != null) {
    const arg = expression.args[0]

    if (arg == null) {
      return null
    }

    const valueType = arrayDeps(context).inferExpressionType(arg, context)
    const value = emitPreparedArrayElementValue(arg, valueType, context)

    updatePushedArrayMetadata(callee.object, valueType, context)

    const lines: string[] = []

    appendLines(lines, receiver.lines)
    appendLines(lines, value.lines)
    lines.push(emitStatusCheck(`ccjs_array_push(${receiver.expression}, ${value.expression})`, context))

    return {
      lines,
      expression: '',
      elementType: receiver.elementType
    }
  }

  return null
}

export function emitPreparedArrayPopCallExpression(
  expression: ArrayMaybeNode,
  context: ArrayFunctionContext,
  options: PreparedCallOptions | null
): PreparedArrayExpression | null {
  if (expression == null || expression.type !== 'CallExpression') {
    return null
  }

  const callee = expression.callee

  if (callee.type !== 'MemberExpression' || callee.property !== 'pop' || expression.args.length !== 0) {
    return null
  }

  const receiver = emitPreparedArrayReceiver(callee.object, context)

  if (receiver != null) {
    const value = nextCName(context, 'ccjs_array_pop')
    registerOwnedValue(context, value)
    updatePoppedArrayMetadata(callee.object, context)

    const lines: string[] = []

    appendLines(lines, receiver.lines)
    appendLines(lines, emitPrepareOwnedValueWrite(value))
    lines.push(emitStatusCheck(`ccjs_array_pop(${receiver.expression}, &${value})`, context))

    if (options != null && options.discard === true) {
      lines.push(`ccjs_release(${value});`)
      lines.push(`${value} = ccjs_undefined_value();`)
    }

    return {
      lines,
      expression: value,
      elementType: receiver.elementType
    }
  }

  return null
}

function emitPreparedArrayComparatorSortCallExpression(
  expression: AnyNode,
  receiver: PreparedArrayReceiver,
  context: ArrayFunctionContext
): PreparedArrayExpression | null {
  const callback = expression.args[0]
  const returnExpression = resolveArrowReturnExpression(callback)

  if (
    callback == null ||
    callback.type !== 'ArrowFunctionExpression' ||
    returnExpression == null ||
    callback.params.length > 2 ||
    !isSupportedRuntimeArrayElementType(receiver.elementType)
  ) {
    return null
  }

  const length = nextCName(context, 'ccjs_sort_length')
  const index = nextCName(context, 'ccjs_sort_index')
  const scan = nextCName(context, 'ccjs_sort_scan')
  const left = nextCName(context, 'ccjs_sort_left')
  const right = nextCName(context, 'ccjs_sort_right')
  const compare = nextCName(context, 'ccjs_sort_compare')

  registerOwnedValue(context, left)
  registerOwnedValue(context, right)

  const bodyScope = pushArrayVariableScope(context)
  let body: string[] = []
  const input = emitPreparedArraySortComparatorInput(callback, receiver, left, right, context)
  const result = arrayDeps(context).emitPreparedNumberExpression(returnExpression, context)

  appendLines(body, input)
  appendLines(body, result.lines)
  body.push(`double ${compare} = ${result.expression};`)
  body.push(`if (!(${compare} > 0)) break;`)
  body.push(emitStatusCheck(`ccjs_array_set(${receiver.expression}, ${scan} - 1, ${right})`, context))
  body.push(emitStatusCheck(`ccjs_array_set(${receiver.expression}, ${scan}, ${left})`, context))
  restoreArrayVariableScope(context, bodyScope)

  const leftReadStatus = emitStatusCheck(`ccjs_array_get(${receiver.expression}, ${scan} - 1, &${left})`, context)
  const rightReadStatus = emitStatusCheck(`ccjs_array_get(${receiver.expression}, ${scan}, &${right})`, context)
  const lines: string[] = []

  appendLines(lines, receiver.lines)
  lines.push(`size_t ${length} = 0;`)
  lines.push(emitStatusCheck(`ccjs_array_len(${receiver.expression}, &${length})`, context))
  lines.push(`for (size_t ${index} = 1; ${index} < ${length}; ${index} += 1) {`)
  lines.push(`  for (size_t ${scan} = ${index}; ${scan} > 0; ${scan} -= 1) {`)
  appendPrefixedLines(lines, emitPrepareOwnedValueWrite(left), '    ')
  lines.push(`    ${leftReadStatus}`)
  appendPrefixedLines(lines, emitPrepareOwnedValueWrite(right), '    ')
  lines.push(`    ${rightReadStatus}`)
  appendPrefixedLines(lines, body, '    ')
  lines.push('  }')
  lines.push('}')
  appendLines(lines, emitPrepareOwnedValueWrite(right))
  appendLines(lines, emitPrepareOwnedValueWrite(left))

  return {
    lines,
    expression: receiver.expression,
    elementType: receiver.elementType
  }
}

export function emitPreparedArrayMapCallExpression(
  expression: ArrayMaybeNode,
  context: ArrayFunctionContext
): PreparedArrayExpression | null {
  if (expression == null || expression.type !== 'CallExpression') {
    return null
  }

  const callee = expression.callee

  if (callee.type !== 'MemberExpression' || callee.property !== 'map' || expression.args.length !== 1) {
    return null
  }

  const callback = expression.args[0]

  if (callback == null || callback.type !== 'ArrowFunctionExpression' || callback.params.length > 2) {
    return null
  }

  const callbackBody = resolveArrayCallbackBody(callback)

  if (callbackBody == null) {
    return null
  }

  const receiver = emitPreparedArrayReceiver(callee.object, context)

  if (receiver != null) {
    if (!isSupportedRuntimeArrayElementType(receiver.elementType)) {
      return null
    }

    const out = nextCName(context, 'ccjs_map_array')
    const length = nextCName(context, 'ccjs_map_length')
    const index = nextCName(context, 'ccjs_map_index')
    const value = nextCName(context, 'ccjs_map_value')
    let mappedElementType = 'unknown'

    if (expression.arrayElementType != null) {
      mappedElementType = expression.arrayElementType
    }

    registerOwnedValue(context, out)
    registerOwnedValue(context, value)

    const bodyScope = pushArrayVariableScope(context)
    let body: string[] = []
    let bodyReady = false
    const input = emitPreparedArrayCallbackInput(callback, receiver, value, index, context)

    if (mappedElementType === 'unknown') {
      mappedElementType = resolveArrayCallbackReturnType(callbackBody, context)
    }

    if (!isSupportedRuntimeArrayElementType(mappedElementType)) {
      bodyReady = false
    } else {
      appendLines(body, input)
      appendLines(body, emitArrayMapCallbackBodyLines(callbackBody, mappedElementType, out, context))
      bodyReady = true
    }
    restoreArrayVariableScope(context, bodyScope)

    if (!bodyReady) {
      return null
    }

    const readStatus = emitStatusCheck(`ccjs_array_get(${receiver.expression}, ${index}, &${value})`, context)
    const lines: string[] = []

    appendLines(lines, receiver.lines)
    appendLines(lines, emitPrepareOwnedValueWrite(out))
    lines.push(emitStatusCheck(`ccjs_array_new(&ccjs_default_allocator, 0, &${out})`, context))
    lines.push(`size_t ${length} = 0;`)
    lines.push(emitStatusCheck(`ccjs_array_len(${receiver.expression}, &${length})`, context))
    lines.push(`for (size_t ${index} = 0; ${index} < ${length}; ${index} += 1) {`)
    appendPrefixedLines(lines, emitPrepareOwnedValueWrite(value), '  ')
    lines.push(`  ${readStatus}`)
    appendPrefixedLines(lines, body, '  ')
    lines.push('}')
    appendLines(lines, emitPrepareOwnedValueWrite(value))

    return {
      lines,
      expression: out,
      elementType: mappedElementType
    }
  }

  return null
}

export function emitPreparedArrayFilterCallExpression(
  expression: ArrayMaybeNode,
  context: ArrayFunctionContext
): PreparedArrayExpression | null {
  if (expression == null || expression.type !== 'CallExpression') {
    return null
  }

  const callee = expression.callee

  if (callee.type !== 'MemberExpression' || callee.property !== 'filter' || expression.args.length !== 1) {
    return null
  }

  const callback = expression.args[0]

  if (callback == null) {
    return null
  }

  const booleanCallback = isArrayFilterBooleanCallback(callback)
  let callbackBody: ArrayCallbackBody | null = null

  if (!booleanCallback) {
    if (callback.type !== 'ArrowFunctionExpression' || callback.params.length > 2) {
      return null
    }

    callbackBody = resolveArrayCallbackBody(callback)

    if (callbackBody == null) {
      return null
    }
  }

  const receiver = emitPreparedArrayReceiver(callee.object, context)

  if (receiver != null) {
    if (!isSupportedRuntimeArrayElementType(receiver.elementType)) {
      return null
    }

    const out = nextCName(context, 'ccjs_filter_array')
    const length = nextCName(context, 'ccjs_filter_length')
    const index = nextCName(context, 'ccjs_filter_index')
    const value = nextCName(context, 'ccjs_filter_value')

    registerOwnedValue(context, out)
    registerOwnedValue(context, value)

    const bodyScope = pushArrayVariableScope(context)
    let body: string[] = []
    let bodyReady = true

    if (booleanCallback) {
      appendLines(body, emitArrayFilterBooleanCallbackBodyLines(receiver.elementType, out, value, context))
    } else {
      if (callbackBody == null) {
        bodyReady = false
      } else {
        const input = emitPreparedArrayCallbackInput(callback, receiver, value, index, context)

        appendLines(body, input)
        appendLines(body, emitArrayFilterCallbackBodyLines(callbackBody, out, value, context))
      }
    }
    restoreArrayVariableScope(context, bodyScope)

    if (!bodyReady) {
      return null
    }

    const readStatus = emitStatusCheck(`ccjs_array_get(${receiver.expression}, ${index}, &${value})`, context)
    const lines: string[] = []

    appendLines(lines, receiver.lines)
    appendLines(lines, emitPrepareOwnedValueWrite(out))
    lines.push(emitStatusCheck(`ccjs_array_new(&ccjs_default_allocator, 0, &${out})`, context))
    lines.push(`size_t ${length} = 0;`)
    lines.push(emitStatusCheck(`ccjs_array_len(${receiver.expression}, &${length})`, context))
    lines.push(`for (size_t ${index} = 0; ${index} < ${length}; ${index} += 1) {`)
    appendPrefixedLines(lines, emitPrepareOwnedValueWrite(value), '  ')
    lines.push(`  ${readStatus}`)
    appendPrefixedLines(lines, body, '  ')
    lines.push('}')
    appendLines(lines, emitPrepareOwnedValueWrite(value))

    return {
      lines,
      expression: out,
      elementType: receiver.elementType
    }
  }

  return null
}

function isArrayFilterBooleanCallback(callback: ArrayMaybeNode): boolean {
  if (callback == null) {
    return false
  }

  return callback.type === 'Reference' && callback.path.length === 1 && callback.path[0] === 'Boolean'
}

function resolveArrowReturnExpression(callback: ArrayMaybeNode): AnyNode | null {
  if (callback == null || callback.type !== 'ArrowFunctionExpression') {
    return null
  }

  if (callback.expressionBody) {
    return callback.body
  }

  let statements: AnyNode[] | null = null

  if (Array.isArray(callback.body)) {
    statements = callback.body
  } else if (callback.body != null && callback.body.type === 'BlockStatement') {
    statements = callback.body.body
  }

  if (statements != null) {
    if (statements.length !== 1) {
      return null
    }

    const statement = arrayCallbackStatementAt(statements, 0)

    if (statement.type !== 'ReturnStatement' || statement.argument == null) {
      return null
    }

    return statement.argument
  }

  return null
}

function resolveArrayCallbackBody(callback: ArrayMaybeNode): ArrayCallbackBody | null {
  const returnExpression = resolveArrowReturnExpression(callback)

  if (returnExpression != null) {
    return {
      kind: 'prepared-return',
      returnExpression
    }
  }

  if (callback == null || callback.type !== 'ArrowFunctionExpression' || callback.expressionBody) {
    return null
  }

  let statements: AnyNode[] | null = null

  if (Array.isArray(callback.body)) {
    statements = callback.body
  } else if (callback.body != null && callback.body.type === 'BlockStatement') {
    statements = callback.body.body
  }

  if (statements == null || !canLowerArrayCallbackStatementList(statements)) {
    return null
  }

  return {
    kind: 'statement-list',
    statements
  }
}

function canLowerArrayCallbackStatementList(statements: AnyNode[] | null | undefined): boolean {
  if (statements == null || statements.length === 0) {
    return false
  }

  for (let index = 0; index < statements.length; index = index + 1) {
    const statement = statements[index]

    if (index === statements.length - 1) {
      if (!canLowerArrayCallbackTerminalStatement(statement)) {
        return false
      }
    } else if (!canLowerArrayCallbackEarlyReturnStatement(statement)) {
      return false
    }
  }

  return true
}

function canLowerArrayCallbackTerminalStatement(statement: AnyNode | null | undefined): boolean {
  if (statement == null) {
    return false
  }

  if (statement.type === 'ReturnStatement') {
    return statement.argument != null
  }

  if (statement.type === 'BlockStatement') {
    return canLowerArrayCallbackStatementList(statement.body)
  }

  if (statement.type !== 'IfStatement' || statement.alternate == null) {
    return false
  }

  return (
    canLowerArrayCallbackTerminalStatement(statement.consequent) &&
    canLowerArrayCallbackTerminalStatement(statement.alternate)
  )
}

function canLowerArrayCallbackReturnStatement(statement: AnyNode | null | undefined): boolean {
  if (statement == null) {
    return false
  }

  if (statement.type === 'ReturnStatement') {
    return statement.argument != null
  }

  return false
}

function canLowerArrayCallbackEarlyReturnStatement(statement: AnyNode | null | undefined): boolean {
  if (statement == null) {
    return false
  }

  if (statement.type === 'BlockStatement') {
    return canLowerArrayCallbackStatementList(statement.body)
  }

  if (statement.type !== 'IfStatement') {
    return false
  }

  return (
    canLowerArrayCallbackBranch(statement.consequent) &&
    (statement.alternate == null || canLowerArrayCallbackBranch(statement.alternate))
  )
}

function canLowerArrayCallbackBranch(statement: AnyNode | null | undefined): boolean {
  if (canLowerArrayCallbackReturnStatement(statement)) {
    return true
  }

  if (statement == null) {
    return false
  }

  if (statement.type === 'BlockStatement') {
    return canLowerArrayCallbackStatementList(statement.body)
  }

  return canLowerArrayCallbackEarlyReturnStatement(statement)
}

function resolveArrayCallbackReturnType(body: ArrayCallbackBody, context: ArrayFunctionContext): string {
  const expressions = collectArrayCallbackReturnExpressions(body)

  if (expressions.length === 0) {
    return 'unknown'
  }

  const firstExpression = arrayNodeAt(expressions, 0)
  const firstType = arrayDeps(context).inferExpressionType(firstExpression, context)

  if (firstType === 'unknown') {
    return 'unknown'
  }

  for (const expression of expressions) {
    if (arrayDeps(context).inferExpressionType(expression, context) !== firstType) {
      return 'unknown'
    }
  }

  return firstType
}

function collectArrayCallbackReturnExpressions(body: ArrayCallbackBody): AnyNode[] {
  if (body.kind === 'prepared-return') {
    const preparedExpressions: AnyNode[] = []

    preparedExpressions.push(body.returnExpression)

    return preparedExpressions
  }

  const expressions: AnyNode[] = []

  const statements: ArrayNode[] = body.statements

  for (const statement of statements) {
    collectArrayCallbackReturnExpressionsFromStatement(statement, expressions)
  }

  return expressions
}

function collectArrayCallbackReturnExpressionsFromStatement(
  statement: AnyNode | null | undefined,
  expressions: AnyNode[]
): void {
  if (statement == null) {
    return
  }

  if (statement.type === 'ReturnStatement') {
    if (statement.argument != null) {
      expressions.push(statement.argument)
    }

    return
  }

  if (statement.type === 'BlockStatement') {
    const body: ArrayNode[] = statement.body

    for (const child of body) {
      collectArrayCallbackReturnExpressionsFromStatement(child, expressions)
    }

    return
  }

  if (statement.type === 'IfStatement') {
    collectArrayCallbackReturnExpressionsFromStatement(statement.consequent, expressions)
    collectArrayCallbackReturnExpressionsFromStatement(statement.alternate, expressions)
  }
}

function emitArrayMapCallbackBodyLines(
  body: ArrayCallbackBody,
  elementType: string,
  out: string,
  context: ArrayFunctionContext
): string[] {
  return emitArrayCallbackBodyLines(body, 'map', elementType, out, '', context)
}

function emitArrayFilterCallbackBodyLines(
  body: ArrayCallbackBody,
  out: string,
  value: string,
  context: ArrayFunctionContext
): string[] {
  return emitArrayCallbackBodyLines(body, 'filter', '', out, value, context)
}

function emitArrayFilterBooleanCallbackBodyLines(
  elementType: string,
  out: string,
  value: string,
  context: ArrayFunctionContext
): string[] {
  const pushStatus = emitStatusCheck(`ccjs_array_push(${out}, ${value})`, context)
  const lines: string[] = []

  appendLines(lines, emitArrayFilterBooleanTypeCheckLines(elementType, value, context))
  lines.push(`if ${emitCConditionClause(arrayFilterBooleanPredicateExpression(elementType, value))} {`)
  lines.push(`  ${pushStatus}`)
  lines.push('}')

  return lines
}

function emitArrayFilterBooleanTypeCheckLines(
  elementType: string,
  value: string,
  context: ArrayFunctionContext
): string[] {
  if (elementType === 'string') {
    return [emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_STRING || ${value}.as.ref == 0`, context)]
  }

  if (elementType === 'boolean') {
    return [emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_BOOL`, context)]
  }

  return [emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_NUMBER`, context)]
}

function arrayFilterBooleanPredicateExpression(elementType: string, value: string): string {
  if (elementType === 'string') {
    return `((ccjs_string*)${value}.as.ref)->len > 0`
  }

  if (elementType === 'boolean') {
    return `${value}.as.boolean`
  }

  return `(${value}.as.number == ${value}.as.number && ${value}.as.number != 0)`
}

function emitArrayCallbackBodyLines(
  body: ArrayCallbackBody,
  returnKind: string,
  elementType: string,
  out: string,
  value: string,
  context: ArrayFunctionContext
): string[] {
  if (body.kind === 'prepared-return') {
    return emitArrayCallbackReturnLines(body.returnExpression, returnKind, elementType, out, value, context)
  }

  const doneLabel = nextCName(context, 'ccjs_array_callback_done')
  const lines = emitArrayCallbackStatementListLines(body.statements, doneLabel, returnKind, elementType, out, value, context)

  lines.push(`${doneLabel}:;`)

  return lines
}

function emitArrayCallbackStatementListLines(
  statements: AnyNode[],
  doneLabel: string,
  returnKind: string,
  elementType: string,
  outValue: string,
  currentValue: string,
  context: ArrayFunctionContext
): string[] {
  const out: string[] = []

  for (const statement of statements) {
    appendLines(
      out,
      emitArrayCallbackStatementLines(statement, doneLabel, returnKind, elementType, outValue, currentValue, context)
    )
  }

  return out
}

function emitArrayCallbackStatementLines(
  statement: ArrayMaybeNode,
  doneLabel: string,
  returnKind: string,
  elementType: string,
  outValue: string,
  currentValue: string,
  context: ArrayFunctionContext
): string[] {
  if (statement == null) {
    return []
  }

  if (statement.type === 'ReturnStatement') {
    const lines = emitArrayCallbackReturnLines(statement.argument, returnKind, elementType, outValue, currentValue, context)

    lines.push(`goto ${doneLabel};`)

    return lines
  }

  if (statement.type === 'BlockStatement') {
    const lines: string[] = []

    lines.push('{')
    appendPrefixedLines(
      lines,
      emitArrayCallbackStatementListLines(statement.body, doneLabel, returnKind, elementType, outValue, currentValue, context),
      '  '
    )
    lines.push('}')

    return lines
  }

  if (statement.type !== 'IfStatement') {
    return []
  }

  const condition = arrayDeps(context).emitPreparedNumberExpression(statement.condition, context)
  const consequent = emitArrayCallbackStatementLines(
    statement.consequent,
    doneLabel,
    returnKind,
    elementType,
    outValue,
    currentValue,
    context
  )
  const lines: string[] = []

  appendLines(lines, condition.lines)
  lines.push(`if ${emitCConditionClause(condition.expression)} {`)
  appendPrefixedLines(lines, consequent, '  ')
  lines.push('}')

  if (statement.alternate != null) {
    lines[lines.length - 1] = '} else {'
    appendPrefixedLines(
      lines,
      emitArrayCallbackStatementLines(
        statement.alternate,
        doneLabel,
        returnKind,
        elementType,
        outValue,
        currentValue,
        context
      ),
      '  '
    )
    lines.push('}')
  }

  return lines
}

function emitArrayCallbackReturnLines(
  expression: AnyNode,
  returnKind: string,
  elementType: string,
  out: string,
  value: string,
  context: ArrayFunctionContext
): string[] {
  if (returnKind === 'map') {
    return emitArrayMapReturnLines(expression, elementType, out, context)
  }

  return emitArrayFilterReturnLines(expression, out, value, context)
}

function emitArrayMapReturnLines(
  expression: AnyNode,
  elementType: string,
  out: string,
  context: ArrayFunctionContext
): string[] {
  const mappedValue = emitPreparedArrayMapValue(expression, elementType, context)
  const lines: string[] = []

  appendLines(lines, mappedValue.lines)
  lines.push(emitStatusCheck(`ccjs_array_push(${out}, ${mappedValue.expression})`, context))

  return lines
}

function emitArrayFilterReturnLines(expression: AnyNode, out: string, value: string, context: ArrayFunctionContext): string[] {
  const predicate = arrayDeps(context).emitPreparedNumberExpression(expression, context)

  const pushStatus = emitStatusCheck(`ccjs_array_push(${out}, ${value})`, context)
  const lines: string[] = []

  appendLines(lines, predicate.lines)
  lines.push(`if ${emitCConditionClause(predicate.expression)} {`)
  lines.push(`  ${pushStatus}`)
  lines.push('}')

  return lines
}

function emitPreparedArrayCallbackInput(
  callback: AnyNode,
  receiver: PreparedArrayReceiver,
  value: string,
  index: string,
  context: ArrayFunctionContext
): string[] {
  const lines: string[] = []
  const valueParam = maybeArrayNodeAt(callback.params, 0)
  const indexParam = maybeArrayNodeAt(callback.params, 1)

  if (valueParam != null) {
    context.variables.set(valueParam.name, receiver.elementType)

    if (receiver.elementType === 'string') {
      context.runtimeStrings.add(valueParam.name)
      lines.push(emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_STRING || ${value}.as.ref == 0`, context))
      lines.push(`ccjs_string* ${valueParam.name} = (ccjs_string*)${value}.as.ref;`)
    } else if (receiver.elementType === 'boolean') {
      lines.push(emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_BOOL`, context))
      lines.push(`double ${valueParam.name} = (double)(${value}.as.boolean != 0);`)
    } else {
      lines.push(emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_NUMBER`, context))
      lines.push(`double ${valueParam.name} = ${value}.as.number;`)
    }
  }

  if (indexParam != null) {
    context.variables.set(indexParam.name, 'number')
    lines.push(`double ${indexParam.name} = (double)${index};`)
  }

  return lines
}

function updatePushedArrayMetadata(receiver: ArrayMaybeNode, valueType: string, context: ArrayFunctionContext): void {
  if (receiver == null || receiver.type !== 'Reference' || receiver.path.length !== 1 || valueType === 'unknown') {
    return
  }

  const name = receiver.path[0]
  const elements = findArrayShape(context, name)

  if (elements == null) {
    if (context.variables.get(name) === 'array') {
      const existingElementType = context.runtimeArrayElementTypes.get(name)

      if (existingElementType == null) {
        context.runtimeArrayElementTypes.set(name, valueType)
      } else {
        context.runtimeArrayElementTypes.set(name, existingElementType)
      }
    }

    return
  }

  const nextElements: CArrayElementInfo[] = []

  for (const element of elements) {
    nextElements.push(element)
  }

  nextElements.push({
    valueType
  })
  const elementType = resolveForOfElementType(nextElements)

  if (elementType === 'unknown') {
    ensureArrayShapes(context).delete(name)
    context.runtimeArrayElementTypes.set(name, 'unknown')
    return
  }

  ensureArrayShapes(context).set(name, nextElements)
}

function updatePoppedArrayMetadata(receiver: ArrayMaybeNode, context: ArrayFunctionContext): void {
  if (receiver == null || receiver.type !== 'Reference' || receiver.path.length !== 1) {
    return
  }

  const name = receiver.path[0]
  const elements = findArrayShape(context, name)

  if (elements != null) {
    ensureArrayShapes(context).set(name, arrayElementInfoWithoutLast(elements))
  }
}

function emitPreparedArrayMapValue(expression: AnyNode, valueType: string, context: ArrayFunctionContext): PreparedExpression {
  return emitPreparedArrayElementValue(expression, valueType, context)
}

function emitPreparedArrayElementValue(
  expression: AnyNode,
  valueType: string,
  context: ArrayFunctionContext
): PreparedExpression {
  if (valueType !== 'number' && valueType !== 'boolean') {
    return arrayDeps(context).emitCValueExpression(expression, context)
  }

  const value = arrayDeps(context).emitPreparedNumberExpression(expression, context)
  let valueExpression = `ccjs_number_value(${value.expression})`

  if (valueType === 'boolean') {
    valueExpression = `ccjs_bool_value((${value.expression}) != 0)`
  }

  return {
    lines: value.lines,
    expression: valueExpression
  }
}

function emitPreparedArraySortComparatorInput(
  callback: AnyNode,
  receiver: PreparedArrayReceiver,
  left: string,
  right: string,
  context: ArrayFunctionContext
): string[] {
  const lines: string[] = []
  const leftParam = maybeArrayNodeAt(callback.params, 0)
  const rightParam = maybeArrayNodeAt(callback.params, 1)

  if (leftParam != null) {
    appendLines(lines, emitPreparedArraySortComparatorParam(leftParam.name, receiver.elementType, left, context))
  }

  if (rightParam != null) {
    appendLines(lines, emitPreparedArraySortComparatorParam(rightParam.name, receiver.elementType, right, context))
  }

  return lines
}

function emitPreparedArraySortComparatorParam(
  name: string,
  elementType: string,
  value: string,
  context: ArrayFunctionContext
): string[] {
  context.variables.set(name, elementType)

  if (elementType === 'string') {
    context.runtimeStrings.add(name)
    return [
      emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_STRING || ${value}.as.ref == 0`, context),
      `ccjs_string* ${name} = (ccjs_string*)${value}.as.ref;`
    ]
  }

  if (elementType === 'boolean') {
    return [
      emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_BOOL`, context),
      `double ${name} = (double)(${value}.as.boolean != 0);`
    ]
  }

  return [emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_NUMBER`, context), `double ${name} = ${value}.as.number;`]
}

function emitPreparedArrayReceiver(
  expression: ArrayMaybeNode,
  context: ArrayFunctionContext
): PreparedArrayReceiver | null {
  if (expression == null) {
    return null
  }

  if (expression.type === 'ArrayLiteral') {
    const value = arrayDeps(context).emitCArrayLiteralValueExpression(expression, context)
    const elements: CArrayElementInfo[] = []

    const sourceElements: ArrayNode[] = expression.elements

    for (const element of sourceElements) {
      elements.push({
        valueType: arrayDeps(context).inferExpressionType(element, context)
      })
    }

    return {
      lines: value.lines,
      expression: value.expression,
      elementType: resolveForOfElementType(elements)
    }
  }

  if (expression.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]

    if (context.variables.get(name) !== 'array') {
      return null
    }

    let elementType = context.runtimeArrayElementTypes.get(name)

    if (elementType == null) {
      const shape = findArrayShape(context, name)

      if (shape == null) {
        elementType = resolveForOfElementType([])
      } else {
        elementType = resolveForOfElementType(shape)
      }
    }

    return {
      lines: [],
      expression: name,
      elementType
    }
  }

  if (expression.type === 'MemberExpression' || expression.type === 'IndexExpression') {
    const valueType = arrayDeps(context).inferExpressionType(expression, context)

    if (valueType !== 'array') {
      return null
    }

    const value = arrayDeps(context).emitCValueExpression(expression, context)

    return {
      lines: value.lines,
      expression: value.expression,
      elementType: resolvePreparedArrayReceiverElementType(expression, context)
    }
  }

  if (expression.type === 'CallExpression') {
    const valueType = arrayDeps(context).inferExpressionType(expression, context)

    if (valueType !== 'array') {
      return null
    }

    let call = emitPreparedArrayMapCallExpression(expression, context)

    if (call == null) {
      call = emitPreparedArrayFilterCallExpression(expression, context)
    }

    if (call == null) {
      call = emitPreparedArraySliceCallExpression(expression, context)
    }

    if (call == null) {
      call = emitPreparedArraySortCallExpression(expression, context)
    }

    if (call == null) {
      call = arrayDeps(context).emitCStringSplitValueExpression(expression, context)
    }

    if (call != null) {
      return {
        lines: call.lines,
        expression: call.expression,
        elementType: call.elementType
      }
    }

    return null
  }

  return null
}

function resolvePreparedArrayReceiverElementType(expression: AnyNode, context: ArrayFunctionContext): string {
  const runtimeElementType = resolveRuntimeArrayElementType(expression, context)

  if (runtimeElementType != null) {
    return runtimeElementType
  }

  if (expression.arrayElementType != null) {
    return expression.arrayElementType
  }

  return 'unknown'
}
