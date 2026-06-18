import { diagnostic } from '../../diagnostics.ts'
import {
  cloneCStringSet,
  emitEventLoopReference,
  emitFailureStatement,
  emitPrepareOwnedValueWrite,
  emitRuntimeTypeCheck,
  emitStatusCheck,
  nextCName,
  registerEventLoop,
  registerOwnedValue,
} from '../context.ts'
import { reportCJsGlobalDiagnostic } from '../diagnostics.ts'
import { isCJsGlobalRoot, usesCJsGlobal } from '../globals.ts'
import { cStringLiteral, emitCObjectFunctionFieldName, utf8ByteLength } from '../identifiers.ts'
import { mathRuntimeMethodName } from '../runtime-methods.ts'
import { emitRuntimeValueCheck } from '../runtime-values.ts'
import {
  cRuntimeValueTag,
  isManagedRuntimeReturnType,
  isNullableScalarParam,
  isNullableScalarType,
  isOpaqueRuntimeValueType,
  isRuntimeNullableType
} from '../value-types.ts'
import { cTimeRuntimeCallName } from '../stdlib/time.ts'
import {
  cUnsupportedExpressionCode,
  emitCOperator,
  isNullishCoalescingExpression,
  isOptionalChainExpression
} from '../syntax.ts'
import {
  canLowerCScalarNullishCoalescingExpression,
  isNarrowedNullableScalarReference,
  isNullableRuntimeExpression,
  isNullableScalarRuntimeExpression,
  resolveNullableScalarConditionNarrowing
} from './nullable.ts'
import type { NullableLoweringDependencies } from './nullable.ts'
import type { AnyNode, Diagnostic, SourceLocation } from '../../types.ts'
import type {
  CKnownArrayElement,
  CKnownObjectField,
  CKnownObjectIndexField,
  CFunctionReturnMapType,
  CFunctionParam,
  CFunctionType,
  CObjectAccessorReturnPath,
  CObjectShape,
  CObjectShapeField,
  CPreparedCallArgs as PreparedCallArgs,
  CPreparedCallOptions as PreparedCallOptions,
  CPreparedExpression as PreparedExpression,
  CRuntimeArrayElement
} from '../types.ts'

type CBooleanMap = Map<string, boolean>
type CFunctionReturnMapTypeMap = Map<string, CFunctionReturnMapType>
type CFunctionTypeMap = Map<string, CFunctionType>
type CObjectAccessorReturnPathMap = Map<string, CObjectAccessorReturnPath>
type CObjectShapeFieldMap = Map<string, CObjectShapeField[]>
type CStringMap = Map<string, string>
type CStringNullableMap = Map<string, string | null>
type CStringSet = Set<string>
type CValueNode = AnyNode

type ObjectFunctionArgumentSource = {
  expression: CValueNode | null
  loc?: SourceLocation
  pathName: string | null
}

type CDynamicObjectArrayIndexDependencies = {
  emitCValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitPreparedNumberExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  inferExpressionType(expression: CValueNode, context: CFunctionContext): string
}

type CDynamicObjectFieldAccess = {
  object: CValueNode
  key: string
}

type CEmitContext = {
  objectAccessorReturnPaths: CObjectAccessorReturnPathMap
  throwingFunctions: CStringSet
}

type CFunctionContext = CEmitContext & {
  boxedVariables: CStringSet
  cleanupEnabled: boolean
  diagnostics: Diagnostic[]
  eventLoopUsed: boolean
  externalEventLoop: boolean
  externalEventLoopFunctions: CStringSet
  failureStatement?: string | null
  failureStatementUsed?: boolean
  functionAsyncFlags: CBooleanMap
  functionNames: CStringMap
  functionParams: Map<string, CFunctionParam[]>
  functionReturnArrayElementTypes: CStringNullableMap
  functionReturnNullables: CBooleanMap
  functionReturnPromiseValueTypes: CStringNullableMap
  functionReturnShapes: Map<string, CObjectShape | null>
  functionReturnTypes: CStringMap
  functionTypes: CFunctionTypeMap
  jsGlobalRoots: CStringSet
  mapTypes: CFunctionReturnMapTypeMap
  narrowedNullableScalars: CStringSet
  nextId: number
  nullableLoweringDependencies: NullableLoweringDependencies
  nullableVariables: CStringSet
  objectShapes: CObjectShapeFieldMap
  ownedValues: string[]
  returnType?: string
  runtimeFunctionParams: CFunctionTypeMap
  runtimeArrayElementTypes: CStringMap
  runtimeCallbacks: CStringSet
  runtimeStrings: CStringSet
  setElementTypes: CStringMap
  statusReturn: boolean
  throwingFunction: boolean
  usedCleanupGoto: boolean
  variables: CStringMap
}

function cBooleanValueIsTrue(value: boolean | null | undefined): boolean {
  if (value == null) {
    return false
  }

  if (value) {
    return true
  }

  return false
}

type NullableScalarNarrowingSnapshot = {
  active: boolean
  narrowedNullableScalars: CStringSet
}

type PreparedUrlSearchParamsExpression = {
  lines: string[]
  expression: string
  valueType?: string
}

type CFunctionCallReturnInfo = {
  returnType: string
  returnNullable: boolean
}

type NumericIntegerCastLimits = {
  preMin: string
  preMax: string
  min: string
  max: string
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

function joinStrings(values: string[], separator: string): string {
  let result = ''

  for (let index = 0; index < values.length; index = index + 1) {
    if (index > 0) {
      result = result + separator
    }

    result = result + values[index]
  }

  return result
}

function isNumberOrBooleanValueType(valueType: string): boolean {
  return valueType === 'number' || valueType === 'boolean'
}

function isNumericCastName(name: string): boolean {
  return name === 'i32' || name === 'u32' || name === 'u64' || name === 'f32' || name === 'f64'
}

function isEqualityOperator(operator: string): boolean {
  return operator === '===' || operator === '!==' || operator === '==' || operator === '!='
}

function isPositiveEqualityOperator(operator: string): boolean {
  return operator === '===' || operator === '=='
}

function isRuntimeReferenceEqualityType(valueType: string): boolean {
  return (
    valueType === 'object' ||
    valueType === 'array' ||
    valueType === 'bytes' ||
    valueType === 'map' ||
    valueType === 'set'
  )
}

function typeofRuntimeTagCheck(value: string, typeName: string): string | null {
  if (typeName === 'undefined') {
    return `${value}.tag == CCJS_TAG_UNDEFINED`
  }

  if (typeName === 'object') {
    return (
      `(${value}.tag == CCJS_TAG_NULL || ${value}.tag == CCJS_TAG_OBJECT || ${value}.tag == CCJS_TAG_ARRAY || ` +
      `${value}.tag == CCJS_TAG_BYTES || ${value}.tag == CCJS_TAG_MAP || ${value}.tag == CCJS_TAG_SET)`
    )
  }

  if (typeName === 'boolean') {
    return `${value}.tag == CCJS_TAG_BOOL`
  }

  if (typeName === 'number') {
    return `${value}.tag == CCJS_TAG_NUMBER`
  }

  if (typeName === 'string') {
    return `${value}.tag == CCJS_TAG_STRING`
  }

  if (typeName === 'function') {
    return `${value}.tag == CCJS_TAG_FUNCTION`
  }

  return null
}

function emitPreparedTypeofArgumentValue(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CScalarExpressionDependencies
): PreparedExpression {
  const valueType = deps.inferExpressionType(expression, context)

  if (
    expression.type === 'Reference' &&
    expression.path.length === 1 &&
    (valueType === 'unknown' || isManagedRuntimeReturnType(valueType) || isOpaqueRuntimeValueType(valueType))
  ) {
    return {
      lines: [],
      expression: deps.emitReference(expression, context)
    }
  }

  return deps.emitCValueExpression(expression, context)
}

function emitPreparedTypeofCompareExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CScalarExpressionDependencies
): PreparedExpression | null {
  if (!isEqualityOperator(expression.operator)) {
    return null
  }

  let argument: CValueNode | null = null
  let typeName: string | null = null

  if (
    expression.left.type === 'UnaryExpression' &&
    expression.left.operator === 'typeof' &&
    expression.right.type === 'StringLiteral'
  ) {
    argument = expression.left.argument
    typeName = expression.right.value
  } else if (
    expression.right.type === 'UnaryExpression' &&
    expression.right.operator === 'typeof' &&
    expression.left.type === 'StringLiteral'
  ) {
    argument = expression.right.argument
    typeName = expression.left.value
  }

  if (argument == null || typeName == null) {
    return null
  }

  const value = emitPreparedTypeofArgumentValue(argument, context, deps)
  const check = typeofRuntimeTagCheck(value.expression, typeName)

  if (check == null) {
    return null
  }

  let result = `(${check})`

  if (!isPositiveEqualityOperator(expression.operator)) {
    result = `(!${result})`
  }

  return {
    lines: value.lines,
    expression: result
  }
}

function scalarRuntimeValueExpression(value: string, valueType: string): string {
  if (valueType === 'boolean') {
    return `(${value}.as.boolean ? 1 : 0)`
  }

  return `${value}.as.number`
}

function boxedScalarRuntimeValueExpression(value: string, valueType: string): string {
  if (valueType === 'boolean') {
    return `ccjs_bool_value((${value}) != 0)`
  }

  return `ccjs_number_value(${value})`
}

function runtimeBoolValueExpression(value: boolean): string {
  if (value) {
    return 'true'
  }

  return 'false'
}

function functionParamAt(params: CFunctionParam[], expectedIndex: number): CFunctionParam | null {
  for (let index = 0; index < params.length; index = index + 1) {
    if (index === expectedIndex) {
      return params[index]
    }
  }

  return null
}

function stringValueAt(values: string[], index: number): string {
  return values[index]
}

function objectExpressionName(expression: CValueNode, context: CFunctionContext): string | null {
  return objectExpressionPathName(expression, context)
}

function objectExpressionPathName(expression: CValueNode, context: CFunctionContext): string | null {
  if (expression.type === 'Reference' && expression.path.length === 1) {
    return expression.path[0]
  }

  if (expression.type === 'ThisExpression') {
    return 'this'
  }

  if (expression.type === 'MemberExpression') {
    const objectName = objectExpressionPathName(expression.object, context)

    if (objectName != null) {
      return `${objectName}_${expression.property}`
    }
  }

  if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
    const objectName = objectExpressionPathName(expression.object, context)

    if (objectName != null) {
      return `${objectName}_${expression.index.value}`
    }
  }

  if (expression.type === 'CallExpression' && expression.callee.type === 'Reference' && expression.callee.path.length === 1) {
    const accessor = context.objectAccessorReturnPaths.get(expression.callee.path[0])

    if (accessor != null) {
      const argument = functionCallArgumentAt(expression.args, accessor.paramIndex)

      if (argument != null) {
        const objectName = objectExpressionPathName(argument, context)

        if (objectName != null) {
          return appendObjectAccessorFields(objectName, accessor.fields)
        }
      }
    }
  }

  return null
}

function appendObjectAccessorFields(objectName: string, fields: string[]): string {
  let result = objectName

  for (const field of fields) {
    result = `${result}_${field}`
  }

  return result
}

function functionCallArgumentAt(args: CValueNode[], expectedIndex: number): CValueNode | null {
  for (let index = 0; index < args.length; index = index + 1) {
    if (index === expectedIndex) {
      return args[index]
    }
  }

  return null
}

function objectFunctionFieldAt(fields: CObjectShapeField[] | null | undefined, fieldName: string): CObjectShapeField | null {
  if (fields == null) {
    return null
  }

  for (const field of fields) {
    if (field.name === fieldName && field.valueType === 'function') {
      return field
    }
  }

  return null
}

function objectLiteralPropertyValue(expression: CValueNode, key: string): CValueNode | null {
  if (expression.type !== 'ObjectLiteral') {
    return null
  }

  for (const property of expression.properties) {
    if (property.key === key && property.value != null) {
      return property.value
    }
  }

  return null
}

function objectFunctionArgumentSource(expression: CValueNode, context: CFunctionContext): ObjectFunctionArgumentSource {
  return {
    expression,
    loc: expression.loc,
    pathName: objectExpressionPathName(expression, context)
  }
}

function nestedObjectFunctionArgumentSource(
  source: ObjectFunctionArgumentSource,
  fieldName: string,
  context: CFunctionContext
): ObjectFunctionArgumentSource {
  let expression: CValueNode | null = null
  const sourceExpression = source.expression

  if (sourceExpression != null) {
    expression = objectLiteralPropertyValue(sourceExpression, fieldName)
  }

  if (expression != null) {
    const pathName = objectExpressionPathName(expression, context)

    return {
      expression,
      loc: expression.loc ?? source.loc,
      pathName: pathName ?? nestedObjectPathName(source.pathName, fieldName)
    }
  }

  return {
    expression: null,
    loc: source.loc,
    pathName: nestedObjectPathName(source.pathName, fieldName)
  }
}

function nestedObjectPathName(pathName: string | null, fieldName: string): string | null {
  if (pathName == null) {
    return null
  }

  return `${pathName}_${fieldName}`
}

function emitObjectFunctionFieldArgument(
  source: ObjectFunctionArgumentSource,
  field: CObjectShapeField,
  context: CFunctionContext,
  deps: CCallExpressionDependencies
): string {
  let literalValue: CValueNode | null = null
  const expression = source.expression

  if (expression != null) {
    literalValue = objectLiteralPropertyValue(expression, field.name)
  }

  if (literalValue != null) {
    return deps.emitFunctionValueExpression(literalValue, context)
  }

  const objectName = source.pathName

  if (objectName != null) {
    return emitCObjectFunctionFieldName(objectName, field.name)
  }

  if (field.optional === true) {
    return '0'
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_C_FUNCTION_VALUE',
      `object function field ${field.name} is not available as a C function pointer`,
      source.loc
    )
  )

  return '0'
}

function appendObjectFunctionFieldArguments(
  args: string[],
  expression: CValueNode,
  param: CFunctionParam,
  context: CFunctionContext,
  deps: CCallExpressionDependencies
): void {
  appendObjectShapeFunctionFieldArguments(args, objectFunctionArgumentSource(expression, context), param.shape, context, deps)
}

function appendDefaultObjectFunctionFieldArguments(args: string[], param: CFunctionParam): void {
  appendDefaultObjectShapeFunctionFieldArguments(args, param.shape)
}

function appendObjectShapeFunctionFieldArguments(
  args: string[],
  source: ObjectFunctionArgumentSource,
  shape: CObjectShape | null | undefined,
  context: CFunctionContext,
  deps: CCallExpressionDependencies
): void {
  const fields = shape?.fields

  if (fields == null) {
    return
  }

  for (const field of fields) {
    if (field.valueType === 'function') {
      args.push(emitObjectFunctionFieldArgument(source, field, context, deps))
    } else if (field.valueType === 'object') {
      appendObjectShapeFunctionFieldArguments(
        args,
        nestedObjectFunctionArgumentSource(source, field.name, context),
        field.shape,
        context,
        deps
      )
    }
  }
}

function appendDefaultObjectShapeFunctionFieldArguments(
  args: string[],
  shape: CObjectShape | null | undefined
): void {
  const fields = shape?.fields

  if (fields == null) {
    return
  }

  for (const field of fields) {
    if (field.valueType === 'function') {
      args.push('0')
    } else if (field.valueType === 'object') {
      appendDefaultObjectShapeFunctionFieldArguments(args, field.shape)
    }
  }
}

function objectFunctionFieldCallee(callee: CValueNode, context: CFunctionContext): string | null {
  let object: CValueNode | null = null
  let fieldName: string | null = null

  if (callee.type === 'MemberExpression') {
    object = callee.object
    fieldName = callee.property
  } else if (callee.type === 'IndexExpression' && callee.index.type === 'StringLiteral') {
    object = callee.object
    fieldName = callee.index.value
  }

  if (object == null || fieldName == null) {
    return null
  }

  const objectName = objectExpressionName(object, context)

  if (objectName == null) {
    return null
  }

  let fields = context.objectShapes.get(objectName)

  if (fields == null && object.shape != null) {
    fields = object.shape.fields
  }

  if (fields == null) {
    const returnShape = objectFunctionReturnShape(object, context)

    if (returnShape != null && returnShape.fields != null) {
      fields = returnShape.fields
    }
  }

  if (objectFunctionFieldAt(fields, fieldName) == null) {
    return null
  }

  return emitCObjectFunctionFieldName(objectName, fieldName)
}

function objectFunctionReturnShape(object: CValueNode, context: CFunctionContext): CObjectShape | null {
  if (object.type !== 'CallExpression' || object.callee.type !== 'Reference' || object.callee.path.length !== 1) {
    return null
  }

  const shape = context.functionReturnShapes.get(object.callee.path[0])

  if (shape != null) {
    return shape
  }

  return null
}

function wrappedCExpression(expression: string): string {
  if (isWrappedCExpression(expression)) {
    return expression
  }

  return `(${expression})`
}

function expressionLocation(expression: CValueNode): SourceLocation | undefined {
  return expression.loc
}

function pushNullableScalarNarrowing(
  context: CFunctionContext,
  names: string[]
): NullableScalarNarrowingSnapshot {
  const previous = context.narrowedNullableScalars

  if (names.length === 0) {
    return {
      active: false,
      narrowedNullableScalars: previous
    }
  }

  context.narrowedNullableScalars = cloneCStringSet(previous)

  for (const name of names) {
    context.narrowedNullableScalars.add(name)
  }

  return {
    active: true,
    narrowedNullableScalars: previous
  }
}

function restoreNullableScalarNarrowing(
  context: CFunctionContext,
  snapshot: NullableScalarNarrowingSnapshot
): void {
  if (snapshot.active) {
    context.narrowedNullableScalars = snapshot.narrowedNullableScalars
  }
}


export type CScalarExpressionDependencies = {
  canEmitStringBytesOperand(expression: CValueNode, context: CFunctionContext): boolean
  cFsRuntimeConstantExpression(expression: CValueNode): string | null
  emitCAwaitValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitCValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitObjectValueReference(name: string, context: CFunctionContext): string
  emitPreparedArrayLengthExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedBinaryNumberCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedBytesIndexExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedBytesLengthExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedArrayIsArrayCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitPreparedClassMethodCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedCollectionCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedCollectionSizeExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedCryptoNumberCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedDgramAddressPortExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedJsonScalarParseExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedNetAddressPortExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedNullableScalarRuntimeValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitPreparedObjectExpressionScalarIndexValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedObjectExpressionScalarMemberValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedPathBooleanCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedProcessNumberExpression(expression: CValueNode): PreparedExpression | null
  emitPreparedNumberExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitPreparedRuntimeArrayIndexValue(
    expression: CValueNode,
    element: CRuntimeArrayElement,
    context: CFunctionContext,
    tempPrefix: string
  ): PreparedExpression
  emitPreparedStringCompareExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitPreparedStringCharCodeAtExpression(expression: any, context: CFunctionContext): PreparedExpression | null
  emitPreparedStringIndexCallExpression(expression: any, context: CFunctionContext): PreparedExpression | null
  emitPreparedStringLengthExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedStringPredicateCall(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitPreparedUrlSearchParamsCallExpression(expression: CValueNode, context: CFunctionContext): PreparedUrlSearchParamsExpression | null
  emitReference(expression: CValueNode, context: CFunctionContext): string
  emitStringExpression(expression: CValueNode, context: CFunctionContext): string
  inferExpressionType(expression: CValueNode, context: CFunctionContext): string
  isIndexAccessExpression(expression: CValueNode): boolean
  isMemberAccessExpression(expression: CValueNode): boolean
  isNullableScalarRuntimeExpression(expression: CValueNode, context: CFunctionContext): boolean
  isStringPredicateCall(expression: CValueNode, context: CFunctionContext): boolean
  reportCJsGlobalDiagnostic(diagnostics: Diagnostic[], loc: SourceLocation | undefined): void
  resolveKnownArrayIndex(expression: CValueNode, context: CFunctionContext): CKnownArrayElement | null
  resolveKnownObjectIndex(expression: CValueNode, context: CFunctionContext): CKnownObjectIndexField | null
  resolveKnownObjectMember(expression: CValueNode, context: CFunctionContext): CKnownObjectField | null
  resolveRuntimeArrayIndex(expression: CValueNode, context: CFunctionContext): CRuntimeArrayElement | null
}


export type CCallExpressionDependencies = {
  currentErrorTarget(context: CFunctionContext): string | null
  emitCExpression(expression: CValueNode, context: CFunctionContext): string
  emitCNumberConversionValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitCValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitFunctionValueExpression(expression: CValueNode, context: CFunctionContext): string
  emitNullableFunctionValueExpression(
    expression: CValueNode,
    functionType: CFunctionType | null | undefined,
    context: CFunctionContext
  ): PreparedExpression
  emitNullableScalarValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitPreparedArrayFilterCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedArrayMapCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedArrayPopCallExpression(
    expression: CValueNode,
    context: CFunctionContext,
    options: PreparedCallOptions | null
  ): PreparedExpression | null
  emitPreparedArraySliceCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedArraySortCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedClassMethodCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedCollectionCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedCryptoCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedCryptoHashCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedCryptoHmacCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedFetchHeadersCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedFsCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedFsStatsMethodExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedJsonCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedNumberExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitPreparedPathBooleanCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedPathStringCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedPromiseMethodExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedPromiseStaticExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedTimerCallExpression(expression: CValueNode, context: CFunctionContext, options?: PreparedCallOptions): PreparedExpression | null
  emitPreparedUrlSearchParamsCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitRuntimeCallbackCall(expression: CValueNode, callbackType: CFunctionType, context: CFunctionContext): PreparedExpression
  emitRuntimeCallbackValue(
    expression: CValueNode,
    functionType: CFunctionType | null | undefined,
    context: CFunctionContext
  ): PreparedExpression
  isExternalEventLoopFunctionCallee(callee: CValueNode, context: CFunctionContext): boolean
  isNullableFunctionType(valueType: string | null | undefined, nullable: boolean | null | undefined): boolean
  isPromiseReturningFunctionCallee(callee: CValueNode, context: CFunctionContext): boolean
  registerErrorChannel(context: CFunctionContext): void
  resolveFunctionParams(callee: CValueNode, context: CFunctionContext): CFunctionParam[] | null
  resolveRuntimeCallbackCalleeType(callee: CValueNode, context: CFunctionContext): CFunctionType | null
  resolveRuntimeFunctionArgumentType(
    callee: CValueNode,
    index: number,
    param: CFunctionParam,
    context: CFunctionContext
  ): CFunctionType | null
}

export function emitCallExpression(expression: CValueNode, context: CFunctionContext, deps: CCallExpressionDependencies): string {
  const args: string[] = []

  for (const arg of expression.args) {
    args.push(deps.emitCExpression(arg, context))
  }

  return `${emitCallee(expression.callee, context)}(${joinStrings(args, ', ')})`
}

export function emitPreparedCallExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CCallExpressionDependencies
): PreparedExpression {
  const mathCall = emitPreparedMathCallExpression(expression, context, deps)

  if (mathCall != null) {
    return mathCall
  }

  const pathStringCall = deps.emitPreparedPathStringCallExpression(expression, context)

  if (pathStringCall != null) {
    return pathStringCall
  }

  const pathBooleanCall = deps.emitPreparedPathBooleanCallExpression(expression, context)

  if (pathBooleanCall != null) {
    return pathBooleanCall
  }

  const fsStatsMethod = deps.emitPreparedFsStatsMethodExpression(expression, context)

  if (fsStatsMethod != null) {
    return fsStatsMethod
  }

  const numberConversion = deps.emitCNumberConversionValueExpression(expression, context)

  if (numberConversion != null) {
    return numberConversion
  }

  const classMethodCall = deps.emitPreparedClassMethodCallExpression(expression, context)

  if (classMethodCall != null) {
    return classMethodCall
  }

  const arrayPopCall = deps.emitPreparedArrayPopCallExpression(expression, context, null)

  if (arrayPopCall != null) {
    return arrayPopCall
  }

  const arrayMapCall = deps.emitPreparedArrayMapCallExpression(expression, context)

  if (arrayMapCall != null) {
    return arrayMapCall
  }

  const arrayFilterCall = deps.emitPreparedArrayFilterCallExpression(expression, context)

  if (arrayFilterCall != null) {
    return arrayFilterCall
  }

  const arraySliceCall = deps.emitPreparedArraySliceCallExpression(expression, context)

  if (arraySliceCall != null) {
    return arraySliceCall
  }

  const arraySortCall = deps.emitPreparedArraySortCallExpression(expression, context)

  if (arraySortCall != null) {
    return arraySortCall
  }

  const collectionCall = deps.emitPreparedCollectionCallExpression(expression, context)

  if (collectionCall != null) {
    return collectionCall
  }

  const cryptoHashCall = deps.emitPreparedCryptoHashCallExpression(expression, context)

  if (cryptoHashCall != null) {
    return cryptoHashCall
  }

  const cryptoHmacCall = deps.emitPreparedCryptoHmacCallExpression(expression, context)

  if (cryptoHmacCall != null) {
    return cryptoHmacCall
  }

  const cryptoCall = deps.emitPreparedCryptoCallExpression(expression, context)

  if (cryptoCall != null) {
    return cryptoCall
  }

  const fsCall = deps.emitPreparedFsCallExpression(expression, context)

  if (fsCall != null) {
    return fsCall
  }

  const fetchHeadersCall = deps.emitPreparedFetchHeadersCallExpression(expression, context)

  if (fetchHeadersCall != null) {
    return fetchHeadersCall
  }

  const urlSearchParamsCall = deps.emitPreparedUrlSearchParamsCallExpression(expression, context)

  if (urlSearchParamsCall != null) {
    return urlSearchParamsCall
  }

  const jsonCall = deps.emitPreparedJsonCallExpression(expression, context)

  if (jsonCall != null) {
    return jsonCall
  }

  const timerCall = deps.emitPreparedTimerCallExpression(expression, context, {
    asValue: true
  })

  if (timerCall != null) {
    return timerCall
  }

  const promise = deps.emitPreparedPromiseStaticExpression(expression, context)

  if (promise != null) {
    return promise
  }

  const promiseMethod = deps.emitPreparedPromiseMethodExpression(expression, context)

  if (promiseMethod != null) {
    return promiseMethod
  }

  const callbackType = deps.resolveRuntimeCallbackCalleeType(expression.callee, context)

  if (callbackType != null) {
    return deps.emitRuntimeCallbackCall(expression, callbackType, context)
  }

  const params = deps.resolveFunctionParams(expression.callee, context)

  if (params == null) {
    return {
      lines: [],
      expression: emitCallExpression(expression, context, deps)
    }
  }

  const prepared = emitPreparedCallArgs(expression, params, context, deps)
  const lines = prepared.lines
  const args = prepared.args

  if (isThrowingFunctionCallee(expression.callee, context)) {
    return emitPreparedThrowingCallExpression(expression, args, lines, context, deps)
  }

  if (deps.isPromiseReturningFunctionCallee(expression.callee, context)) {
    registerEventLoop(context)
    const callArgs: string[] = []

    callArgs.push(emitEventLoopReference(context))
    appendLines(callArgs, args)

    return {
      lines,
      expression: `${emitCallee(expression.callee, context)}(${joinStrings(callArgs, ', ')})`
    }
  }

  if (deps.isExternalEventLoopFunctionCallee(expression.callee, context)) {
    registerEventLoop(context)
    const callArgs: string[] = []

    callArgs.push(emitEventLoopReference(context))
    appendLines(callArgs, args)

    return {
      lines,
      expression: `${emitCallee(expression.callee, context)}(${joinStrings(callArgs, ', ')})`
    }
  }

  return {
    lines,
    expression: `${emitCallee(expression.callee, context)}(${joinStrings(args, ', ')})`
  }
}

function emitPreparedMathCallExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CCallExpressionDependencies
): PreparedExpression | null {
  const method = mathRuntimeMethodName(expression.callee) ?? ''

  if (method === '') {
    return null
  }

  const lines: string[] = []
  const expressions: string[] = []

  for (const arg of expression.args) {
    const prepared = deps.emitPreparedNumberExpression(arg, context)

    appendLines(lines, prepared.lines)
    expressions.push(prepared.expression)
  }

  return {
    lines,
    expression: `ccjs_math_${method}(${joinStrings(expressions, ', ')})`
  }
}

export function emitPreparedCallArgs(
  expression: CValueNode,
  params: CFunctionParam[],
  context: CFunctionContext,
  deps: CCallExpressionDependencies
): PreparedCallArgs {
  const lines: string[] = []
  const args: string[] = []

  for (let index = 0; index < expression.args.length; index = index + 1) {
    const arg = expression.args[index]
    const param = functionParamAt(params, index)

    if (param != null) {
      const paramValueType = param.valueType

      if (isNullableScalarParam(param)) {
        const value = deps.emitNullableScalarValueExpression(arg, context)

        appendLines(lines, value.lines)
        args.push(value.expression)
      } else if (deps.isNullableFunctionType(paramValueType, cBooleanValueIsTrue(param.nullable))) {
        const value = deps.emitNullableFunctionValueExpression(arg, param.functionType, context)

        appendLines(lines, value.lines)
        args.push(value.expression)
      } else if (paramValueType === 'unknown' || isOpaqueRuntimeValueType(paramValueType)) {
        const value = deps.emitCValueExpression(arg, context)

        appendLines(lines, value.lines)
        args.push(value.expression)
      } else if (paramValueType === 'string') {
        const value = deps.emitCValueExpression(arg, context)

        appendLines(lines, value.lines)
        args.push(value.expression)
      } else if (paramValueType === 'object') {
        const value = deps.emitCValueExpression(arg, context)

        appendLines(lines, value.lines)
        args.push(value.expression)
        appendObjectFunctionFieldArguments(args, arg, param, context, deps)
      } else if (isManagedRuntimeReturnType(paramValueType)) {
        const value = deps.emitCValueExpression(arg, context)

        appendLines(lines, value.lines)
        args.push(value.expression)
      } else if (paramValueType === 'function') {
        const runtimeFunctionType = deps.resolveRuntimeFunctionArgumentType(expression.callee, index, param, context)

        if (runtimeFunctionType != null) {
          const value = deps.emitRuntimeCallbackValue(arg, runtimeFunctionType, context)

          appendLines(lines, value.lines)
          args.push(value.expression)
        } else {
          args.push(deps.emitFunctionValueExpression(arg, context))
        }
      } else {
        args.push(deps.emitCExpression(arg, context))
      }
    } else {
      args.push(deps.emitCExpression(arg, context))
    }
  }

  for (let index = expression.args.length; index < params.length; index = index + 1) {
    const param = params[index]

    if (param.optional === true) {
      args.push(emitDefaultOptionalArg(param))
      appendDefaultObjectFunctionFieldArguments(args, param)
    }
  }

  return {
    lines,
    args
  }
}

function emitDefaultOptionalArg(param: CFunctionParam): string {
  if (param.nullable === true && isRuntimeNullableType(param.valueType)) {
    return 'ccjs_null_value()'
  }

  if (param.valueType === 'unknown' || isManagedRuntimeReturnType(param.valueType) || isOpaqueRuntimeValueType(param.valueType)) {
    return 'ccjs_undefined_value()'
  }

  return '0'
}

function emitPreparedThrowingCallExpression(
  expression: CValueNode,
  args: string[],
  preparedLines: string[],
  context: CFunctionContext,
  deps: CCallExpressionDependencies
): PreparedExpression {
  const name = stringValueAt(expression.callee.path, 0)
  const returnInfo = resolveCFunctionCallReturnInfo(name, context)
  const returnType = returnInfo.returnType
  const returnNullable = returnInfo.returnNullable
  const callArgs: string[] = []
  const lines: string[] = []
  let result = ''

  appendLines(callArgs, args)
  appendLines(lines, preparedLines)

  if (deps.currentErrorTarget(context) == null && !context.throwingFunction) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_THROW',
        'uncaught throwing function calls must be inside try/catch in the current C backend slice',
        expression.loc
      )
    )
  }

  deps.registerErrorChannel(context)
  appendLines(lines, emitPrepareOwnedValueWrite('ccjs_error'))

  if (returnType !== 'void') {
    if (
      returnType === 'unknown' ||
      isManagedRuntimeReturnType(returnType) ||
      isOpaqueRuntimeValueType(returnType) ||
      (returnNullable && isNullableScalarType(returnType))
    ) {
      result = nextCName(context, 'ccjs_call_result')
      lines.push(`ccjs_value ${result} = ccjs_undefined_value();`)
    } else {
      result = nextCName(context, 'ccjs_call_result')
      lines.push(`double ${result} = 0;`)
    }

    callArgs.push(`&${result}`)
  }

  callArgs.push('&ccjs_error')

  const status = nextCName(context, 'ccjs_call_status')

  lines.push(`ccjs_status ${status} = ${emitCallee(expression.callee, context)}(${joinStrings(callArgs, ', ')});`)
  appendLines(lines, emitThrowingCallStatusCheck(status, context, deps))

  return {
    lines,
    expression: result
  }
}

function resolveCFunctionCallReturnInfo(name: string, context: CFunctionContext): CFunctionCallReturnInfo {
  const configuredReturnType = context.functionReturnTypes.get(name)
  let returnType = 'void'

  if (configuredReturnType != null) {
    returnType = configuredReturnType
  }

  if (cBooleanValueIsTrue(context.functionAsyncFlags.get(name)) && returnType === 'promise') {
    const promiseValueType = context.functionReturnPromiseValueTypes.get(name)
    let asyncReturnType = 'void'

    if (promiseValueType != null) {
      asyncReturnType = promiseValueType
    }

    return {
      returnType: asyncReturnType,
      returnNullable: false
    }
  }

  return {
    returnType,
    returnNullable: cBooleanValueIsTrue(context.functionReturnNullables.get(name))
  }
}

function emitThrowingCallStatusCheck(status: string, context: CFunctionContext, deps: CCallExpressionDependencies): string[] {
  const target = deps.currentErrorTarget(context)
  const lines = [`if (${status} == CCJS_ERR_THROW) {`, '  ccjs_error_active = 1;']

  if (target != null) {
    lines.push(`  goto ${target};`)
  } else if (context.throwingFunction) {
    lines.push('  ccjs_status_result = CCJS_ERR_THROW;')
    lines.push('  goto ccjs_cleanup;')
  } else {
    lines.push(`  ${emitFailureStatement(context)}`)
  }

  lines.push('}')
  lines.push(`if (${status} != CCJS_OK) ${emitFailureStatement(context)}`)

  return lines
}

export function isThrowingFunctionCallee(callee: CValueNode, context: CEmitContext): boolean {
  if (callee.type !== 'Reference' || callee.path.length !== 1) {
    return false
  }

  const name = stringValueAt(callee.path, 0)

  return isThrowingFunctionName(name, context)
}

export function isThrowingFunctionName(name: string, context: CEmitContext): boolean {
  return context.throwingFunctions.has(name)
}

export function emitCallee(callee: CValueNode, context: CFunctionContext): string {
  const timeRuntimeCall = cTimeRuntimeCallName(callee) ?? ''

  if (timeRuntimeCall !== '') {
    return timeRuntimeCall
  }

  const objectFunctionCallee = objectFunctionFieldCallee(callee, context)

  if (objectFunctionCallee != null) {
    return objectFunctionCallee
  }

  if (callee.type === 'Reference' && callee.path.length === 1) {
    const name = stringValueAt(callee.path, 0)

    if (isCJsGlobalRoot(name, context)) {
      reportCJsGlobalDiagnostic(context.diagnostics, callee.loc)
      return '_'
    }

    const functionName = context.functionNames.get(name)

    if (functionName != null) {
      return functionName
    }

    return name
  }

  if (usesCJsGlobal(callee, context)) {
    reportCJsGlobalDiagnostic(context.diagnostics, callee.loc)
    return '_'
  }

  context.diagnostics.push(
    diagnostic('CCJS_C_CALL_EXPR', 'this call expression is not supported by the current C backend slice', callee.loc)
  )
  return '_'
}

export function emitCExpression(expression: CValueNode, context: CFunctionContext, deps: CScalarExpressionDependencies): string {
  if (isNullishCoalescingExpression(expression)) {
    context.diagnostics.push(
      diagnostic('CCJS_C_NULLISH', 'nullish coalescing is not supported by the current C backend slice', expression.loc)
    )
    return '0'
  }

  const valueType = deps.inferExpressionType(expression, context)

  if (valueType === 'string') {
    return deps.emitStringExpression(expression, context)
  }

  if (valueType === 'function') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_FUNCTION_VALUE',
        'function values are not supported by the current C backend slice',
        expressionLocation(expression)
      )
    )
    return '0'
  }

  if (valueType === 'timer') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_TIMER_HANDLE',
        'timer handles can only be stored or passed to clear timer functions in the current C backend slice',
        expressionLocation(expression)
      )
    )
    return '0'
  }

  if (valueType === 'crypto-hash') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_CRYPTO_HASH',
        'crypto hash handles can only be stored or used through Hash.update() and Hash.digest() in the current C backend slice',
        expressionLocation(expression)
      )
    )
    return '0'
  }

  if (valueType === 'crypto-hmac') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_CRYPTO_HMAC',
        'crypto hmac handles can only be stored or used through Hmac.update() and Hmac.digest() in the current C backend slice',
        expressionLocation(expression)
      )
    )
    return '0'
  }

  if (valueType === 'optional') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_OPTIONAL_CHAINING',
        'optional chaining is not supported by the current C backend slice',
        expressionLocation(expression)
      )
    )
    return '0'
  }

  if (valueType === 'js-global') {
    deps.reportCJsGlobalDiagnostic(context.diagnostics, expressionLocation(expression))
    return '0'
  }

  return emitPreparedNumberExpression(expression, context, deps).expression
}

export function emitPreparedNumberExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CScalarExpressionDependencies
): PreparedExpression {
  const classMethodCall = deps.emitPreparedClassMethodCallExpression(expression, context)

  if (classMethodCall != null && classMethodCall.expression !== '') {
    return classMethodCall
  }

  const fsConstant = deps.cFsRuntimeConstantExpression(expression)

  if (fsConstant != null) {
    return {
      lines: [],
      expression: fsConstant
    }
  }

  if (expression.bufferRuntimeConstant === 'MAX_LENGTH') {
    return {
      lines: [],
      expression: '((double)((size_t)-1))'
    }
  }

  const pathBooleanCall = deps.emitPreparedPathBooleanCallExpression(expression, context)

  if (pathBooleanCall != null) {
    return pathBooleanCall
  }

  const arrayIsArrayCall = deps.emitPreparedArrayIsArrayCallExpression(expression, context)

  if (arrayIsArrayCall != null) {
    return arrayIsArrayCall
  }

  const urlSearchParamsCall = deps.emitPreparedUrlSearchParamsCallExpression(expression, context)

  if (urlSearchParamsCall != null && urlSearchParamsCall.valueType === 'boolean') {
    return urlSearchParamsCall
  }

  const processNumber = deps.emitPreparedProcessNumberExpression(expression)

  if (processNumber != null) {
    return processNumber
  }

  if (expression.type === 'NumberLiteral') {
    return {
      lines: [],
      expression: expression.value
    }
  }

  if (isNarrowedNullableScalarReference(expression, context)) {
    const name = stringValueAt(expression.path, 0)
    const resolvedType = context.variables.get(name)
    let valueType = 'number'

    if (resolvedType != null) {
      valueType = resolvedType
    }

    return {
      lines: [],
      expression: scalarRuntimeValueExpression(name, valueType)
    }
  }

  if (isNullableScalarRuntimeExpression(expression, context)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_NULLISH',
        'nullable scalar values must be narrowed with ?? before scalar use in the current C backend slice',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: '0'
    }
  }

  if (expression.type === 'Reference') {
    return {
      lines: [],
      expression: deps.emitReference(expression, context)
    }
  }

  if (expression.type === 'BooleanLiteral') {
    let value = '0'

    if (expression.value) {
      value = '1'
    }

    return {
      lines: [],
      expression: value
    }
  }

  if (expression.type === 'NullLiteral') {
    return {
      lines: [],
      expression: '0'
    }
  }

  if (expression.type === 'UnaryExpression') {
    if (expression.operator === '!') {
      const truthiness = emitPreparedRuntimeTruthinessExpression(expression, context, deps)

      if (truthiness != null) {
        return truthiness
      }
    }

    const argument = emitPreparedNumberExpression(expression.argument, context, deps)

    return {
      lines: argument.lines,
      expression: `(${expression.operator}${argument.expression})`
    }
  }

  if (expression.type === 'UpdateExpression') {
    return emitPreparedUpdateExpression(expression, context, deps)
  }

  if (expression.type === 'BinaryExpression') {
    const scalarNullish = emitPreparedScalarNullishCoalescingExpression(expression, context, deps)

    if (scalarNullish != null) {
      return scalarNullish
    }

    if (isNullishCoalescingExpression(expression)) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_NULLISH',
          'nullish coalescing is not supported by the current C backend slice',
          expression.loc
        )
      )

      return {
        lines: [],
        expression: '0'
      }
    }

    const leftType = deps.inferExpressionType(expression.left, context)
    const rightType = deps.inferExpressionType(expression.right, context)
    const nullableNullCompare = emitPreparedNullableNullCompareExpression(expression, context, deps)

    if (nullableNullCompare != null) {
      return nullableNullCompare
    }

    const dynamicObjectNullCompare = emitPreparedDynamicObjectNullCompareExpression(expression, context, deps)

    if (dynamicObjectNullCompare != null) {
      return dynamicObjectNullCompare
    }

    const stringNullCompare = emitPreparedStringNullCompareExpression(expression, leftType, rightType)

    if (stringNullCompare != null) {
      return stringNullCompare
    }

    const runtimeReferenceCompare = emitPreparedRuntimeReferenceCompareExpression(
      expression,
      leftType,
      rightType,
      context,
      deps
    )

    if (runtimeReferenceCompare != null) {
      return runtimeReferenceCompare
    }

    const dynamicObjectBooleanLiteralCompare = emitPreparedDynamicObjectBooleanLiteralCompareExpression(
      expression,
      context,
      deps
    )

    if (dynamicObjectBooleanLiteralCompare != null) {
      return dynamicObjectBooleanLiteralCompare
    }

    const typeofCompare = emitPreparedTypeofCompareExpression(expression, context, deps)

    if (typeofCompare != null) {
      return typeofCompare
    }

    if (
      isEqualityOperator(expression.operator) &&
      deps.canEmitStringBytesOperand(expression.left, context) &&
      deps.canEmitStringBytesOperand(expression.right, context)
    ) {
      return deps.emitPreparedStringCompareExpression(expression, context)
    }

    const runtimeStringLiteralCompare = emitPreparedRuntimeStringLiteralCompareExpression(expression, context, deps)

    if (runtimeStringLiteralCompare != null) {
      return runtimeStringLiteralCompare
    }

    if (leftType === 'string' || rightType === 'string') {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_STRING_EXPR',
          'string binary expressions are not supported by the current C backend slice',
          expression.loc
        )
      )

      return {
        lines: [],
        expression: '0'
      }
    }

    if (expression.operator === '&&' || expression.operator === '||') {
      return emitPreparedLogicalExpression(expression, context, deps)
    }

    const left = emitPreparedNumberExpression(expression.left, context, deps)
    const right = emitPreparedNumberExpression(expression.right, context, deps)

    const lines: string[] = []

    appendLines(lines, left.lines)
    appendLines(lines, right.lines)

    return {
      lines,
      expression: `(${left.expression} ${emitCOperator(expression.operator)} ${right.expression})`
    }
  }

  if (expression.type === 'AssignmentExpression') {
    const value = emitPreparedNumberExpression(expression.value, context, deps)

    return {
      lines: value.lines,
      expression: `(${deps.emitReference(expression.target, context)} = ${value.expression})`
    }
  }

  if (expression.type === 'CallExpression') {
    const jsonScalarParse = deps.emitPreparedJsonScalarParseExpression(expression, context)

    if (jsonScalarParse != null) {
      return jsonScalarParse
    }

    const binaryCall = deps.emitPreparedBinaryNumberCallExpression(expression, context)

    if (binaryCall != null) {
      return binaryCall
    }

    const cryptoCall = deps.emitPreparedCryptoNumberCallExpression(expression, context)

    if (cryptoCall != null) {
      return cryptoCall
    }

    const numericCast = emitPreparedNumericCastExpression(expression, context, deps)

    if (numericCast != null) {
      return numericCast
    }

    if (deps.isStringPredicateCall(expression, context)) {
      return deps.emitPreparedStringPredicateCall(expression, context)
    }

    const stringCharCodeAt = deps.emitPreparedStringCharCodeAtExpression(expression, context)

    if (stringCharCodeAt != null) {
      return stringCharCodeAt
    }

    const stringIndexCall = deps.emitPreparedStringIndexCallExpression(expression, context)

    if (stringIndexCall != null) {
      return stringIndexCall
    }

    const collectionCall = deps.emitPreparedCollectionCallExpression(expression, context)

    if (collectionCall != null) {
      return collectionCall
    }

    return deps.emitPreparedCallExpression(expression, context)
  }

  if (deps.isMemberAccessExpression(expression)) {
    const dgramAddressPort = deps.emitPreparedDgramAddressPortExpression(expression, context)

    if (dgramAddressPort != null) {
      return dgramAddressPort
    }

    const netAddressPort = deps.emitPreparedNetAddressPortExpression(expression, context)

    if (netAddressPort != null) {
      return netAddressPort
    }

    const stringLength = deps.emitPreparedStringLengthExpression(expression, context)

    if (stringLength != null) {
      return stringLength
    }

    const length = deps.emitPreparedArrayLengthExpression(expression, context)

    if (length != null) {
      return length
    }

    const collectionSize = deps.emitPreparedCollectionSizeExpression(expression, context)

    if (collectionSize != null) {
      return collectionSize
    }

    const bytesLength = deps.emitPreparedBytesLengthExpression(expression, context)

    if (bytesLength != null) {
      return bytesLength
    }

    const member = deps.resolveKnownObjectMember(expression, context)

    if (member != null && isNumberOrBooleanValueType(member.valueType)) {
      const value = nextCName(context, 'ccjs_expr_value')
      const objectReference = deps.emitObjectValueReference(member.objectName ?? '', context)
      const getCall = `ccjs_object_get_known(${objectReference}, ${member.index}, &${value})`

      return emitPreparedRuntimeNumberValue(member.valueType, value, getCall, context)
    }

    const objectMember = deps.emitPreparedObjectExpressionScalarMemberValueExpression(expression, context)

    if (objectMember != null) {
      return {
        lines: objectMember.lines,
        expression: scalarRuntimeValueExpression(objectMember.expression, objectMember.valueType ?? 'number')
      }
    }
  }

  if (deps.isIndexAccessExpression(expression)) {
    const element = deps.resolveKnownArrayIndex(expression, context)

    if (element != null && isNumberOrBooleanValueType(element.valueType)) {
      const value = nextCName(context, 'ccjs_expr_value')
      const getCall = `ccjs_array_get(${element.arrayName}, ${element.index}, &${value})`

      return emitPreparedRuntimeNumberValue(element.valueType, value, getCall, context)
    }

    const field = deps.resolveKnownObjectIndex(expression, context)

    if (field != null && isNumberOrBooleanValueType(field.valueType)) {
      const value = nextCName(context, 'ccjs_expr_value')
      const objectReference = deps.emitObjectValueReference(field.objectName ?? '', context)
      const getCall = `ccjs_object_get(${objectReference}, ${cStringLiteral(field.key)}, ${utf8ByteLength(field.key)}, &${value})`

      return emitPreparedRuntimeNumberValue(field.valueType, value, getCall, context)
    }

    const objectField = deps.emitPreparedObjectExpressionScalarIndexValueExpression(expression, context)

    if (objectField != null) {
      return {
        lines: objectField.lines,
        expression: scalarRuntimeValueExpression(objectField.expression, objectField.valueType ?? 'number')
      }
    }

    const runtimeElement = deps.resolveRuntimeArrayIndex(expression, context)

    if (runtimeElement != null && isNumberOrBooleanValueType(runtimeElement.valueType)) {
      const value = deps.emitPreparedRuntimeArrayIndexValue(expression, runtimeElement, context, 'ccjs_expr_value')

      return {
        lines: value.lines,
        expression: scalarRuntimeValueExpression(value.expression, runtimeElement.valueType)
      }
    }

    const bytesIndex = deps.emitPreparedBytesIndexExpression(expression, context)

    if (bytesIndex != null) {
      return bytesIndex
    }
  }

  if (expression.type === 'AwaitExpression') {
    const valueType = deps.inferExpressionType(expression, context)
    const awaited = deps.emitCAwaitValueExpression(expression, context)

    return {
      lines: awaited.lines,
      expression: scalarRuntimeValueExpression(awaited.expression, valueType)
    }
  }

  const dynamicRuntimeScalar = emitPreparedDynamicRuntimeScalarValueExpression(expression, context, deps)

  if (dynamicRuntimeScalar != null) {
    return dynamicRuntimeScalar
  }

  if (isOptionalChainExpression(expression)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_OPTIONAL_CHAINING',
        'optional chaining is not supported by the current C backend slice',
        expressionLocation(expression)
      )
    )
    return {
      lines: [],
      expression: '0'
    }
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_C_NUMBER_EXPR',
      'this number expression is not supported by the current C backend slice',
      expressionLocation(expression)
    )
  )

  return {
    lines: [],
    expression: '0'
  }
}

export function emitPreparedRuntimeTruthinessExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CScalarExpressionDependencies
): PreparedExpression | null {
  if (expression.type === 'UnaryExpression' && expression.operator === '!') {
    const argument = emitPreparedRuntimeTruthinessExpression(expression.argument, context, deps)

    if (argument == null) {
      return null
    }

    return {
      lines: argument.lines,
      expression: `(!(${argument.expression}))`
    }
  }

  if (deps.isNullableScalarRuntimeExpression(expression, context)) {
    const value = deps.emitPreparedNullableScalarRuntimeValueExpression(expression, context)

    return {
      lines: value.lines,
      expression: `ccjs_value_truthy(${value.expression}) ? 1 : 0`
    }
  }

  const value = emitPreparedOptionalDynamicObjectFieldValueExpression(expression, context, deps)

  if (value == null) {
    return null
  }

  return {
    lines: value.lines,
    expression: `ccjs_value_truthy(${value.expression}) ? 1 : 0`
  }
}

function emitPreparedOptionalDynamicObjectFieldValueExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CScalarExpressionDependencies
): PreparedExpression | null {
  if (expression.type === 'MemberExpression') {
    return emitPreparedOptionalRuntimeObjectFieldValueExpression(expression.object, expression.property, context, deps)
  }

  if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
    return emitPreparedOptionalRuntimeObjectFieldValueExpression(expression.object, expression.index.value, context, deps)
  }

  return null
}

function emitPreparedOptionalRuntimeObjectFieldValueExpression(
  objectExpression: CValueNode,
  key: string,
  context: CFunctionContext,
  deps: CScalarExpressionDependencies
): PreparedExpression | null {
  if (deps.inferExpressionType(objectExpression, context) !== 'object') {
    return null
  }

  const object = deps.emitCValueExpression(objectExpression, context)
  const value = nextCName(context, 'ccjs_value')
  const status = nextCName(context, 'ccjs_field_status')
  const lines: string[] = []

  registerOwnedValue(context, value)
  appendLines(lines, object.lines)
  appendLines(lines, emitPrepareOwnedValueWrite(value))
  lines.push(
    `ccjs_status ${status} = ccjs_object_get(${object.expression}, ${cStringLiteral(key)}, ${utf8ByteLength(key)}, &${value});`
  )
  lines.push(`if (${status} == CCJS_ERR_FIELD) {`)
  lines.push(`  ${value} = ccjs_undefined_value();`)
  lines.push('}')
  lines.push(`if (${status} != CCJS_OK && ${status} != CCJS_ERR_FIELD) ${emitFailureStatement(context)}`)

  return {
    lines,
    expression: value
  }
}

function emitPreparedRuntimeStringLiteralCompareExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CScalarExpressionDependencies
): PreparedExpression | null {
  if (!isEqualityOperator(expression.operator)) {
    return null
  }

  const leftLiteral = stringLiteralValue(expression.left)

  if (leftLiteral != null) {
    return emitPreparedRuntimeValueStringLiteralCompare(
      expression.right,
      leftLiteral,
      expression.operator,
      context,
      deps
    )
  }

  const rightLiteral = stringLiteralValue(expression.right)

  if (rightLiteral != null) {
    return emitPreparedRuntimeValueStringLiteralCompare(
      expression.left,
      rightLiteral,
      expression.operator,
      context,
      deps
    )
  }

  return null
}

function emitPreparedRuntimeValueStringLiteralCompare(
  valueExpression: CValueNode,
  literal: string,
  operator: string,
  context: CFunctionContext,
  deps: CScalarExpressionDependencies
): PreparedExpression {
  const dynamicValue = emitPreparedDynamicRuntimeValueExpression(valueExpression, context, deps)

  if (dynamicValue != null) {
    return emitPreparedRuntimePreparedValueStringLiteralCompare(dynamicValue, literal, operator, context)
  }

  const value = deps.emitCValueExpression(valueExpression, context)

  return emitPreparedRuntimePreparedValueStringLiteralCompare(value, literal, operator, context)
}

function emitPreparedRuntimePreparedValueStringLiteralCompare(
  value: PreparedExpression,
  literal: string,
  operator: string,
  context: CFunctionContext
): PreparedExpression {
  const temp = nextCName(context, 'ccjs_string_cmp_value')
  const literalLength = utf8ByteLength(literal)
  const string = `((ccjs_string*)${temp}.as.ref)`
  const equals =
    `(${temp}.tag == CCJS_TAG_STRING && ${temp}.as.ref != 0 && ` +
    `${string}->len == ${literalLength} && memcmp(${string}->bytes, ${cStringLiteral(literal)}, ${literalLength}) == 0)`
  const lines: string[] = []
  let resultExpression = `(!${equals})`

  appendLines(lines, value.lines)
  lines.push(`ccjs_value ${temp} = ${value.expression};`)

  if (operator === '===' || operator === '==') {
    resultExpression = equals
  }

  return {
    lines,
    expression: resultExpression
  }
}

function stringLiteralValue(expression: CValueNode): string | null {
  if (expression.type === 'StringLiteral') {
    return expression.value
  }

  return null
}

function emitPreparedLogicalExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CScalarExpressionDependencies
): PreparedExpression {
  const left = emitPreparedNumberExpression(expression.left, context, deps)
  const leftNarrowing = resolveNullableScalarConditionNarrowing(expression.left, context)
  let rightNarrowed = leftNarrowing.falseNames

  if (expression.operator === '&&') {
    rightNarrowed = leftNarrowing.trueNames
  }
  const snapshot = pushNullableScalarNarrowing(context, rightNarrowed)
  const right = emitPreparedNumberExpression(expression.right, context, deps)

  restoreNullableScalarNarrowing(context, snapshot)

  const temp = nextCName(context, 'ccjs_logical')

  if (expression.operator === '&&') {
    const lines: string[] = []

    appendLines(lines, left.lines)
    lines.push(`double ${temp} = 0;`)
    lines.push(`if ${emitCConditionClause(left.expression)} {`)
    appendPrefixedLines(lines, right.lines, '  ')
    lines.push(`  ${temp} = ${right.expression};`)
    lines.push('}')

    return {
      lines,
      expression: temp
    }
  }

  const lines: string[] = []

  appendLines(lines, left.lines)
  lines.push(`double ${temp} = 0;`)
  lines.push(`if ${emitCConditionClause(left.expression)} {`)
  lines.push(`  ${temp} = 1;`)
  lines.push('} else {')
  appendPrefixedLines(lines, right.lines, '  ')
  lines.push(`  ${temp} = ${right.expression};`)
  lines.push('}')

  return {
    lines,
    expression: temp
  }
}

function emitPreparedScalarNullishCoalescingExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CScalarExpressionDependencies
): PreparedExpression | null {
  if (!canLowerCScalarNullishCoalescingExpression(expression, context)) {
    return null
  }

  const valueType = deps.inferExpressionType(expression, context)
  const expectedTag = cRuntimeValueTag(valueType)
  const left = deps.emitCValueExpression(expression.left, context)
  const right = emitPreparedNumberExpression(expression.right, context, deps)
  const temp = nextCName(context, 'ccjs_nullable_scalar')
  const leftValue = scalarRuntimeValueExpression(left.expression, valueType)
  const leftTypeCheck = emitRuntimeTypeCheck(`${left.expression}.tag != ${expectedTag}`, context)
  const lines: string[] = []

  appendLines(lines, left.lines)
  lines.push(`double ${temp} = 0;`)
  lines.push(`if (${left.expression}.tag == CCJS_TAG_NULL) {`)
  appendPrefixedLines(lines, right.lines, '  ')
  lines.push(`  ${temp} = ${right.expression};`)
  lines.push('} else {')
  lines.push(`  ${leftTypeCheck}`)
  lines.push(`  ${temp} = ${leftValue};`)
  lines.push('}')

  return {
    lines,
    expression: temp
  }
}

function emitPreparedNullableNullCompareExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CScalarExpressionDependencies
): PreparedExpression | null {
  if (!isEqualityOperator(expression.operator)) {
    return null
  }

  let nullable = expression.left
  let maybeNull = expression.right

  if (expression.left.type === 'NullLiteral') {
    nullable = expression.right
    maybeNull = expression.left
  }

  if (maybeNull.type !== 'NullLiteral' || !isNullableRuntimeExpression(nullable, context)) {
    return null
  }

  const value = deps.emitCValueExpression(nullable, context)
  const equals = `(${value.expression}.tag == CCJS_TAG_NULL || ${value.expression}.tag == CCJS_TAG_UNDEFINED)`
  let result = `(!${equals})`

  if (isPositiveEqualityOperator(expression.operator)) {
    result = equals
  }

  return {
    lines: value.lines,
    expression: result
  }
}

function emitPreparedStringNullCompareExpression(
  expression: CValueNode,
  leftType: string,
  rightType: string
): PreparedExpression | null {
  if (!isEqualityOperator(expression.operator)) {
    return null
  }

  const comparesStringWithNull =
    (leftType === 'string' && expression.right.type === 'NullLiteral') ||
    (rightType === 'string' && expression.left.type === 'NullLiteral')

  if (!comparesStringWithNull) {
    return null
  }

  if (isPositiveEqualityOperator(expression.operator)) {
    return {
      lines: [],
      expression: '0'
    }
  }

  return {
    lines: [],
    expression: '1'
  }
}

function emitPreparedRuntimeReferenceCompareExpression(
  expression: CValueNode,
  leftType: string,
  rightType: string,
  context: CFunctionContext,
  deps: CScalarExpressionDependencies
): PreparedExpression | null {
  if (!isEqualityOperator(expression.operator)) {
    return null
  }

  if (leftType !== rightType || !isRuntimeReferenceEqualityType(leftType)) {
    return null
  }

  const left = deps.emitCValueExpression(expression.left, context)
  const right = deps.emitCValueExpression(expression.right, context)
  const lines: string[] = []

  appendLines(lines, left.lines)
  appendLines(lines, right.lines)

  const equals = `(${left.expression}.tag == ${right.expression}.tag && ${left.expression}.as.ref == ${right.expression}.as.ref)`
  let result = `(!${equals})`

  if (isPositiveEqualityOperator(expression.operator)) {
    result = equals
  }

  return {
    lines,
    expression: result
  }
}

function emitPreparedDynamicObjectNullCompareExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CScalarExpressionDependencies
): PreparedExpression | null {
  if (!isEqualityOperator(expression.operator)) {
    return null
  }

  let valueExpression = expression.left
  let maybeNull = expression.right

  if (expression.left.type === 'NullLiteral') {
    valueExpression = expression.right
    maybeNull = expression.left
  }

  if (maybeNull.type !== 'NullLiteral') {
    return null
  }

  const value = emitPreparedDynamicRuntimeValueExpression(valueExpression, context, deps)

  if (value == null) {
    return null
  }

  const equals = `(${value.expression}.tag == CCJS_TAG_NULL || ${value.expression}.tag == CCJS_TAG_UNDEFINED)`
  let result = `(!${equals})`

  if (isPositiveEqualityOperator(expression.operator)) {
    result = equals
  }

  return {
    lines: value.lines,
    expression: result
  }
}

function emitPreparedDynamicObjectBooleanLiteralCompareExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CScalarExpressionDependencies
): PreparedExpression | null {
  if (!isEqualityOperator(expression.operator)) {
    return null
  }

  let valueExpression = expression.left
  let literal = booleanLiteralValue(expression.right)

  if (literal == null) {
    valueExpression = expression.right
    literal = booleanLiteralValue(expression.left)
  }

  if (literal == null) {
    return null
  }

  const value = emitPreparedDynamicRuntimeValueExpression(valueExpression, context, deps)

  if (value == null) {
    return null
  }

  const expected = runtimeBoolValueExpression(literal)
  const equals = `(${value.expression}.tag == CCJS_TAG_BOOL && ${value.expression}.as.boolean == ${expected})`
  let result = `(!${equals})`

  if (isPositiveEqualityOperator(expression.operator)) {
    result = equals
  }

  return {
    lines: value.lines,
    expression: result
  }
}

function emitPreparedDynamicRuntimeScalarValueExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CScalarExpressionDependencies
): PreparedExpression | null {
  const valueType = deps.inferExpressionType(expression, context)

  if (!isNumberOrBooleanValueType(valueType)) {
    return null
  }

  const value = emitPreparedDynamicRuntimeValueExpression(expression, context, deps)

  if (value == null) {
    return null
  }

  const check = emitRuntimeValueCheck(value.expression, cRuntimeValueTag(valueType), context)
  const lines: string[] = []

  appendLines(lines, value.lines)

  if (check !== '') {
    lines.push(check)
  }

  return {
    lines,
    expression: scalarRuntimeValueExpression(value.expression, valueType)
  }
}

function booleanLiteralValue(expression: CValueNode): boolean | null {
  if (expression.type !== 'BooleanLiteral') {
    return null
  }

  return expression.value
}

function isDynamicObjectFieldValueExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CDynamicObjectArrayIndexDependencies
): boolean {
  if (expression.type === 'MemberExpression') {
    return deps.inferExpressionType(expression.object, context) === 'object'
  }

  if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
    return deps.inferExpressionType(expression.object, context) === 'object'
  }

  return false
}

export function isDynamicRuntimeValueExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CScalarExpressionDependencies
): boolean {
  if (isRuntimeValueReferenceExpression(expression, context)) {
    return true
  }

  if (isDynamicObjectFieldValueExpression(expression, context, deps)) {
    return true
  }

  if (isDynamicObjectArrayIndexValueExpression(expression, context, deps)) {
    return true
  }

  return isDynamicRuntimeObjectFieldValueExpression(expression, context, deps)
}

function emitPreparedDynamicRuntimeValueExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CScalarExpressionDependencies
): PreparedExpression | null {
  const runtimeReference = emitPreparedRuntimeValueReferenceExpression(expression, context)

  if (runtimeReference != null) {
    return runtimeReference
  }

  if (isDynamicObjectFieldValueExpression(expression, context, deps)) {
    return deps.emitCValueExpression(expression, context)
  }

  const arrayIndexValue = emitPreparedDynamicObjectArrayIndexValueExpression(expression, context, deps)

  if (arrayIndexValue != null) {
    return arrayIndexValue
  }

  return emitPreparedDynamicRuntimeObjectFieldValueExpression(expression, context, deps)
}

function isDynamicRuntimeObjectFieldValueExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CDynamicObjectArrayIndexDependencies
): boolean {
  const access = dynamicRuntimeObjectFieldAccess(expression)

  if (access == null) {
    return false
  }

  return isDynamicRuntimeObjectValueExpression(access.object, context, deps)
}

function isDynamicRuntimeObjectValueExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CDynamicObjectArrayIndexDependencies
): boolean {
  if (isRuntimeValueReferenceExpression(expression, context)) {
    return true
  }

  if (isDynamicObjectFieldValueExpression(expression, context, deps)) {
    return true
  }

  if (isDynamicObjectArrayIndexValueExpression(expression, context, deps)) {
    return true
  }

  return isDynamicRuntimeObjectFieldValueExpression(expression, context, deps)
}

function emitPreparedDynamicRuntimeObjectFieldValueExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CDynamicObjectArrayIndexDependencies
): PreparedExpression | null {
  const access = dynamicRuntimeObjectFieldAccess(expression)

  if (access == null) {
    return null
  }

  const object = emitPreparedDynamicRuntimeObjectValueExpression(access.object, context, deps)

  if (object == null) {
    return null
  }

  const value = nextCName(context, 'ccjs_value')
  const status = nextCName(context, 'ccjs_field_status')
  const lines: string[] = []

  registerOwnedValue(context, value)
  appendLines(lines, object.lines)
  lines.push(emitRuntimeTypeCheck(`${object.expression}.tag != CCJS_TAG_OBJECT || ${object.expression}.as.ref == 0`, context))
  appendLines(lines, emitPrepareOwnedValueWrite(value))
  lines.push(
    `ccjs_status ${status} = ccjs_object_get(${object.expression}, ${cStringLiteral(access.key)}, ${utf8ByteLength(access.key)}, &${value});`
  )
  lines.push(`if (${status} == CCJS_ERR_FIELD) {`)
  lines.push(`  ${value} = ccjs_undefined_value();`)
  lines.push('}')
  lines.push(`if (${status} != CCJS_OK && ${status} != CCJS_ERR_FIELD) ${emitFailureStatement(context)}`)

  return {
    lines,
    expression: value
  }
}

function emitPreparedDynamicObjectArrayIndexValueExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CDynamicObjectArrayIndexDependencies
): PreparedExpression | null {
  if (expression.type !== 'IndexExpression') {
    return null
  }

  const access = dynamicObjectFieldAccess(expression.object, context, deps)

  if (access == null) {
    return null
  }

  const object = deps.emitCValueExpression(access.object, context)
  const index = emitPreparedDynamicArrayIndexExpression(expression.index, context, deps)

  if (index == null) {
    return null
  }

  const array = nextCName(context, 'ccjs_array_value')
  const value = nextCName(context, 'ccjs_value')
  const status = nextCName(context, 'ccjs_array_status')
  const lines: string[] = []

  registerOwnedValue(context, array)
  registerOwnedValue(context, value)
  appendLines(lines, object.lines)
  appendLines(lines, index.lines)
  appendLines(lines, emitPrepareOwnedValueWrite(array))
  lines.push(
    emitStatusCheck(
      `ccjs_object_get(${object.expression}, ${cStringLiteral(access.key)}, ${utf8ByteLength(access.key)}, &${array})`,
      context
    )
  )
  lines.push(emitRuntimeTypeCheck(`${array}.tag != CCJS_TAG_ARRAY || ${array}.as.ref == 0`, context))
  appendLines(lines, emitPrepareOwnedValueWrite(value))
  lines.push(`ccjs_status ${status} = ccjs_array_get(${array}, ${index.expression}, &${value});`)
  lines.push(`if (${status} == CCJS_ERR_FIELD) {`)
  lines.push(`  ${value} = ccjs_undefined_value();`)
  lines.push('}')
  lines.push(`if (${status} != CCJS_OK && ${status} != CCJS_ERR_FIELD) ${emitFailureStatement(context)}`)

  return {
    lines,
    expression: value
  }
}

function emitPreparedDynamicRuntimeObjectValueExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CDynamicObjectArrayIndexDependencies
): PreparedExpression | null {
  const runtimeReference = emitPreparedRuntimeValueReferenceExpression(expression, context)

  if (runtimeReference != null) {
    return runtimeReference
  }

  if (isDynamicObjectFieldValueExpression(expression, context, deps)) {
    return deps.emitCValueExpression(expression, context)
  }

  const arrayIndexValue = emitPreparedDynamicObjectArrayIndexValueExpression(expression, context, deps)

  if (arrayIndexValue != null) {
    return arrayIndexValue
  }

  return emitPreparedDynamicRuntimeObjectFieldValueExpression(expression, context, deps)
}

function emitPreparedRuntimeValueReferenceExpression(
  expression: CValueNode,
  context: CFunctionContext
): PreparedExpression | null {
  const name = runtimeValueReferenceName(expression, context)

  if (name == null) {
    return null
  }

  return {
    lines: [],
    expression: name
  }
}

function isDynamicObjectArrayIndexValueExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CDynamicObjectArrayIndexDependencies
): boolean {
  if (expression.type !== 'IndexExpression') {
    return false
  }

  if (dynamicObjectFieldAccess(expression.object, context, deps) == null) {
    return false
  }

  return isDynamicArrayIndexExpression(expression.index, context, deps)
}

function isDynamicArrayIndexExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CDynamicObjectArrayIndexDependencies
): boolean {
  if (expression.type === 'NumberLiteral') {
    return true
  }

  return deps.inferExpressionType(expression, context) === 'number'
}

function isRuntimeValueReferenceExpression(expression: CValueNode, context: CFunctionContext): boolean {
  return runtimeValueReferenceName(expression, context) != null
}

function runtimeValueReferenceName(expression: CValueNode, context: CFunctionContext): string | null {
  if (expression.type !== 'Reference' || expression.path.length !== 1) {
    return null
  }

  const name = stringValueAt(expression.path, 0)
  const valueType = context.variables.get(name)

  if (valueType !== 'unknown' && !isManagedRuntimeReturnType(valueType) && !isOpaqueRuntimeValueType(valueType)) {
    return null
  }

  if (!isOwnedRuntimeValueName(name, context) && valueType !== 'unknown' && !isOpaqueRuntimeValueType(valueType)) {
    return null
  }

  return name
}

function isOwnedRuntimeValueName(name: string, context: CFunctionContext): boolean {
  for (const value of context.ownedValues) {
    if (value === name) {
      return true
    }
  }

  return false
}

function emitPreparedDynamicArrayIndexExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CDynamicObjectArrayIndexDependencies
): PreparedExpression | null {
  if (expression.type === 'NumberLiteral') {
    return {
      lines: [],
      expression: `${parseArrayIndexExpression(expression.value)}`
    }
  }

  if (deps.inferExpressionType(expression, context) !== 'number') {
    return null
  }

  const index = deps.emitPreparedNumberExpression(expression, context)

  return {
    lines: index.lines,
    expression: `(size_t)(${index.expression})`
  }
}

function parseArrayIndexExpression(value: string): string {
  let out = 0

  if (value.length === 0) {
    return '0'
  }

  for (let index = 0; index < value.length; index = index + 1) {
    const code = value.charCodeAt(index)

    if (code < 48 || code > 57) {
      return '0'
    }

    out = out * 10 + (code - 48)
  }

  return `${out}`
}

function dynamicObjectFieldAccess(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CDynamicObjectArrayIndexDependencies
): CDynamicObjectFieldAccess | null {
  if (expression.type === 'MemberExpression' && deps.inferExpressionType(expression.object, context) === 'object') {
    return {
      object: expression.object,
      key: expression.property
    }
  }

  if (
    expression.type === 'IndexExpression' &&
    expression.index.type === 'StringLiteral' &&
    deps.inferExpressionType(expression.object, context) === 'object'
  ) {
    return {
      object: expression.object,
      key: expression.index.value
    }
  }

  return null
}

function dynamicRuntimeObjectFieldAccess(expression: CValueNode): CDynamicObjectFieldAccess | null {
  if (expression.type === 'MemberExpression') {
    return {
      object: expression.object,
      key: expression.property
    }
  }

  if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
    return {
      object: expression.object,
      key: expression.index.value
    }
  }

  return null
}

function emitPreparedNumericCastExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CScalarExpressionDependencies
): PreparedExpression | null {
  if (!isNumericCastCall(expression, context, deps)) {
    return null
  }

  const cast = stringValueAt(expression.callee.path, 0)
  const value = emitPreparedNumberExpression(expression.args[0], context, deps)

  if (cast === 'f64') {
    return value
  }

  if (cast === 'f32') {
    const result = nextCName(context, 'ccjs_f32')
    const lines: string[] = []

    appendLines(lines, value.lines)
    lines.push(`double ${result} = (double)((float)${value.expression});`)

    return {
      lines,
      expression: result
    }
  }

  const limits = numericIntegerCastLimits(cast)

  if (limits == null) {
    return null
  }

  const raw = nextCName(context, `ccjs_${cast}_value`)
  const truncated = nextCName(context, `ccjs_${cast}_truncated`)
  const result = nextCName(context, `ccjs_${cast}`)
  const lines: string[] = []

  appendLines(lines, value.lines)
  lines.push(`double ${raw} = ${value.expression};`)
  lines.push(emitRuntimeTypeCheck(`${raw} != ${raw} || (${raw} - ${raw}) != 0`, context))
  lines.push(emitRuntimeTypeCheck(`${raw} <= ${limits.preMin} || ${raw} >= ${limits.preMax}`, context))
  lines.push(`long long ${truncated} = (long long)${raw};`)
  lines.push(emitRuntimeTypeCheck(`${truncated} < ${limits.min}LL || ${truncated} > ${limits.max}LL`, context))
  lines.push(`double ${result} = (double)${truncated};`)

  return {
    lines,
    expression: result
  }
}

function isNumericCastCall(expression: CValueNode, context: CFunctionContext, deps: CScalarExpressionDependencies): boolean {
  if (
    expression.type !== 'CallExpression' ||
    expression.callee.type !== 'Reference' ||
    expression.callee.path.length !== 1 ||
    expression.args.length !== 1
  ) {
    return false
  }

  const cast = stringValueAt(expression.callee.path, 0)

  if (!isNumericCastName(cast)) {
    return false
  }

  return deps.inferExpressionType(expression.args[0], context) === 'number'
}

function numericIntegerCastLimits(cast: string): NumericIntegerCastLimits | null {
  if (cast === 'i32') {
    return {
      preMin: '-2147483649.0',
      preMax: '2147483648.0',
      min: '-2147483648',
      max: '2147483647'
    }
  }

  if (cast === 'u32') {
    return {
      preMin: '-1.0',
      preMax: '4294967296.0',
      min: '0',
      max: '4294967295'
    }
  }

  if (cast === 'u64') {
    return {
      preMin: '-1.0',
      preMax: '9007199254740992.0',
      min: '0',
      max: '9007199254740991'
    }
  }

  return null
}

export function emitPreparedUpdateExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CScalarExpressionDependencies
): PreparedExpression {
  const reference = deps.emitReference(expression.argument, context)
  let operator = '++'

  if (expression.operator === '--') {
    operator = '--'
  }

  if (expression.prefix !== false) {
    return {
      lines: [],
      expression: `(${operator}${reference})`
    }
  }

  const previous = nextCName(context, 'ccjs_update_previous')

  return {
    lines: [`double ${previous} = ${reference};`, `${reference}${operator};`],
    expression: previous
  }
}

function emitPreparedRuntimeNumberValue(
  valueType: string,
  value: string,
  getCall: string,
  context: CFunctionContext
): PreparedExpression {
  registerOwnedValue(context, value)
  const lines: string[] = []

  appendLines(lines, emitPrepareOwnedValueWrite(value))
  lines.push(emitStatusCheck(getCall, context))

  return {
    lines,
    expression: scalarRuntimeValueExpression(value, valueType)
  }
}

export type CValueExpressionDependencies = {
  emitCArrayLiteralValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitCAwaitValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitCClassObjectValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitCErrorObjectValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitCNullishCoalescingValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitCNumberConversionValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitCObjectLiteralValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitCValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitCOptionalIndexValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitCOptionalMemberValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitCStringConcatValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitCStringConversionValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitCStringIndexValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitCStringSliceValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitCStringSplitValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitCStringTrimValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitCTemplateLiteralValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitOptionalRuntimeCallbackCallValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitPreparedArrayPopCallExpression(
    expression: CValueNode,
    context: CFunctionContext,
    options: PreparedCallOptions | null
  ): PreparedExpression | null
  emitPreparedArraySliceCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedBinaryValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitPreparedChildProcessCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedClassMethodCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedCollectionCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedCollectionConstructorValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedCryptoCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedDebugMemoryCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedFetchHeadersCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedFsSyncValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedJsonCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedKnownArrayIndexValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedKnownObjectIndexValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedKnownObjectMemberValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedMapIndexGetExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedNullableScalarRuntimeValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitPreparedObjectValuesCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedDynamicObjectIndexValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedDynamicObjectMemberValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedNumberExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitPreparedObjectExpressionIndexValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedObjectExpressionMemberValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedOsConstantExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedOsStringCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedPathConstantExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedPathObjectCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedPathStringCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedProcessStringExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedRuntimeArrayIndexValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedUrlObjectExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedUrlSearchParamsCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedUrlSearchParamsObjectExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedUrlStringCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  inferExpressionType(expression: CValueNode, context: CFunctionContext): string
  isBoxedRuntimeValueName(name: string, context: CFunctionContext): boolean
  isClassConstructorExpression(expression: CValueNode, context: CFunctionContext): boolean
  isErrorConstructorExpression(expression: CValueNode): boolean
  isIndexAccessExpression(expression: CValueNode): boolean
  isMemberAccessExpression(expression: CValueNode): boolean
  isNullableRuntimeExpression(expression: CValueNode, context: CFunctionContext): boolean
  isNullableScalarRuntimeExpression(expression: CValueNode, context: CFunctionContext): boolean
  isStringConcatExpression(expression: CValueNode, context: CFunctionContext): boolean
  isStringConversionCall(expression: CValueNode, context: CFunctionContext): boolean
  isStringSliceCall(expression: CValueNode, context: CFunctionContext): boolean
  isStringSplitCall(expression: CValueNode, context: CFunctionContext): boolean
  isStringTrimCall(expression: CValueNode, context: CFunctionContext): boolean
}

export function emitCValueExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CValueExpressionDependencies
): PreparedExpression {
  if (isNullishCoalescingExpression(expression)) {
    return deps.emitCNullishCoalescingValueExpression(expression, context)
  }

  if (expression.type === 'AwaitExpression') {
    return deps.emitCAwaitValueExpression(expression, context)
  }

  const childProcessCall = deps.emitPreparedChildProcessCallExpression(expression, context)

  if (childProcessCall != null) {
    return childProcessCall
  }

  const osConstant = deps.emitPreparedOsConstantExpression(expression, context)

  if (osConstant != null) {
    return osConstant
  }

  const osStringCall = deps.emitPreparedOsStringCallExpression(expression, context)

  if (osStringCall != null) {
    return osStringCall
  }

  const processString = deps.emitPreparedProcessStringExpression(expression, context)

  if (processString != null) {
    return processString
  }

  const urlStringCall = deps.emitPreparedUrlStringCallExpression(expression, context)

  if (urlStringCall != null) {
    return urlStringCall
  }

  const urlObject = deps.emitPreparedUrlObjectExpression(expression, context)

  if (urlObject != null) {
    return urlObject
  }

  const urlSearchParamsObject = deps.emitPreparedUrlSearchParamsObjectExpression(expression, context)

  if (urlSearchParamsObject != null) {
    return urlSearchParamsObject
  }

  const pathConstant = deps.emitPreparedPathConstantExpression(expression, context)

  if (pathConstant != null) {
    return pathConstant
  }

  const pathObject = deps.emitPreparedPathObjectCallExpression(expression, context)

  if (pathObject != null) {
    return pathObject
  }

  const pathCall = deps.emitPreparedPathStringCallExpression(expression, context)

  if (pathCall != null) {
    return pathCall
  }

  const fsSyncValue = deps.emitPreparedFsSyncValueExpression(expression, context)

  if (fsSyncValue != null) {
    return fsSyncValue
  }

  const fetchHeadersCall = deps.emitPreparedFetchHeadersCallExpression(expression, context)

  if (fetchHeadersCall != null) {
    return fetchHeadersCall
  }

  const urlSearchParamsCall = deps.emitPreparedUrlSearchParamsCallExpression(expression, context)

  if (urlSearchParamsCall != null) {
    return urlSearchParamsCall
  }

  const jsonCall = deps.emitPreparedJsonCallExpression(expression, context)

  if (jsonCall != null) {
    return jsonCall
  }

  const debugMemoryCall = deps.emitPreparedDebugMemoryCallExpression(expression, context)

  if (debugMemoryCall != null) {
    return debugMemoryCall
  }

  const cryptoCall = deps.emitPreparedCryptoCallExpression(expression, context)

  if (cryptoCall != null) {
    return cryptoCall
  }

  const binaryValue = deps.emitPreparedBinaryValueExpression(expression, context)

  if (binaryValue != null) {
    return binaryValue
  }

  const arrayPopCall = deps.emitPreparedArrayPopCallExpression(expression, context, null)

  if (arrayPopCall != null) {
    return arrayPopCall
  }

  const arraySliceCall = deps.emitPreparedArraySliceCallExpression(expression, context)

  if (arraySliceCall != null) {
    return arraySliceCall
  }

  const mapIndexGet = deps.emitPreparedMapIndexGetExpression(expression, context)

  if (mapIndexGet != null) {
    return mapIndexGet
  }

  const collectionConstructor = deps.emitPreparedCollectionConstructorValueExpression(expression, context)

  if (collectionConstructor != null) {
    return collectionConstructor
  }

  const objectValuesCall = deps.emitPreparedObjectValuesCallExpression(expression, context)

  if (objectValuesCall != null) {
    return objectValuesCall
  }

  if (deps.isErrorConstructorExpression(expression)) {
    return deps.emitCErrorObjectValueExpression(expression, context)
  }

  if (deps.isClassConstructorExpression(expression, context)) {
    return deps.emitCClassObjectValueExpression(expression, context)
  }

  if (expression.type === 'OptionalCallExpression' && deps.isNullableRuntimeExpression(expression, context)) {
    return deps.emitOptionalRuntimeCallbackCallValueExpression(expression, context)
  }

  const numberConversion = deps.emitCNumberConversionValueExpression(expression, context)

  if (numberConversion != null) {
    return numberConversion
  }

  if (deps.isNullableScalarRuntimeExpression(expression, context)) {
    return deps.emitPreparedNullableScalarRuntimeValueExpression(expression, context)
  }

  if (deps.isStringConversionCall(expression, context)) {
    return deps.emitCStringConversionValueExpression(expression, context)
  }

  if (deps.isStringTrimCall(expression, context)) {
    return deps.emitCStringTrimValueExpression(expression, context)
  }

  if (deps.isStringSliceCall(expression, context)) {
    return deps.emitCStringSliceValueExpression(expression, context)
  }

  if (deps.isStringSplitCall(expression, context)) {
    return deps.emitCStringSplitValueExpression(expression, context)
  }

  if (deps.isStringConcatExpression(expression, context)) {
    return deps.emitCStringConcatValueExpression(expression, context)
  }

  const stringIndex = deps.emitCStringIndexValueExpression(expression, context)

  if (stringIndex != null) {
    return stringIndex
  }

  if (expression.type === 'TemplateLiteral') {
    return deps.emitCTemplateLiteralValueExpression(expression, context)
  }

  if (expression.type === 'ArrayLiteral') {
    return deps.emitCArrayLiteralValueExpression(expression, context)
  }

  if (expression.type === 'ObjectLiteral') {
    return deps.emitCObjectLiteralValueExpression(expression, context)
  }

  if (expression.type === 'StringLiteral') {
    const temp = nextCName(context, 'ccjs_value')
    registerOwnedValue(context, temp)
    const lines: string[] = []

    appendLines(lines, emitPrepareOwnedValueWrite(temp))
    lines.push(
      emitStatusCheck(
        `ccjs_string_from_literal(&ccjs_default_allocator, ${cStringLiteral(expression.value)}, ${utf8ByteLength(expression.value)}, &${temp})`,
        context
      )
    )

    return {
      lines,
      expression: temp
    }
  }

  if (expression.type === 'NumberLiteral') {
    return {
      lines: [],
      expression: `ccjs_number_value(${expression.value})`
    }
  }

  if (expression.type === 'BooleanLiteral') {
    return {
      lines: [],
      expression: `ccjs_bool_value(${runtimeBoolValueExpression(expression.value)})`
    }
  }

  if (expression.type === 'NullLiteral') {
    return {
      lines: [],
      expression: 'ccjs_null_value()'
    }
  }

  if (expression.type === 'Reference') {
    const name = joinStrings(expression.path, '_')
    const valueType = context.variables.get(name) ?? ''

    if (context.nullableVariables.has(name)) {
      return {
        lines: [],
        expression: name
      }
    }

    if (deps.isBoxedRuntimeValueName(name, context)) {
      let tag = 'CCJS_TAG_OBJECT'

      if (valueType === 'string') {
        tag = 'CCJS_TAG_STRING'
      }

      return {
        lines: [emitRuntimeTypeCheck(`(*${name}).tag != ${tag} || (*${name}).as.ref == 0`, context)],
        expression: `(*${name})`
      }
    }

    if (valueType === 'string' && context.runtimeStrings.has(name)) {
      const temp = nextCName(context, 'ccjs_value')

      return {
        lines: [
          `ccjs_value ${temp};`,
          `${temp}.tag = CCJS_TAG_STRING;`,
          `${temp}.as.ref = (ccjs_ref*)&${name}->header;`
        ],
        expression: temp
      }
    }

    if (
      valueType === 'bytes' ||
      valueType === 'object' ||
      valueType === 'array'
    ) {
      return {
        lines: [],
        expression: name
      }
    }

    if (valueType === 'map' || valueType === 'set') {
      return {
        lines: [],
        expression: name
      }
    }

    if (valueType === 'unknown' || isOpaqueRuntimeValueType(valueType)) {
      return {
        lines: [],
        expression: name
      }
    }

    if (valueType === 'number') {
      return {
        lines: [],
        expression: `ccjs_number_value(${name})`
      }
    }

    if (valueType === 'boolean') {
      return {
        lines: [],
        expression: `ccjs_bool_value(${name})`
      }
    }
  }

  if (expression.type === 'OptionalMemberExpression') {
    return deps.emitCOptionalMemberValueExpression(expression, context)
  }

  if (expression.type === 'OptionalIndexExpression') {
    return deps.emitCOptionalIndexValueExpression(expression, context)
  }

  if (deps.isMemberAccessExpression(expression)) {
    const memberValue = deps.emitPreparedKnownObjectMemberValueExpression(expression, context)

    if (memberValue != null) {
      return memberValue
    }

    const objectMemberValue = deps.emitPreparedObjectExpressionMemberValueExpression(expression, context)

    if (objectMemberValue != null) {
      return objectMemberValue
    }

    const dynamicMemberValue = deps.emitPreparedDynamicObjectMemberValueExpression(expression, context)

    if (dynamicMemberValue != null) {
      return dynamicMemberValue
    }

    const dynamicRuntimeMemberValue = emitPreparedDynamicRuntimeObjectFieldValueExpression(expression, context, deps)

    if (dynamicRuntimeMemberValue != null) {
      return dynamicRuntimeMemberValue
    }
  }

  if (deps.isIndexAccessExpression(expression)) {
    const arrayValue = deps.emitPreparedKnownArrayIndexValueExpression(expression, context)

    if (arrayValue != null) {
      return arrayValue
    }

    const runtimeArrayValue = deps.emitPreparedRuntimeArrayIndexValueExpression(expression, context)

    if (runtimeArrayValue != null) {
      return runtimeArrayValue
    }

    const dynamicArrayValue = emitPreparedDynamicObjectArrayIndexValueExpression(expression, context, deps)

    if (dynamicArrayValue != null) {
      return dynamicArrayValue
    }

    const objectValue = deps.emitPreparedKnownObjectIndexValueExpression(expression, context)

    if (objectValue != null) {
      return objectValue
    }

    const objectExpressionValue = deps.emitPreparedObjectExpressionIndexValueExpression(expression, context)

    if (objectExpressionValue != null) {
      return objectExpressionValue
    }

    const dynamicObjectValue = deps.emitPreparedDynamicObjectIndexValueExpression(expression, context)

    if (dynamicObjectValue != null) {
      return dynamicObjectValue
    }

    const dynamicRuntimeIndexValue = emitPreparedDynamicRuntimeObjectFieldValueExpression(expression, context, deps)

    if (dynamicRuntimeIndexValue != null) {
      return dynamicRuntimeIndexValue
    }
  }

  const scalarValue = emitPreparedScalarRuntimeValueExpression(expression, context, deps)

  if (scalarValue != null) {
    return scalarValue
  }

  if (expression.type === 'CallExpression') {
    const valueType = deps.inferExpressionType(expression, context)

    if (valueType !== 'unknown' && !isManagedRuntimeReturnType(valueType) && !isOpaqueRuntimeValueType(valueType)) {
      return emitUnsupportedCValueExpression(expression, context, deps)
    }

    const collectionCall = deps.emitPreparedCollectionCallExpression(expression, context)

    if (collectionCall != null) {
      return collectionCall
    }

    const classMethodCall = deps.emitPreparedClassMethodCallExpression(expression, context)

    if (classMethodCall != null) {
      return classMethodCall
    }

    const temp = nextCName(context, 'ccjs_value')
    const tag = cRuntimeValueTag(valueType)
    registerOwnedValue(context, temp)
    const call = deps.emitPreparedCallExpression(expression, context)
    const lines: string[] = []

    appendLines(lines, call.lines)
    appendLines(lines, emitPrepareOwnedValueWrite(temp))
    lines.push(`${temp} = ${call.expression};`)
    lines.push(emitRuntimeValueCheck(temp, tag, context))

    return {
      lines,
      expression: temp
    }
  }

  return emitUnsupportedCValueExpression(expression, context, deps)
}

function emitUnsupportedCValueExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CValueExpressionDependencies
): PreparedExpression {
  const unsupportedType = deps.inferExpressionType(expression, context)
  let unsupportedMessage = 'this object field expression is not supported by the current C backend slice'

  if (unsupportedType === 'function') {
    unsupportedMessage = 'stored callback values need delayed closure lifetime support and are not supported by the current C backend slice'
  }

  context.diagnostics.push(
    diagnostic(
      cUnsupportedExpressionCode(unsupportedType),
      unsupportedMessage,
      expressionLocation(expression)
    )
  )

  return {
    lines: [],
    expression: 'ccjs_undefined_value()'
  }
}

function emitPreparedScalarRuntimeValueExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CValueExpressionDependencies
): PreparedExpression | null {
  const valueType = deps.inferExpressionType(expression, context)

  if (valueType !== 'number' && valueType !== 'boolean') {
    return null
  }

  const value = deps.emitPreparedNumberExpression(expression, context)

  return {
    lines: value.lines,
    expression: boxedScalarRuntimeValueExpression(value.expression, valueType)
  }
}

export function emitCConditionClause(expression: string): string {
  const trimmed = expression.trim()

  return wrappedCExpression(trimmed)
}

export function emitCNegatedConditionClause(expression: string): string {
  return `(!${emitCConditionClause(expression)})`
}

function isWrappedCExpression(expression: string): boolean {
  if (!expression.startsWith('(') || !expression.endsWith(')')) {
    return false
  }

  let depth = 0

  for (let index = 0; index < expression.length; index = index + 1) {
    const char = expression[index]

    if (char === '(') {
      depth = depth + 1
    } else if (char === ')') {
      depth = depth - 1

      if (depth === 0 && index < expression.length - 1) {
        return false
      }
    }

    if (depth < 0) {
      return false
    }
  }

  return depth === 0
}
