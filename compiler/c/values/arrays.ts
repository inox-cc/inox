import { memberExpressionPath } from '../../member-paths.ts'
import {
  arrayElementTypeNameFromTypeName,
  isArrayTypeName,
  isBuiltinValueType,
  nullableTypeNameFromTypeName
} from '../../type-names.ts'
import type { AnyNode, SourceLocation } from '../../types.ts'
import type { CFunctionContextWithDependencies } from '../context.ts'
import {
  emitPrepareOwnedValueWrite,
  emitFailureStatement,
  emitRuntimeTypeCheck,
  nextCName,
  registerOwnedValue
} from '../context.ts'
import { emitCIdentifier } from '../identifiers.ts'
import { emitRuntimeFieldValueCheck, runtimeObjectLikeValueMismatchCondition } from '../runtime-values.ts'
import type {
  CArrayElementInfo,
  CFunctionType,
  CKnownArrayElement,
  CObjectFieldInfo,
  CRuntimeArrayElement,
  CPreparedCallOptions as PreparedCallOptions,
  CPreparedExpression as PreparedExpression,
  CPreparedStringBytesOperand as PreparedStringBytesOperand,
  CTypeRefMap
} from '../types.ts'
import { cTypeRefMapValue } from '../types.ts'
import {
  applyLibraryNativeValueAdapter,
  cIterableElementFunctionType,
  cIterableElementValueType,
  cRuntimeValueTag,
  compilerLibraryIntrinsicNativeCppType,
  compilerLibraryIntrinsicNativeValueAdapter,
  libraryNativeCppType,
  libraryNativeValueAdapter
} from '../value-types.ts'
import { emitCConditionClause } from './expressions.ts'
import { emitSliceIndexNormalizationLines } from './slices.ts'
import {
  anyNodeLikeArrayFieldElementValueType,
  inferExpressionType,
  isAnyNodeLikeArrayFieldName,
  isAnyNodeLikeDeclaredType
} from './types.ts'

type CNumberMap = Map<string, number>

type ArrayFunctionContext = CFunctionContextWithDependencies<
  ArrayLoweringDependencies,
  object,
  object,
  object,
  object,
  object
>


export type ArrayLoweringDependencies = {
  emitCArrayLiteralValueExpression(expression: AnyNode, context: ArrayFunctionContext): PreparedExpression
  emitCStringSplitValueExpression(expression: AnyNode, context: ArrayFunctionContext): PreparedArrayExpression | null
  emitCValueExpression(expression: AnyNode, context: ArrayFunctionContext): PreparedExpression
  emitPreparedCppStringArgument(
    expression: AnyNode,
    context: ArrayFunctionContext,
    tempPrefix: string
  ): PreparedExpression | null
  emitPreparedStringBytesOperand(
    expression: AnyNode | null | undefined,
    context: ArrayFunctionContext,
    tempPrefix: string
  ): PreparedStringBytesOperand
  emitPreparedNumberExpression(expression: AnyNode, context: ArrayFunctionContext): PreparedExpression
  inferExpressionType(expression: AnyNode, context: ArrayFunctionContext): string
  isStringSplitCall(expression: AnyNode, context: ArrayFunctionContext): boolean
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
  cppType?: string
  valueAdapter?: string | null
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

function arrayDeps(context: ArrayFunctionContext): ArrayLoweringDependencies {
  const deps = context.arrayLoweringDependencies

  if (deps !== null && typeof deps !== 'undefined') {
    return deps
  }

  throw new Error('array lowering dependencies are not configured')
}

function optionalArrayDeps(context: ArrayFunctionContext): ArrayLoweringDependencies | null {
  if (context.arrayLoweringDependencies === null || typeof context.arrayLoweringDependencies === 'undefined') {
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

function emitArrayThrownCheck(context: ArrayFunctionContext): string {
  const target = context.errorTargets.length === 0 ? null : context.errorTargets[context.errorTargets.length - 1]

  if (target !== null && typeof target !== 'undefined') {
    return `if (inox::thrown()) goto ${target};`
  }

  return `if (inox::thrown()) ${emitFailureStatement(context)}`
}

function ensureArrayShapes(context: ArrayFunctionContext): Map<string, CArrayElementInfo[]> {
  let shapes = context.arrayShapes

  if (shapes !== null && typeof shapes !== 'undefined') {
    return shapes
  }

  const nextShapes: Map<string, CArrayElementInfo[]> = new Map()
  context.arrayShapes = nextShapes

  return nextShapes
}

function ensureArrayLengths(context: ArrayFunctionContext): CNumberMap {
  let lengths = context.arrayLengths

  if (lengths !== null && typeof lengths !== 'undefined') {
    return lengths
  }

  const nextLengths: CNumberMap = new Map()
  context.arrayLengths = nextLengths

  return nextLengths
}


function findArrayShape(context: ArrayFunctionContext, name: string): CArrayElementInfo[] | null {
  if (context.arrayShapes === null || typeof context.arrayShapes === 'undefined') {
    return null
  }

  const shape = context.arrayShapes.get(name)

  if (shape === null || typeof shape === 'undefined') {
    return null
  }

  return shape
}

function resolveFunctionReturnIterableElementType(context: ArrayFunctionContext, name: string): string | null {
  const returnTypeRef = cTypeRefMapValue(context.functionReturnTypeRefs, name)
  return cIterableElementValueType(returnTypeRef, context.libraries)
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

  if (deps !== null && typeof deps !== 'undefined') {
    return deps.inferExpressionType(expression, context)
  }

  if (
    expression.valueType !== null &&
    typeof expression.valueType !== 'undefined' &&
    expression.valueType !== 'unknown'
  ) {
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
    const name = expression.path[0]
    const valueType = context.variables.get(name)

    if (valueType !== null && typeof valueType !== 'undefined') {
      return valueType
    }

    if (context.runtimeArrayElementTypes.has(name) || context.arrayShapes.has(name)) {
      return 'array'
    }
  }

  return 'unknown'
}

function cloneArrayShape(shape: CArrayElementInfo[]): CArrayElementInfo[] {
  const out: CArrayElementInfo[] = []

  for (const element of shape) {
    out.push({
      functionType: element.functionType ?? null,
      valueType: element.valueType
    })
  }

  return out
}

function arrayElementInfoAt(elements: CArrayElementInfo[], index: number): CArrayElementInfo {
  return elements[index]
}

function arrayElementInfoWithoutLast(elements: CArrayElementInfo[]): CArrayElementInfo[] {
  const out: CArrayElementInfo[] = []

  for (let index = 0; index < elements.length - 1; index = index + 1) {
    out.push(arrayElementInfoAt(elements, index))
  }

  return out
}


export function isArrayIncludesCall(expression: ArrayMaybeNode): boolean {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'CallExpression') {
    return false
  }

  const callee = expression.callee

  return callee.type === 'MemberExpression' && callee.property === 'includes'
}

export function isArrayJoinCall(expression: ArrayMaybeNode, context: ArrayFunctionContext): boolean {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'CallExpression' ||
    expression.args.length > 1
  ) {
    return false
  }

  const callee = expression.callee

  if (callee.type !== 'MemberExpression' || callee.property !== 'join') {
    return false
  }

  const elementType = resolveArrayJoinReceiverElementType(callee.object, context)

  return elementType !== null && typeof elementType !== 'undefined' && isSupportedRuntimeArrayElementType(elementType)
}

export function isArrayUnshiftCall(expression: ArrayMaybeNode): boolean {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'CallExpression') {
    return false
  }

  const callee = expression.callee

  return callee.type === 'MemberExpression' && callee.property === 'unshift'
}

export function isArrayLengthExpression(expression: ArrayMaybeNode, context: ArrayFunctionContext): boolean {
  if (expression === null || typeof expression === 'undefined') {
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
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'IndexExpression') {
    return null
  }

  const object = expression.object
  const indexExpression = expression.index

  if (object.type !== 'Reference' || object.path.length !== 1 || indexExpression.type !== 'NumberLiteral') {
    return null
  }

  const path: string[] = object.path
  const arrayName = path[0]
  const elements = findArrayShape(context, arrayName)

  if (elements !== null && typeof elements !== 'undefined') {
    const index = parseArrayIndex(indexExpression.value)

    if (index < 0 || index >= elements.length) {
      return null
    }

    const element = arrayElementInfoAt(elements, index)

    return {
      arrayName,
      index,
      functionType: element.functionType ?? null,
      valueType: element.valueType
    }
  }

  return null
}

export function resolveRuntimeArrayIndex(
  expression: ArrayMaybeNode,
  context: ArrayFunctionContext
): CRuntimeArrayElement | null {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'IndexExpression') {
    return null
  }

  const valueType = resolveRuntimeArrayElementType(expression.object, context)
  const functionType = resolveRuntimeArrayElementFunctionType(expression.object, context)

  if (valueType === null || typeof valueType === 'undefined') {
    return null
  }

  if (expression.index.type !== 'NumberLiteral') {
    if (inferArrayMetadataExpressionType(expression.index, context) !== 'number') {
      return null
    }

    return {
      functionType,
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
    functionType,
    index,
    indexExpression: null,
    valueType
  }
}

export function resolveOptionalRuntimeArrayIndex(
  expression: ArrayMaybeNode,
  context: ArrayFunctionContext
): CRuntimeArrayElement | null {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'OptionalIndexExpression') {
    return null
  }

  const valueType = resolveRuntimeArrayElementType(expression.object, context)
  const functionType = resolveRuntimeArrayElementFunctionType(expression.object, context)

  if (valueType === null || typeof valueType === 'undefined') {
    return null
  }

  if (expression.index.type !== 'NumberLiteral') {
    if (inferArrayMetadataExpressionType(expression.index, context) !== 'number') {
      return null
    }

    return {
      functionType,
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
    functionType,
    index,
    indexExpression: null,
    valueType
  }
}

function resolveRuntimeArrayElementFunctionType(
  expression: ArrayMaybeNode,
  context: ArrayFunctionContext
): CFunctionType | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  const typeRefFunctionType = cIterableElementFunctionType(
    expression.typeRef,
    context.libraries,
    arrayExpressionSourceLocation(expression)
  )

  if (typeRefFunctionType !== null) {
    return typeRefFunctionType
  }

  if (expression.type === 'Reference') {
    const path: string[] = expression.path

    if (path.length !== 1) {
      return null
    }

    const shape = findArrayShape(context, path[0])

    if (shape !== null && typeof shape !== 'undefined') {
      return resolveForOfElementFunctionType(shape)
    }
  }

  return null
}

function arrayExpressionSourceLocation(expression: AnyNode): SourceLocation {
  let loc: SourceLocation = { line: 1, column: 1 }
  const expressionLoc = expression.loc

  if (expressionLoc !== null && typeof expressionLoc !== 'undefined') {
    loc = expressionLoc
  }

  return loc
}

export function resolveRuntimeArrayElementType(
  expression: ArrayMaybeNode,
  context: ArrayFunctionContext
): string | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  const typeRefElementValueType = cIterableElementValueType(expression.typeRef, context.libraries)

  if (typeRefElementValueType !== null) {
    return typeRefElementValueType
  }

  const declaredElementValueType = declaredArrayElementValueType(expression.declaredType)

  if (declaredElementValueType !== null) {
    return declaredElementValueType
  }

  if (expression.type === 'Reference') {
    const path: string[] = expression.path

    if (path.length !== 1) {
      return null
    }

    const name: string = path[0]
    const runtimeElementType = context.runtimeArrayElementTypes.get(name)

    if (runtimeElementType !== null && typeof runtimeElementType !== 'undefined') {
      return runtimeElementType
    }

    const shape = findArrayShape(context, name)

    if (shape !== null && typeof shape !== 'undefined') {
      return resolveForOfElementType(shape)
    }

    return null
  }

  if (expression.type === 'CallExpression') {
    const functionReturn = resolveFunctionReturnNameFromCall(expression)
    const objectRuntimeCall = objectRuntimeArrayCallName(expression)

    if (objectRuntimeCall !== null && typeof objectRuntimeCall !== 'undefined') {
      if (objectRuntimeCall === 'entries') {
        return 'array'
      }

      if (objectRuntimeCall === 'keys') {
        return 'string'
      }

      return 'unknown'
    }

    if (expression.valueType !== 'array') {
      if (functionReturn !== null && typeof functionReturn !== 'undefined') {
        const functionReturnType = context.functionReturnTypes.get(functionReturn)

        if (functionReturnType === 'array') {
          const functionElementType = resolveFunctionReturnIterableElementType(context, functionReturn)

          if (functionElementType !== null && typeof functionElementType !== 'undefined') {
            return functionElementType
          }

          return 'unknown'
        }
      }

      return null
    }

    if (functionReturn !== null && typeof functionReturn !== 'undefined') {
      const functionElementType = resolveFunctionReturnIterableElementType(context, functionReturn)

      if (functionElementType !== null && typeof functionElementType !== 'undefined') {
        return functionElementType
      }
    }

    return 'unknown'
  }

  if (expression.type === 'MemberExpression') {
    const deps = optionalArrayDeps(context)
    let member: CObjectFieldInfo | null = null

    if (deps !== null && typeof deps !== 'undefined') {
      member = deps.resolveKnownObjectMember(expression, context)
    }

    if (
      deps !== null &&
      typeof deps !== 'undefined' &&
      isAnyNodeLikeArrayFieldReceiver(expression, context, deps)
    ) {
      const fieldName = anyNodeLikeArrayFieldReceiverName(expression)

      if (fieldName !== null && typeof fieldName !== 'undefined') {
        const elementValueType = anyNodeLikeArrayFieldElementValueType(fieldName)

        if (elementValueType !== null) {
          return elementValueType
        }
      }

      if (isAnyNodeLikeBlockBodyArrayReceiver(expression, context)) {
        return 'object'
      }
    }

    if (member !== null && typeof member !== 'undefined') {
      if (member.valueType !== 'array') {
        return null
      }

      return cIterableElementValueType(member.typeRef, context.libraries) ?? 'unknown'
    }

    if (
      deps !== null &&
      typeof deps !== 'undefined' &&
      deps.inferExpressionType(expression.object, context) === 'object'
    ) {
      return 'unknown'
    }

    return null
  }

  if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
    const deps = optionalArrayDeps(context)
    let field: CObjectFieldInfo | null = null

    if (deps !== null && typeof deps !== 'undefined') {
      field = deps.resolveKnownObjectIndex(expression, context)
    }

    if (field !== null && typeof field !== 'undefined') {
      if (field.valueType !== 'array') {
        return null
      }

      return cIterableElementValueType(field.typeRef, context.libraries) ?? 'unknown'
    }

    if (
      deps !== null &&
      typeof deps !== 'undefined' &&
      deps.inferExpressionType(expression.object, context) === 'object'
    ) {
      return 'unknown'
    }

    return null
  }

  if (expression.type === 'IndexExpression' && expression.object.type === 'CallExpression') {
    const objectRuntimeCall = objectRuntimeArrayCallName(expression.object)

    if (objectRuntimeCall === 'entries') {
      return 'unknown'
    }
  }

  if (expression.valueType === 'array') {
    return 'unknown'
  }

  return null
}

function declaredArrayElementValueType(declaredType: string | null | undefined): string | null {
  if (declaredType === null || typeof declaredType === 'undefined') {
    return null
  }

  const rawElementType = arrayElementTypeNameFromTypeName(declaredType)

  if (rawElementType === null) {
    return null
  }

  const elementType = nullableTypeNameFromTypeName(rawElementType) ?? rawElementType

  if (isArrayTypeName(elementType)) {
    return 'array'
  }

  if (isBuiltinValueType(elementType)) {
    return elementType
  }

  return 'object'
}

function objectRuntimeArrayCallName(expression: ArrayMaybeNode): string | null {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'CallExpression' ||
    expression.args.length !== 1
  ) {
    return null
  }

  if (
    expression.objectRuntimeMethod === 'values' ||
    expression.objectRuntimeMethod === 'entries' ||
    expression.objectRuntimeMethod === 'keys'
  ) {
    return expression.objectRuntimeMethod
  }

  const path = memberExpressionPath(expression.callee)

  if (
    path !== null &&
    typeof path !== 'undefined' &&
    path.length === 2 &&
    path[0] === 'Object' &&
    (path[1] === 'values' || path[1] === 'entries' || path[1] === 'keys')
  ) {
    return path[1]
  }

  return null
}

function isNativeClassObjectRuntimeArgument(expression: ArrayMaybeNode, context: ArrayFunctionContext): boolean {
  if (expression === null || typeof expression === 'undefined') {
    return false
  }

  if (
    expression.valueType !== null &&
    typeof expression.valueType !== 'undefined' &&
    expression.valueType.startsWith('class:')
  ) {
    return true
  }

  if (expression.type !== 'Reference' || expression.path.length !== 1) {
    return false
  }

  const path: string[] = expression.path
  const name = path[0]
  const variableType = context.variables.get(name)

  if (
    variableType !== null &&
    typeof variableType !== 'undefined' &&
    variableType.startsWith('class:')
  ) {
    return true
  }

  return context.classInstanceTypes.has(name)
}

function resolveFunctionReturnNameFromCall(expression: ArrayMaybeNode): string | null {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'CallExpression') {
    return null
  }

  const callee = expression.callee

  if (callee.type !== 'Reference' || callee.path.length !== 1) {
    return null
  }

  const path: string[] = callee.path

  return path[0]
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
  const arrayFacade = preparedRuntimeArrayFacadeExpression(expression.object, array, context)
  const lines: string[] = []

  appendLines(lines, array.lines)
  appendLines(lines, index.lines)
  lines.push(`inox::Value ${value};`)
  appendLines(lines, emitRuntimeArrayGetAllowMissing(arrayFacade, index.expression, value, context))

  return {
    lines,
    expression: value,
    cppType: 'inox::Value',
    owned: false
  }
}

function preparedRuntimeArrayFacadeExpression(
  expression: AnyNode,
  value: PreparedExpression,
  context: ArrayFunctionContext
): string {
  if (
    value.cppType !== null &&
    typeof value.cppType !== 'undefined' &&
    value.cppType !== 'inox::Value' &&
    value.cppType !== 'inox_value'
  ) {
    return value.expression
  }

  return applyLibraryNativeValueAdapter(value.expression, arrayNativeValueAdapter(expression, context))
}

function arrayNativeValueAdapter(expression: AnyNode, context: ArrayFunctionContext): string | null {
  return (
    libraryNativeValueAdapter(expression.shape) ??
    compilerLibraryIntrinsicNativeValueAdapter(context.libraries, 'array-literal') ??
    null
  )
}

function arrayNativeCppType(context: ArrayFunctionContext): string | undefined {
  return compilerLibraryIntrinsicNativeCppType(context.libraries, 'array-literal') ?? undefined
}

function emitRuntimeArrayGetAllowMissing(
  arrayFacadeExpression: string,
  indexExpression: string,
  out: string,
  context: ArrayFunctionContext
): string[] {
  return [
    `${out} = ${arrayFacadeExpression}.get(${indexExpression});`,
    emitArrayThrownCheck(context)
  ]
}

function emitObjectRuntimeArrayIndexGetAllowMissing(
  method: string,
  objectExpression: string,
  indexExpression: string,
  out: string,
  context: ArrayFunctionContext
): string[] {
  const call =
    method === 'values'
      ? `inox::object_value_at(${objectExpression}, ${indexExpression})`
      : `inox::object_entry_at(${objectExpression}, ${indexExpression})`

  return [
    `auto ${out} = ${call};`,
    `if (inox::thrown()) ${emitFailureStatement(context)}`
  ]
}

function emitPreparedRuntimeArrayIndexExpression(
  element: CRuntimeArrayElement,
  context: ArrayFunctionContext
): PreparedExpression {
  const indexExpression = element.indexExpression

  if (indexExpression === null || typeof indexExpression === 'undefined') {
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

  if (element !== null && typeof element !== 'undefined') {
    const elementValueType = element.valueType

    if (elementValueType !== 'array' && elementValueType !== 'string') {
      return null
    }

    const temp = nextCName(context, 'inox_value')
    let tag = 'INOX_TAG_STRING'

    if (elementValueType === 'array') {
      tag = 'INOX_TAG_ARRAY'
    }

    registerOwnedValue(context, temp)
    const lines: string[] = []
    const facade = applyLibraryNativeValueAdapter(
      element.arrayName,
      arrayNativeValueAdapter(expression.object, context)
    )

    appendLines(lines, emitPrepareOwnedValueWrite(temp))
    lines.push(`${temp} = ${facade}.get(${element.index});`)
    lines.push(emitRuntimeTypeCheck('inox::thrown()', context))
    appendLines(lines, emitRuntimeFieldValueCheck(temp, tag, expression, context))

    return {
      lines,
      expression: temp,
      owned: true
    }
  }

  return null
}

export function emitPreparedObjectRuntimeArrayIndexValueExpression(
  expression: AnyNode,
  context: ArrayFunctionContext,
  targetName?: string
): PreparedExpression | null {
  if (expression.type !== 'IndexExpression' || expression.object.type !== 'CallExpression') {
    return null
  }

  const method = objectRuntimeArrayCallName(expression.object)

  if (method !== 'values' && method !== 'entries') {
    return null
  }

  const runtimeElement = resolveRuntimeArrayIndex(expression, context)

  if (runtimeElement === null || typeof runtimeElement === 'undefined') {
    return null
  }

  const source = expression.object.args[0]

  if (isNativeClassObjectRuntimeArgument(source, context)) {
    return null
  }

  const object = arrayDeps(context).emitCValueExpression(source, context)
  const index = emitPreparedRuntimeArrayIndexExpression(runtimeElement, context)
  const value = targetName ?? nextCName(context, method === 'values' ? 'inox_object_value' : 'inox_object_entry')
  const lines: string[] = []

  appendLines(lines, object.lines)
  appendLines(lines, index.lines)
  appendLines(
    lines,
    emitObjectRuntimeArrayIndexGetAllowMissing(method, object.expression, index.expression, value, context)
  )

  const tag = cRuntimeValueTag(runtimeElement.valueType) ?? ''

  if (method !== 'entries' && tag !== '') {
    appendLines(lines, emitRuntimeArrayIndexValueCheck(value, tag, expression, context))
  }

  return {
    lines,
    expression: value,
    cppType: 'inox::Value',
    owned: false,
    runtimeTypeChecked: method === 'entries' || tag !== '',
    valueType: runtimeElement.valueType
  }
}

export function emitPreparedRuntimeArrayIndexValueExpression(
  expression: AnyNode,
  context: ArrayFunctionContext
): PreparedExpression | null {
  const runtimeElement = resolveRuntimeArrayIndex(expression, context)

  if (runtimeElement !== null && typeof runtimeElement !== 'undefined') {
    const value = emitPreparedRuntimeArrayIndexValue(expression, runtimeElement, context, 'inox_value')

    if (runtimeElement.valueType === 'string') {
      const lines: string[] = []

      appendLines(lines, value.lines)
      appendLines(lines, emitRuntimeArrayIndexValueCheck(value.expression, 'INOX_TAG_STRING', expression, context))

      return {
        lines,
        expression: value.expression,
        owned: value.owned,
        runtimeTypeChecked: true,
        valueType: runtimeElement.valueType
      }
    }

    const tag =
      runtimeElement.valueType === 'object' && libraryNativeCppType(expression.shape) !== null
        ? ''
        : (cRuntimeValueTag(runtimeElement.valueType) ?? '')

    if (tag === '') {
      return value
    }

    const checkedLines: string[] = []

    appendLines(checkedLines, value.lines)
    appendLines(checkedLines, emitRuntimeArrayIndexValueCheck(value.expression, tag, expression, context))

    return {
      lines: checkedLines,
      expression: value.expression,
      owned: value.owned,
      runtimeTypeChecked: true,
      valueType: runtimeElement.valueType
    }
  }

  return null
}

function emitRuntimeArrayIndexValueCheck(
  value: string,
  expectedTag: string,
  expression: AnyNode,
  context: ArrayFunctionContext
): string[] {
  let missingCheck = `${value}.tag != INOX_TAG_UNDEFINED`

  if (expression.nullable === true) {
    missingCheck = `${missingCheck} && ${value}.tag != INOX_TAG_NULL`
  }

  if (expectedTag === 'INOX_TAG_BOOL' || expectedTag === 'INOX_TAG_NUMBER') {
    return [emitRuntimeTypeCheck(`${missingCheck} && ${value}.tag != ${expectedTag}`, context)]
  }

  if (expectedTag === 'INOX_TAG_OBJECT') {
    return [
      emitRuntimeTypeCheck(
        `${missingCheck} && (${runtimeObjectLikeValueMismatchCondition(value)})`,
        context
      )
    ]
  }

  return [
    emitRuntimeTypeCheck(
      `${missingCheck} && (${value}.tag != ${expectedTag} || ${value}.as.ref == 0)`,
      context
    )
  ]
}

export function resolveKnownArrayLength(expression: ArrayMaybeNode, context: ArrayFunctionContext): string | null {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'MemberExpression' ||
    expression.property !== 'length'
  ) {
    return null
  }

  if (expression.object.type === 'ArrayLiteral') {
    return `${expression.object.elements.length}`
  }

  if (expression.object.type !== 'Reference' || expression.object.path.length !== 1) {
    return null
  }

  const path: string[] = expression.object.path
  const arrayName = path[0]
  const length = context.arrayLengths.get(arrayName)

  if (length === null || typeof length === 'undefined') {
    return null
  }

  return `${length}`
}

export function emitPreparedArrayLengthExpression(
  expression: ArrayMaybeNode,
  context: ArrayFunctionContext
): PreparedExpression | null {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'MemberExpression' ||
    expression.property !== 'length'
  ) {
    return null
  }

  let receiver = emitPreparedArrayReceiver(expression.object, context)

  if (receiver === null) {
    const deps = arrayDeps(context)

    if (!isArrayLengthReceiver(expression.object, context, deps)) {
      return null
    }

    const valueAdapter = arrayNativeValueAdapter(expression.object, context)

    if (valueAdapter === null) {
      return null
    }

    const value = deps.emitCValueExpression(expression.object, context)

    receiver = {
      lines: value.lines,
      expression: value.expression,
      elementType: 'unknown',
      cppType: value.cppType,
      valueAdapter
    }
  }

  const temp = nextCName(context, 'inox_array_len')
  const facade = preparedArrayReceiverFacadeExpression(receiver)
  const lines: string[] = []

  appendLines(lines, receiver.lines)
  lines.push(`size_t ${temp} = ${facade}.length();`)
  lines.push(emitArrayThrownCheck(context))

  return {
    lines,
    expression: `((double)${temp})`
  }
}

function isArrayLengthReceiver(
  expression: ArrayMaybeNode,
  context: ArrayFunctionContext,
  deps: ArrayLoweringDependencies
): boolean {
  if (expression === null || typeof expression === 'undefined') {
    return false
  }

  const inferredType = deps.inferExpressionType(expression, context)

  if (inferredType === 'string' || expression.valueType === 'string') {
    return false
  }

  if (inferredType === 'array') {
    return true
  }

  if (expression.valueType === 'array') {
    return true
  }

  if (expression.type === 'Reference') {
    const path: string[] = expression.path

    if (path.length === 1) {
      const name: string = path[0]

      return (
        context.variables.get(name) === 'array' ||
        context.runtimeArrayElementTypes.has(name) ||
        context.arrayShapes.has(name)
      )
    }

    return isAnyNodeLikeArrayFieldReceiver(expression, context, deps)
  }

  if (isAnyNodeLikeArrayFieldReceiver(expression, context, deps)) {
    return true
  }

  return isDynamicObjectArrayLengthReceiver(expression, context, deps)
}

function isAnyNodeLikeArrayFieldReceiver(
  expression: ArrayMaybeNode,
  context: ArrayFunctionContext,
  deps: ArrayLoweringDependencies
): boolean {
  if (expression === null || typeof expression === 'undefined') {
    return false
  }

  if (isAnyNodeLikeBlockBodyArrayReceiver(expression, context)) {
    return true
  }

  const fieldName = anyNodeLikeArrayFieldReceiverName(expression)

  if (fieldName === null || typeof fieldName === 'undefined' || !isAnyNodeLikeArrayFieldName(fieldName)) {
    return false
  }

  const rootName = anyNodeLikeArrayFieldReceiverRootName(expression)

  if (rootName === null || typeof rootName === 'undefined') {
    return false
  }

  const declaredType = context.objectDeclaredTypes.get(rootName)
  const declaredAnyNode =
    declaredType !== null &&
    typeof declaredType !== 'undefined' &&
    isAnyNodeLikeDeclaredType(declaredType)

  if (declaredAnyNode) {
    return true
  }

  const knownField = anyNodeLikeKnownArrayField(expression, context, deps)

  if (knownField !== null && typeof knownField !== 'undefined') {
    return knownField.valueType === 'array'
  }

  return context.variables.get(rootName) === 'object'
}

function isAnyNodeLikeBlockBodyArrayReceiver(expression: ArrayMaybeNode, context: ArrayFunctionContext): boolean {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'MemberExpression') {
    return false
  }

  if (expression.property !== 'body') {
    return false
  }

  const outerBody = expression.object

  if (outerBody.type !== 'MemberExpression' || outerBody.property !== 'body') {
    return false
  }

  const rootName = anyNodeLikeArrayFieldReceiverRootName(expression)

  if (rootName === null || typeof rootName === 'undefined') {
    return false
  }

  const declaredType = context.objectDeclaredTypes.get(rootName)

  if (
    declaredType !== null &&
    typeof declaredType !== 'undefined' &&
    isAnyNodeLikeDeclaredType(declaredType)
  ) {
    return true
  }

  return context.variables.get(rootName) === 'object'
}

function anyNodeLikeKnownArrayField(
  expression: ArrayMaybeNode,
  context: ArrayFunctionContext,
  deps: ArrayLoweringDependencies
): CObjectFieldInfo | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  if (expression.type === 'MemberExpression') {
    return deps.resolveKnownObjectMember(expression, context)
  }

  if (expression.type === 'IndexExpression') {
    return deps.resolveKnownObjectIndex(expression, context)
  }

  return null
}

function anyNodeLikeArrayFieldReceiverName(expression: ArrayMaybeNode): string | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  if (expression.type === 'MemberExpression') {
    return expression.property
  }

  if (expression.type === 'Reference' && expression.path.length > 1) {
    return expression.path[expression.path.length - 1]
  }

  if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
    return expression.index.value
  }

  return null
}

function anyNodeLikeArrayFieldReceiverRootName(expression: ArrayMaybeNode): string | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  if (expression.type === 'Reference' && expression.path.length > 1) {
    return expression.path[0]
  }

  let current: AnyNode = expression

  while (
    current.type === 'MemberExpression' ||
    current.type === 'OptionalMemberExpression' ||
    current.type === 'IndexExpression' ||
    current.type === 'OptionalIndexExpression'
  ) {
    current = current.object
  }

  if (current.type !== 'Reference' || current.path.length !== 1) {
    return null
  }

  return current.path[0]
}

function isDynamicObjectArrayLengthReceiver(
  expression: ArrayMaybeNode,
  context: ArrayFunctionContext,
  deps: ArrayLoweringDependencies
): boolean {
  if (expression === null || typeof expression === 'undefined') {
    return false
  }

  if (expression.type === 'MemberExpression') {
    const member = deps.resolveKnownObjectMember(expression, context)

    if (member !== null && typeof member !== 'undefined') {
      return false
    }

    return deps.inferExpressionType(expression.object, context) === 'object'
  }

  if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
    const field = deps.resolveKnownObjectIndex(expression, context)

    if (field !== null && typeof field !== 'undefined') {
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
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'Reference' ||
    expression.path.length !== 1
  ) {
    return null
  }

  const name = expression.path[0]
  const elements = findArrayShape(context, name)

  if (elements === null || typeof elements === 'undefined') {
    return null
  }

  return {
    name: emitArrayReferenceName(name, context),
    elements
  }
}

export function resolveRuntimeForOfArray(
  expression: ArrayMaybeNode,
  context: ArrayFunctionContext
): RuntimeForOfArray | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  const elementType = resolveRuntimeArrayElementType(expression, context)

  if (elementType === null || typeof elementType === 'undefined') {
    return null
  }

  if (expression.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]

    return {
      name: emitArrayReferenceName(name, context),
      elementType,
      lines: []
    }
  }

  const value = arrayDeps(context).emitCValueExpression(expression, context)

  return {
    name: value.expression,
    elementType,
    lines: withoutTrailingRuntimeArrayValueCheck(value.lines, value.expression)
  }
}

function withoutTrailingRuntimeArrayValueCheck(lines: string[], expression: string): string[] {
  if (lines.length === 0) {
    return lines
  }

  const lastLine = lines[lines.length - 1]
  const checkPrefix = `if (${expression}.tag != INOX_TAG_ARRAY || ${expression}.as.ref == 0) `

  if (lastLine.startsWith(checkPrefix)) {
    return lines.slice(0, -1)
  }

  return lines
}

function emitArrayReferenceName(name: string, context: ArrayFunctionContext): string {
  if (context.localValueNames.has(name)) {
    return emitCIdentifier(name)
  }

  return context.moduleValueNames.get(name) ?? emitCIdentifier(name)
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

function resolveForOfElementFunctionType(elements: CArrayElementInfo[]): CFunctionType | null {
  if (elements.length === 0) {
    return null
  }

  const first = arrayElementInfoAt(elements, 0)
  const firstFunctionType = first.functionType

  if (firstFunctionType === null || typeof firstFunctionType === 'undefined') {
    return null
  }

  const sourceElements: CArrayElementInfo[] = elements

  for (const element of sourceElements) {
    if (element.functionType !== firstFunctionType) {
      return null
    }
  }

  return firstFunctionType
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

  if (elements !== null && typeof elements !== 'undefined') {
    if (element.index < 0 || element.index >= elements.length) {
      return
    }

    elements[element.index] = {
      functionType: null,
      valueType
    }
  }
}


export function emitArraySliceVariableDeclaration(
  statement: AnyNode,
  sliced: PreparedArrayExpression,
  context: ArrayFunctionContext
): string[] {
  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'array')

  const elementType = cIterableElementValueType(statement.typeRef, context.libraries) ?? sliced.elementType

  context.runtimeArrayElementTypes.set(statement.name, elementType)

  const lines: string[] = []

  appendLines(lines, sliced.lines)
  lines.push(`${statement.name} = ${sliced.expression};`)

  return lines
}


export function emitPreparedArraySliceCallExpression(
  expression: ArrayMaybeNode,
  context: ArrayFunctionContext
): PreparedArrayExpression | null {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'CallExpression') {
    return null
  }

  const callee = expression.callee

  if (callee.type !== 'MemberExpression' || callee.property !== 'slice' || expression.args.length > 2) {
    return null
  }

  const receiver = emitPreparedArrayReceiver(callee.object, context)

  if (receiver === null || typeof receiver === 'undefined') {
    return null
  }

  let start: PreparedExpression = {
    lines: [],
    expression: '0'
  }
  const lengthName = nextCName(context, 'inox_array_slice_length')
  const startRaw = nextCName(context, 'inox_array_slice_start_raw')
  const startIndex = nextCName(context, 'inox_array_slice_start')
  const endRaw = nextCName(context, 'inox_array_slice_end_raw')
  const endIndex = nextCName(context, 'inox_array_slice_end')
  let end: PreparedExpression = {
    lines: [],
    expression: `((double)${lengthName})`
  }
  const out = nextCName(context, 'inox_array_slice')
  const facade = preparedArrayReceiverFacadeExpression(receiver)
  const lines: string[] = []

  if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
    start = arrayDeps(context).emitPreparedNumberExpression(expression.args[0], context)
  }

  if (expression.args[1] !== null && typeof expression.args[1] !== 'undefined') {
    end = arrayDeps(context).emitPreparedNumberExpression(expression.args[1], context)
  }

  appendLines(lines, receiver.lines)
  appendLines(lines, start.lines)
  appendLines(lines, end.lines)
  lines.push(`size_t ${lengthName} = ${facade}.length();`)
  lines.push(emitArrayThrownCheck(context))
  lines.push(`double ${startRaw} = ${start.expression};`)
  lines.push(`double ${endRaw} = ${end.expression};`)
  appendLines(
    lines,
    emitSliceIndexNormalizationLines(startRaw, lengthName, startIndex, context, 'inox_array_slice_start')
  )
  appendLines(lines, emitSliceIndexNormalizationLines(endRaw, lengthName, endIndex, context, 'inox_array_slice_end'))
  lines.push(`if (${endIndex} < ${startIndex}) ${endIndex} = ${startIndex};`)
  lines.push(`auto ${out} = ${facade}.slice(${startIndex}, ${endIndex});`)
  lines.push(emitArrayThrownCheck(context))

  return {
    lines,
    expression: out,
    elementType: receiver.elementType,
    cppType: arrayNativeCppType(context)
  }
}

export function emitPreparedArrayJoinCallExpression(
  expression: ArrayMaybeNode,
  context: ArrayFunctionContext
): PreparedExpression | null {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'CallExpression') {
    return null
  }

  const callee = expression.callee

  if (callee.type !== 'MemberExpression' || callee.property !== 'join' || expression.args.length > 1) {
    return null
  }

  const receiver = emitPreparedArrayReceiver(callee.object, context)

  if (
    receiver === null ||
    typeof receiver === 'undefined' ||
    !isSupportedRuntimeArrayElementType(receiver.elementType)
  ) {
    return null
  }

  if (receiver.cppType === arrayNativeCppType(context)) {
    let separator: PreparedExpression = {
      lines: [],
      expression: '","'
    }

    if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
      const preparedSeparator = arrayDeps(context).emitPreparedCppStringArgument(
        expression.args[0],
        context,
        'inox_array_join_separator'
      )

      if (preparedSeparator !== null && typeof preparedSeparator !== 'undefined') {
        separator = preparedSeparator
      }
    }

    const lines: string[] = []
    appendLines(lines, receiver.lines)
    appendLines(lines, separator.lines)

    return {
      lines,
      expression: `${receiver.expression}.join(${separator.expression})`,
      cppType: 'inox::String',
      runtimeTypeChecked: true,
      valueType: 'string'
    }
  }

  const out = nextCName(context, 'inox_array_join')
  let separator: PreparedExpression = {
    lines: [],
    expression: '","'
  }
  const lines: string[] = []
  const facade = preparedArrayReceiverFacadeExpression(receiver)

  if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
    const preparedSeparator = arrayDeps(context).emitPreparedCppStringArgument(
      expression.args[0],
      context,
      'inox_array_join_separator'
    )

    if (preparedSeparator !== null && typeof preparedSeparator !== 'undefined') {
      separator = preparedSeparator
    }
  }

  appendLines(lines, receiver.lines)
  appendLines(lines, separator.lines)
  lines.push(`auto ${out} = ${facade}.join(${separator.expression});`)
  lines.push(emitRuntimeTypeCheck(`!${out}.valid()`, context))

  return {
    lines,
    expression: out,
    cppDeclaredName: out,
    cppType: 'inox::String',
    runtimeTypeChecked: true,
    valueType: 'string'
  }
}

export function emitPreparedArrayIncludesCallExpression(
  expression: ArrayMaybeNode,
  context: ArrayFunctionContext
): PreparedExpression | null {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'CallExpression') {
    return null
  }

  if (!isArrayIncludesCall(expression) || expression.args.length !== 1) {
    return null
  }

  const callee = expression.callee

  if (callee.type !== 'MemberExpression') {
    return null
  }

  const receiver = emitPreparedArrayReceiver(callee.object, context)

  if (receiver === null || typeof receiver === 'undefined') {
    return null
  }

  const search = expression.args[0]

  if (search === null || typeof search === 'undefined') {
    return null
  }

  let searchType = receiver.elementType

  if (searchType === 'unknown') {
    searchType = arrayDeps(context).inferExpressionType(search, context)
  }
  const searchValue = emitPreparedArrayElementValue(search, searchType, context)
  const found = nextCName(context, 'inox_array_includes')
  const facade = preparedArrayReceiverFacadeExpression(receiver)
  const lines: string[] = []

  appendLines(lines, receiver.lines)
  appendLines(lines, searchValue.lines)
  lines.push(`bool ${found} = ${facade}.includes(${searchValue.expression});`)
  lines.push(emitArrayThrownCheck(context))

  return {
    lines,
    expression: found,
    runtimeTypeChecked: true,
    valueType: 'boolean'
  }
}

export function emitPreparedArrayPushCallExpression(
  expression: ArrayMaybeNode,
  context: ArrayFunctionContext
): PreparedArrayExpression | null {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'CallExpression') {
    return null
  }

  const callee = expression.callee

  if (callee.type !== 'MemberExpression' || callee.property !== 'push' || expression.args.length !== 1) {
    return null
  }

  const receiver = emitPreparedArrayReceiver(callee.object, context)

  if (receiver !== null && typeof receiver !== 'undefined') {
    const arg = expression.args[0]

    if (arg === null || typeof arg === 'undefined') {
      return null
    }

    const valueType = arrayDeps(context).inferExpressionType(arg, context)
    const value = emitPreparedArrayElementValue(arg, valueType, context)

    updatePushedArrayMetadata(callee.object, valueType, context)

    const lines: string[] = []
    const facade = preparedArrayReceiverFacadeExpression(receiver)

    appendLines(lines, receiver.lines)
    appendLines(lines, value.lines)
    lines.push(`${facade}.push(${value.expression});`)
    lines.push(emitArrayThrownCheck(context))

    return {
      lines,
      expression: '',
      elementType: receiver.elementType
    }
  }

  return null
}

export function emitPreparedArrayUnshiftCallExpression(
  expression: ArrayMaybeNode,
  context: ArrayFunctionContext
): PreparedExpression | null {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'CallExpression') {
    return null
  }

  const callee = expression.callee

  if (callee.type !== 'MemberExpression' || callee.property !== 'unshift' || expression.args.length !== 1) {
    return null
  }

  const receiver = emitPreparedArrayReceiver(callee.object, context)

  if (receiver === null || typeof receiver === 'undefined') {
    return null
  }

  const arg = expression.args[0]

  if (arg === null || typeof arg === 'undefined') {
    return null
  }

  const valueType = arrayDeps(context).inferExpressionType(arg, context)
  const value = emitPreparedArrayElementValue(arg, valueType, context)
  const length = nextCName(context, 'inox_array_unshift_len')
  const facade = preparedArrayReceiverFacadeExpression(receiver)
  const lines: string[] = []

  updateUnshiftedArrayMetadata(callee.object, valueType, context)

  appendLines(lines, receiver.lines)
  appendLines(lines, value.lines)
  lines.push(`double ${length} = ${facade}.unshift(${value.expression});`)
  lines.push(emitArrayThrownCheck(context))

  return {
    lines,
    expression: length
  }
}

export function emitPreparedArrayPopCallExpression(
  expression: ArrayMaybeNode,
  context: ArrayFunctionContext,
  options: PreparedCallOptions | null
): PreparedArrayExpression | null {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'CallExpression') {
    return null
  }

  const callee = expression.callee

  if (callee.type !== 'MemberExpression' || callee.property !== 'pop' || expression.args.length !== 0) {
    return null
  }

  const receiver = emitPreparedArrayReceiver(callee.object, context)

  if (receiver !== null && typeof receiver !== 'undefined') {
    const value = nextCName(context, 'inox_array_pop')
    const facade = preparedArrayReceiverFacadeExpression(receiver)
    updatePoppedArrayMetadata(callee.object, context)

    const lines: string[] = []

    appendLines(lines, receiver.lines)
    lines.push(`auto ${value} = ${facade}.pop();`)
    lines.push(emitArrayThrownCheck(context))

    return {
      lines,
      expression: options !== null && typeof options !== 'undefined' && options.discard === true ? '' : value,
      elementType: receiver.elementType
    }
  }

  return null
}


function updatePushedArrayMetadata(receiver: ArrayMaybeNode, valueType: string, context: ArrayFunctionContext): void {
  if (
    receiver === null ||
    typeof receiver === 'undefined' ||
    receiver.type !== 'Reference' ||
    receiver.path.length !== 1 ||
    valueType === 'unknown'
  ) {
    return
  }

  const name = receiver.path[0]
  const elements = findArrayShape(context, name)

  if (elements === null || typeof elements === 'undefined') {
    if (context.variables.get(name) === 'array') {
      const existingElementType = context.runtimeArrayElementTypes.get(name)

      if (existingElementType === null || typeof existingElementType === 'undefined') {
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
    functionType: null,
    valueType
  })
  const elementType = resolveForOfElementType(nextElements)

  if (elementType === 'unknown') {
    ensureArrayShapes(context).delete(name)
    ensureArrayLengths(context).delete(name)
    context.runtimeArrayElementTypes.set(name, 'unknown')
    return
  }

  ensureArrayShapes(context).set(name, nextElements)
  ensureArrayLengths(context).set(name, nextElements.length)
}

function updateUnshiftedArrayMetadata(
  receiver: ArrayMaybeNode,
  valueType: string,
  context: ArrayFunctionContext
): void {
  if (
    receiver === null ||
    typeof receiver === 'undefined' ||
    receiver.type !== 'Reference' ||
    receiver.path.length !== 1 ||
    valueType === 'unknown'
  ) {
    return
  }

  const name = receiver.path[0]
  const elements = findArrayShape(context, name)

  if (elements === null || typeof elements === 'undefined') {
    if (context.variables.get(name) === 'array') {
      const existingElementType = context.runtimeArrayElementTypes.get(name)

      if (existingElementType === null || typeof existingElementType === 'undefined') {
        context.runtimeArrayElementTypes.set(name, valueType)
      } else {
        context.runtimeArrayElementTypes.set(name, existingElementType)
      }
    }

    return
  }

  const nextElements: CArrayElementInfo[] = [
    {
      functionType: null,
      valueType
    }
  ]

  for (const element of elements) {
    nextElements.push(element)
  }

  const elementType = resolveForOfElementType(nextElements)

  if (elementType === 'unknown') {
    ensureArrayShapes(context).delete(name)
    ensureArrayLengths(context).delete(name)
    context.runtimeArrayElementTypes.set(name, 'unknown')
    return
  }

  ensureArrayShapes(context).set(name, nextElements)
  ensureArrayLengths(context).set(name, nextElements.length)
}

function updatePoppedArrayMetadata(receiver: ArrayMaybeNode, context: ArrayFunctionContext): void {
  if (
    receiver === null ||
    typeof receiver === 'undefined' ||
    receiver.type !== 'Reference' ||
    receiver.path.length !== 1
  ) {
    return
  }

  const name = receiver.path[0]
  const elements = findArrayShape(context, name)

  if (elements !== null && typeof elements !== 'undefined') {
    const nextElements = arrayElementInfoWithoutLast(elements)

    ensureArrayShapes(context).set(name, nextElements)
    ensureArrayLengths(context).set(name, nextElements.length)
  }
}


function emitPreparedArrayElementValue(
  expression: AnyNode,
  valueType: string,
  context: ArrayFunctionContext
): PreparedExpression {
  if (valueType !== 'number') {
    return arrayDeps(context).emitCValueExpression(expression, context)
  }

  const value = arrayDeps(context).emitPreparedNumberExpression(expression, context)

  return {
    lines: value.lines,
    expression: `inox_number_value(${value.expression})`
  }
}


function emitPreparedArrayReceiver(
  expression: ArrayMaybeNode,
  context: ArrayFunctionContext
): PreparedArrayReceiver | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  if (expression.type === 'ArrayLiteral') {
    const value = arrayDeps(context).emitCArrayLiteralValueExpression(expression, context)
    const elements: CArrayElementInfo[] = []

    const sourceElements: ArrayNode[] = expression.elements

    for (const element of sourceElements) {
      elements.push({
        functionType: element.functionType ?? null,
        valueType: arrayDeps(context).inferExpressionType(element, context)
      })
    }

    return {
      lines: value.lines,
      expression: value.expression,
      elementType: resolveForOfElementType(elements),
      cppType: value.cppType,
      valueAdapter: arrayNativeValueAdapter(expression, context)
    }
  }

  if (
    expression.type === 'BinaryExpression' &&
    expression.operator === '??' &&
    arrayDeps(context).inferExpressionType(expression, context) === 'array'
  ) {
    const value = arrayDeps(context).emitCValueExpression(expression, context)

    return {
      lines: value.lines,
      expression: value.expression,
      elementType: resolvePreparedArrayReceiverElementType(expression, context),
      cppType: value.cppType,
      valueAdapter: arrayNativeValueAdapter(expression, context)
    }
  }

  if (expression.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]

    if (context.variables.get(name) !== 'array') {
      return null
    }

    let elementType = context.runtimeArrayElementTypes.get(name)

    if (elementType === null || typeof elementType === 'undefined') {
      const shape = findArrayShape(context, name)

      if (shape === null || typeof shape === 'undefined') {
        elementType = 'unknown'
      } else {
        elementType = resolveForOfElementType(shape)
      }
    }

    const cppType = context.cppValueTypes.get(name)

    if (cppType !== null && typeof cppType !== 'undefined') {
      return {
        lines: [],
        expression: emitArrayReferenceName(name, context),
        elementType,
        cppType,
        valueAdapter: arrayNativeValueAdapter(expression, context)
      }
    }

    return {
      lines: [],
      expression: emitArrayReferenceName(name, context),
      elementType,
      valueAdapter: arrayNativeValueAdapter(expression, context)
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
      elementType: resolvePreparedArrayReceiverElementType(expression, context),
      cppType: value.cppType,
      valueAdapter: arrayNativeValueAdapter(expression, context)
    }
  }

  if (expression.type === 'CallExpression') {
    const valueType = arrayDeps(context).inferExpressionType(expression, context)

    if (valueType !== 'array') {
      return null
    }

    let call = emitPreparedArraySliceCallExpression(expression, context)

    if (
      (call === null || typeof call === 'undefined') &&
      arrayDeps(context).isStringSplitCall(expression, context)
    ) {
      call = arrayDeps(context).emitCStringSplitValueExpression(expression, context)
    }

    if (call !== null && typeof call !== 'undefined') {
      return {
        lines: call.lines,
        expression: call.expression,
        elementType: call.elementType,
        cppType: call.cppType,
        valueAdapter: arrayNativeValueAdapter(expression, context)
      }
    }

    const value = arrayDeps(context).emitCValueExpression(expression, context)

    return {
      lines: value.lines,
      expression: value.expression,
      elementType: resolvePreparedArrayReceiverElementType(expression, context),
      cppType: value.cppType,
      valueAdapter: arrayNativeValueAdapter(expression, context)
    }
  }

  return null
}

function preparedArrayReceiverFacadeExpression(receiver: PreparedArrayReceiver): string {
  if (
    receiver.cppType !== null &&
    typeof receiver.cppType !== 'undefined' &&
    receiver.cppType !== 'inox::Value' &&
    receiver.cppType !== 'inox_value'
  ) {
    return receiver.expression
  }

  return applyLibraryNativeValueAdapter(receiver.expression, receiver.valueAdapter ?? null)
}

function resolveArrayJoinReceiverElementType(expression: ArrayMaybeNode, context: ArrayFunctionContext): string | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  if (expression.type === 'ArrayLiteral') {
    const elements: CArrayElementInfo[] = []

    for (const element of expression.elements) {
      elements.push({
        functionType: element.functionType ?? null,
        valueType: arrayDeps(context).inferExpressionType(element, context)
      })
    }

    return resolveForOfElementType(elements)
  }

  if (expression.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]

    if (context.variables.get(name) !== 'array') {
      return null
    }

    const elementType = context.runtimeArrayElementTypes.get(name)

    if (elementType !== null && typeof elementType !== 'undefined') {
      return elementType
    }

    const shape = findArrayShape(context, name)

    if (shape === null || typeof shape === 'undefined') {
      return 'unknown'
    }

    return resolveForOfElementType(shape)
  }

  if (
    (expression.type === 'MemberExpression' ||
      expression.type === 'IndexExpression' ||
      expression.type === 'CallExpression') &&
    arrayDeps(context).inferExpressionType(expression, context) === 'array'
  ) {
    return resolvePreparedArrayReceiverElementType(expression, context)
  }

  return null
}

function resolvePreparedArrayReceiverElementType(expression: AnyNode, context: ArrayFunctionContext): string {
  const runtimeElementType = resolveRuntimeArrayElementType(expression, context)

  if (runtimeElementType !== null && typeof runtimeElementType !== 'undefined') {
    return runtimeElementType
  }

  return 'unknown'
}
