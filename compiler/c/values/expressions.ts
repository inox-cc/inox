import { diagnostic } from '../../diagnostics.ts'
import { emitCRegExpFlags } from '../../../stdlib/global/compiler/feature.ts'
import { isNumericCastName, stringRuntimeReturnType } from '../../../stdlib/global/compiler/descriptor.ts'
import type { AnyNode, Diagnostic, SourceLocation } from '../../types.ts'
import {
  emitFunctionPointerParams,
  emitFunctionPointerReturnType,
  isPlainFunctionPointerType,
  isRuntimeFunctionType
} from '../async/callbacks.ts'
import type { AsyncTaskLoweringDependencies } from '../async/tasks.ts'
import {
  cloneCStringSet,
  emitFailureStatement,
  emitPrepareOwnedValueWrite,
  emitRuntimeTypeCheck,
  emitStatusCheck,
  nextCName,
  pushDiagnostic,
  registerEventLoop,
  registerOwnedValue
} from '../context.ts'
import { reportCJsGlobalDiagnostic } from '../diagnostics.ts'
import { isCJsGlobalRoot, usesCJsGlobal } from '../globals.ts'
import { cStringLiteral, emitCIdentifier, emitCObjectFunctionFieldName, utf8ByteLength } from '../identifiers.ts'
import { mathRuntimeMethodName } from '../runtime-methods.ts'
import {
  emitRuntimeNullableValueCheck,
  emitRuntimeValueCheck,
  runtimeObjectApiValueMismatchCondition,
  runtimeObjectLikeTagMatchCondition
} from '../runtime-values.ts'
import { cTimeRuntimeCallName } from '../../../stdlib/global/compiler/c.ts'
import {
  cUnsupportedExpressionCode,
  emitCOperator,
  isCoalesceExpression,
  isOptionalChainExpression
} from '../syntax.ts'
import type {
  CFunctionParam,
  CFunctionReturnMapType,
  CFunctionType,
  CArrayElementInfo,
  CKnownArrayElement,
  CKnownObjectField,
  CKnownObjectIndexField,
  CObjectAccessorReturnPath,
  CObjectShape,
  CObjectShapeField,
  CRuntimeArrayElement,
  CPreparedCallArgs as PreparedCallArgs,
  CPreparedCallOptions as PreparedCallOptions,
  CPreparedExpression as PreparedExpression,
  CPreparedStringBytesOperand as PreparedStringBytesOperand,
  CClassInfo
} from '../types.ts'
import {
  cRuntimeValueTag,
  isManagedRuntimeReturnType,
  isNullableScalarParam,
  isNullableScalarType,
  isOpaqueRuntimeValueType,
  isRuntimeNullableType
} from '../value-types.ts'
import type { ArrayLoweringDependencies } from './arrays.ts'
import {
  cClassValueTypeName,
  emitPreparedClassInstanceRefValueExpression,
  emitPreparedNativeClassFieldScalarExpression,
  emitPreparedNativeClassFieldValueExpression
} from './classes.ts'
import type { ClassLoweringDependencies } from './classes.ts'
import type { CollectionLoweringDependencies } from './collections.ts'
import type { NullableLoweringDependencies } from './nullable.ts'
import {
  canLowerCScalarNullishCoalescingExpression,
  isNarrowedNullableScalarReference,
  isNullableRuntimeExpression,
  isNullableScalarRuntimeExpression,
  resolveNullableScalarConditionNarrowing
} from './nullable.ts'
import type { StatementLoweringDependencies } from './statements.ts'
import type { StringLoweringDependencies } from './strings.ts'

type CBooleanMap = Map<string, boolean>
type CFunctionReturnMapTypeMap = Map<string, CFunctionReturnMapType>
type CFunctionTypeMap = Map<string, CFunctionType>
type CObjectAccessorReturnPathMap = Map<string, CObjectAccessorReturnPath>
type CObjectShapeFieldMap = Map<string, CObjectShapeField[]>
type CStringMap = Map<string, string>
type CStringNullableMap = Map<string, string | null>
type CStringSet = Set<string>
type CValueNode = AnyNode
type CObjectPathContext = {
  objectAccessorReturnPaths: CObjectAccessorReturnPathMap
  objectAliases: CStringMap
}
type CObjectLiteralPropertyNode = {
  key: string
  value?: CValueNode | null
}

type ObjectFunctionArgumentSource = {
  expression: CValueNode | null
  loc?: SourceLocation
  pathName: string | null
  shape: CObjectShape | null
  shapeKnown: boolean
}

type RuntimeObjectFunctionCallee = {
  functionType: CFunctionType
  name: string
}

type ObjectFunctionFieldResolution = {
  field: CObjectShapeField
  fieldName: string
  objectName: string
}

type CDynamicObjectArrayIndexDependencies = {
  emitCValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitPreparedArrayLengthExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedNumberExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitPreparedRuntimeArrayIndexValue(
    expression: CValueNode,
    element: CRuntimeArrayElement,
    context: CFunctionContext,
    tempPrefix: string
  ): PreparedExpression
  inferExpressionType(expression: CValueNode, context: CFunctionContext): string
  resolveRuntimeArrayIndex(expression: CValueNode, context: CFunctionContext): CRuntimeArrayElement | null
}

type CDynamicObjectFieldAccessDependencies = {
  inferExpressionType(expression: CValueNode, context: CFunctionContext): string
}

type CDynamicObjectFieldAccess = {
  object: CValueNode
  key: string
}

type CDynamicObjectArrayReceiver = PreparedExpression & {
  key: string
}

type CEmitContext = {
  objectAccessorReturnPaths: CObjectAccessorReturnPathMap
  throwingFunctions: CStringSet
}

type CFunctionContext = CEmitContext & {
  arrayLoweringDependencies: ArrayLoweringDependencies
  arrayLengths: Map<string, number>
  arrayShapes: Map<string, CArrayElementInfo[]>
  boxedVariables: CStringSet
  cleanupEnabled: boolean
  diagnostics: Diagnostic[]
  eventLoopUsed: boolean
  explicitEventLoop: boolean
  asyncTaskLoweringDependencies: AsyncTaskLoweringDependencies
  classInfos: Map<string, CClassInfo>
  classInstanceTypes: CStringMap
  classLoweringDependencies: ClassLoweringDependencies
  collectionLoweringDependencies: CollectionLoweringDependencies
  externalEventLoop: boolean
  externalEventLoopFunctions: CStringSet
  errorChannelUsed: boolean
  errorTargets: string[]
  failureStatement?: string | null
  failureStatementUsed?: boolean
  functionAsyncFlags: CBooleanMap
  functionNames: CStringMap
  functionParams: Map<string, CFunctionParam[]>
  functionReturnArrayElementTypes: CStringNullableMap
  functionReturnDeclaredTypes: CStringNullableMap
  functionReturnNullables: CBooleanMap
  functionReturnPromiseValueTypes: CStringNullableMap
  functionReturnShapes: Map<string, CObjectShape | null>
  functionReturnTypes: CStringMap
  functionTypes: CFunctionTypeMap
  jsGlobalRoots: CStringSet
  localValueNames: CStringSet
  mapTypes: CFunctionReturnMapTypeMap
  moduleObjectShapes: CObjectShapeFieldMap
  moduleValueNames: CStringMap
  moduleValueTypes: CStringMap
  narrowedNullableScalars: CStringSet
  nextId: number
  nullableLoweringDependencies: NullableLoweringDependencies
  nullableVariables: CStringSet
  objectAliases: CStringMap
  objectDeclaredTypes: CStringNullableMap
  objectShapes: CObjectShapeFieldMap
  ownedValues: string[]
  cppStringValues: CStringSet
  cppValueTypes: CStringMap
  regexpLiterals: Map<string, CValueNode>
  returnType?: string
  runtimeFunctionParams: CFunctionTypeMap
  runtimeArrayElementTypes: CStringMap
  runtimeCallbacks: CStringSet
  runtimeStringValues: CStringMap
  runtimeStrings: CStringSet
  setElementTypes: CStringMap
  statusReturn: boolean
  statementLoweringDependencies: StatementLoweringDependencies
  stringLoweringDependencies: StringLoweringDependencies
  throwingFunction: boolean
  usedCleanupGoto: boolean
  variables: CStringMap
}

function cBooleanValueIsTrue(value: boolean | null | undefined): boolean {
  if (value === null || typeof value === 'undefined') {
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

type TypeofOperandStorage = 'runtime-value' | 'raw-string' | 'raw-number' | 'raw-boolean' | 'raw-pointer'

type PreparedTypeofOperand = {
  lines: string[]
  expression: string
  storage: TypeofOperandStorage
  valueType: string
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

function currentRuntimeErrorTarget(context: CFunctionContext): string {
  if (context.errorTargets.length === 0) {
    return ''
  }

  return context.errorTargets[context.errorTargets.length - 1]
}

function registerRuntimeErrorChannel(context: CFunctionContext): void {
  context.errorChannelUsed = true
  registerRuntimeErrorValue(context)
}

function registerRuntimeErrorValue(context: CFunctionContext): void {
  registerOwnedValue(context, 'inox_error')
}

function emitRuntimeThrownCheckLines(context: CFunctionContext): string[] {
  const target = currentRuntimeErrorTarget(context)

  if (target !== '') {
    return [`if (inox::thrown()) goto ${target};`]
  }

  if (!context.throwingFunction) {
    return [`if (inox::thrown()) ${emitFailureStatement(context)}`]
  }

  registerRuntimeErrorChannel(context)

  return [
    'if (inox::thrown()) {',
    '  inox_error = inox::take_exception();',
    '  inox_error_active = 1;',
    '  inox_status_result = INOX_ERR_THROW;',
    '  goto cleanup;',
    '}'
  ]
}

function emitRuntimeObjectGetValueLines(
  object: string,
  key: string,
  value: string,
  context: CFunctionContext
): string[] {
  const lines = [`${value} = inox::get(${object}, ${cStringLiteral(key)});`]

  appendLines(lines, emitRuntimeThrownCheckLines(context))

  return lines
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

function isEqualityOperator(operator: string): boolean {
  return operator === '===' || operator === '!=='
}

function isStringComparisonOperator(operator: string): boolean {
  return (
    isEqualityOperator(operator) ||
    operator === '<' ||
    operator === '<=' ||
    operator === '>' ||
    operator === '>='
  )
}

function isPositiveEqualityOperator(operator: string): boolean {
  return operator === '==='
}

function isTypedStringValueExpression(expression: CValueNode): boolean {
  if (expression.valueType !== 'string') {
    return false
  }

  if (
    expression.type === 'Reference' ||
    expression.type === 'StringLiteral' ||
    expression.type === 'TemplateLiteral'
  ) {
    return false
  }

  return true
}

function shouldEmitTypedStringValueCompare(expression: CValueNode): boolean {
  return isTypedStringValueExpression(expression.left) && isTypedStringValueExpression(expression.right)
}

function canEmitStringCompareOperands(
  expression: CValueNode,
  leftType: string,
  rightType: string,
  context: CFunctionContext,
  deps: CScalarExpressionDependencies
): boolean {
  if (isStringValueRuntimeMethodCall(expression.right)) {
    return (
      deps.canEmitStringBytesOperand(expression.right, context) &&
      deps.canEmitStringBytesOperand(expression.left, context)
    )
  }

  if (isStringValueRuntimeMethodCall(expression.left)) {
    return (
      deps.canEmitStringBytesOperand(expression.left, context) &&
      deps.canEmitStringBytesOperand(expression.right, context)
    )
  }

  if (leftType !== 'string' && rightType === 'string') {
    return (
      deps.canEmitStringBytesOperand(expression.right, context) &&
      deps.canEmitStringBytesOperand(expression.left, context)
    )
  }

  return (
    deps.canEmitStringBytesOperand(expression.left, context) &&
    deps.canEmitStringBytesOperand(expression.right, context)
  )
}

function isStringValueRuntimeMethodCall(expression: CValueNode): boolean {
  return (
    expression.type === 'CallExpression' &&
    expression.callee.type === 'MemberExpression' &&
    stringRuntimeReturnType(expression.callee.property) === 'string'
  )
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

function referenceName(expression: CValueNode): string | null {
  if (expression.type !== 'Reference' || expression.path.length !== 1) {
    return null
  }

  return expression.path[0]
}

function cBooleanLiteral(value: boolean): string {
  if (value) {
    return '1'
  }

  return '0'
}

function isRawPointerType(valueType: string): boolean {
  return (
    valueType === 'function' ||
    valueType === 'timer' ||
    valueType === 'crypto-hash' ||
    valueType === 'crypto-hmac' ||
    valueType === 'dgram-socket' ||
    valueType === 'net-address' ||
    valueType === 'net-server' ||
    valueType === 'net-socket' ||
    valueType === 'http-request' ||
    valueType === 'http-response' ||
    valueType === 'http-server'
  )
}

function typeofRuntimeValueTagCheck(value: string, typeName: string): string | null {
  if (typeName === 'undefined') {
    return `${value}.tag == INOX_TAG_UNDEFINED`
  }

  if (typeName === 'object') {
    return (
      `(${value}.tag == INOX_TAG_NULL || ${runtimeObjectLikeTagMatchCondition(value)} || ${value}.tag == INOX_TAG_ARRAY || ` +
      `${value}.tag == INOX_TAG_BYTES || ${value}.tag == INOX_TAG_MAP || ${value}.tag == INOX_TAG_SET)`
    )
  }

  if (typeName === 'boolean') {
    return `${value}.tag == INOX_TAG_BOOL`
  }

  if (typeName === 'number') {
    return `${value}.tag == INOX_TAG_NUMBER`
  }

  if (typeName === 'string') {
    return `${value}.tag == INOX_TAG_STRING`
  }

  if (typeName === 'function') {
    return `${value}.tag == INOX_TAG_FUNCTION`
  }

  return null
}

function typeofRawOperandCheck(operand: PreparedTypeofOperand, typeName: string): string | null {
  if (operand.storage === 'raw-string') {
    if (typeName === 'undefined') {
      return `${operand.expression} == 0`
    }

    if (typeName === 'string') {
      return `${operand.expression} != 0`
    }

    return cBooleanLiteral(false)
  }

  if (operand.storage === 'raw-number') {
    return cBooleanLiteral(typeName === 'number')
  }

  if (operand.storage === 'raw-boolean') {
    return cBooleanLiteral(typeName === 'boolean')
  }

  if (operand.storage === 'raw-pointer') {
    if (typeName === 'undefined') {
      return `${operand.expression} == 0`
    }

    if (typeName === 'function' && operand.valueType === 'function') {
      return `${operand.expression} != 0`
    }

    return cBooleanLiteral(false)
  }

  return null
}

function typeofOperandCheck(operand: PreparedTypeofOperand, typeName: string): string | null {
  if (operand.storage === 'runtime-value') {
    return typeofRuntimeValueTagCheck(operand.expression, typeName)
  }

  return typeofRawOperandCheck(operand, typeName)
}

function emitPreparedTypeofArgumentValue(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CScalarExpressionDependencies
): PreparedTypeofOperand {
  const valueType = deps.inferExpressionType(expression, context)
  const name = referenceName(expression)

  if (name !== null && typeof name !== 'undefined') {
    const reference = deps.emitReference(expression, context)
    const variableType = context.variables.get(name)

    if (context.boxedVariables.has(name) || context.nullableVariables.has(name)) {
      return {
        lines: [],
        expression: reference,
        storage: 'runtime-value',
        valueType
      }
    }

    if (context.runtimeStrings.has(name) || variableType === 'string') {
      return {
        lines: [],
        expression: reference,
        storage: 'raw-string',
        valueType: 'string'
      }
    }

    if (variableType === 'number') {
      return {
        lines: [],
        expression: reference,
        storage: 'raw-number',
        valueType: variableType
      }
    }

    if (variableType === 'boolean') {
      return {
        lines: [],
        expression: reference,
        storage: 'raw-boolean',
        valueType: variableType
      }
    }

    if (variableType !== null && typeof variableType !== 'undefined' && isRawPointerType(variableType)) {
      return {
        lines: [],
        expression: reference,
        storage: 'raw-pointer',
        valueType: variableType
      }
    }
  }

  if (
    expression.type === 'Reference' &&
    expression.path.length === 1 &&
    (valueType === 'unknown' || isManagedRuntimeReturnType(valueType) || isOpaqueRuntimeValueType(valueType))
  ) {
    return {
      lines: [],
      expression: deps.emitReference(expression, context),
      storage: 'runtime-value',
      valueType
    }
  }

  const value = deps.emitCValueExpression(expression, context)

  return {
    lines: value.lines,
    expression: value.expression,
    storage: 'runtime-value',
    valueType
  }
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

  if (argument === null || typeof argument === 'undefined' || typeName === null || typeof typeName === 'undefined') {
    return null
  }

  const value = emitPreparedTypeofArgumentValue(argument, context, deps)
  const check = typeofOperandCheck(value, typeName)

  if (check === null || typeof check === 'undefined') {
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
    return `inox_bool_value((${value}) != 0)`
  }

  return `inox_number_value(${value})`
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

export function objectExpressionPathName(expression: CValueNode, context: CObjectPathContext): string | null {
  if (expression.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]
    const alias = context.objectAliases.get(name)

    if (alias !== null && typeof alias !== 'undefined') {
      return alias
    }

    return name
  }

  if (expression.type === 'ThisExpression') {
    return 'this'
  }

  if (expression.type === 'MemberExpression') {
    const objectName = objectExpressionPathName(expression.object, context)

    if (objectName !== null && typeof objectName !== 'undefined') {
      return `${objectName}_${expression.property}`
    }
  }

  if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
    const objectName = objectExpressionPathName(expression.object, context)

    if (objectName !== null && typeof objectName !== 'undefined') {
      return `${objectName}_${expression.index.value}`
    }
  }

  if (expression.type === 'CallExpression') {
    const createFunctionContextPath = createFunctionContextObjectPathName(expression, context)

    if (createFunctionContextPath !== null && typeof createFunctionContextPath !== 'undefined') {
      return createFunctionContextPath
    }
  }

  if (
    expression.type === 'CallExpression' &&
    expression.callee.type === 'Reference' &&
    expression.callee.path.length === 1
  ) {
    const path: string[] = expression.callee.path
    const accessor = context.objectAccessorReturnPaths.get(path[0])

    if (accessor !== null && typeof accessor !== 'undefined') {
      const argument = functionCallArgumentAt(expression.args, accessor.paramIndex)

      if (argument !== null && typeof argument !== 'undefined') {
        const objectName = objectExpressionPathName(argument, context)

        if (objectName !== null && typeof objectName !== 'undefined') {
          return appendObjectAccessorFields(objectName, accessor.fields)
        }
      }
    }
  }

  return null
}

function createFunctionContextObjectPathName(expression: CValueNode, context: CObjectPathContext): string | null {
  const callee = expression.callee

  if (callee === null || typeof callee === 'undefined') {
    return null
  }

  let isCreateFunctionContext = false

  if (callee.type === 'Reference' && callee.path.length === 1) {
    const path: string[] = callee.path

    for (const name of path) {
      if (name === 'createFunctionContext') {
        isCreateFunctionContext = true
      }
    }
  } else if (callee.type === 'MemberExpression' && callee.property === 'createFunctionContext') {
    isCreateFunctionContext = true
  }

  if (!isCreateFunctionContext) {
    return null
  }

  let argument: CValueNode | null = null

  const args: CValueNode[] = expression.args

  for (const item of args) {
    argument = item
    break
  }

  if (argument === null || typeof argument === 'undefined') {
    return null
  }

  return objectExpressionPathName(argument, context)
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

function objectFunctionFieldAt(
  fields: CObjectShapeField[] | null | undefined,
  fieldName: string
): CObjectShapeField | null {
  if (fields === null || typeof fields === 'undefined') {
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

  const properties: CObjectLiteralPropertyNode[] = expression.properties

  for (const property of properties) {
    if (property.key === key && property.value !== null && typeof property.value !== 'undefined') {
      return property.value
    }
  }

  return null
}

function objectFunctionArgumentSource(expression: CValueNode, context: CFunctionContext): ObjectFunctionArgumentSource {
  const pathName = objectExpressionPathName(expression, context)

  return {
    expression,
    loc: expression.loc,
    pathName,
    shape: objectFunctionArgumentSourceShape(expression, pathName, context),
    shapeKnown: objectFunctionArgumentSourceShapeKnown(expression, pathName, context)
  }
}

function nestedObjectFunctionArgumentSource(
  source: ObjectFunctionArgumentSource,
  field: CObjectShapeField,
  context: CFunctionContext
): ObjectFunctionArgumentSource {
  let expression: CValueNode | null = null
  const sourceExpression = source.expression
  const fieldName = field.name

  if (sourceExpression !== null && typeof sourceExpression !== 'undefined') {
    expression = objectLiteralPropertyValue(sourceExpression, fieldName)
  }

  if (expression !== null && typeof expression !== 'undefined') {
    const pathName = objectExpressionPathName(expression, context)

    return {
      expression,
      loc: expression.loc ?? source.loc,
      pathName: pathName ?? nestedObjectPathName(source.pathName, fieldName),
      shape: objectFunctionArgumentSourceShape(expression, pathName, context),
      shapeKnown: objectFunctionArgumentSourceShapeKnown(expression, pathName, context)
    }
  }

  const sourceShapeField = objectShapeFieldAt(source.shape?.fields, fieldName)
  let shape: CObjectShape | null = null
  let shapeKnown = false

  if (source.shapeKnown) {
    shape = sourceShapeField?.shape ?? null
    shapeKnown = true
  }

  return {
    expression: null,
    loc: source.loc,
    pathName: nestedObjectPathName(source.pathName, fieldName),
    shape,
    shapeKnown
  }
}

function nestedObjectPathName(pathName: string | null, fieldName: string): string | null {
  if (pathName === null || typeof pathName === 'undefined') {
    return null
  }

  return `${pathName}_${fieldName}`
}

function objectFunctionArgumentSourceShape(
  expression: CValueNode,
  pathName: string | null,
  context: CFunctionContext
): CObjectShape | null {
  if (pathName !== null && typeof pathName !== 'undefined') {
    const fields = context.objectShapes.get(pathName)

    if (fields !== null && typeof fields !== 'undefined') {
      return { fields }
    }

    const moduleFields = context.moduleObjectShapes.get(pathName)

    if (moduleFields !== null && typeof moduleFields !== 'undefined') {
      return { fields: moduleFields }
    }
  }

  if (expression.shape !== null && typeof expression.shape !== 'undefined') {
    return expression.shape
  }

  return null
}

function objectFunctionArgumentSourceShapeKnown(
  expression: CValueNode,
  pathName: string | null,
  context: CFunctionContext
): boolean {
  if (pathName !== null && typeof pathName !== 'undefined') {
    if (context.objectShapes.get(pathName)) {
      return true
    }

    if (context.moduleObjectShapes.get(pathName)) {
      return true
    }
  }

  return expression.shape !== null && typeof expression.shape !== 'undefined'
}

function objectShapeFieldAt(
  fields: CObjectShapeField[] | null | undefined,
  fieldName: string
): CObjectShapeField | null {
  if (fields === null || typeof fields === 'undefined') {
    return null
  }

  for (const field of fields) {
    if (field.name === fieldName) {
      return field
    }
  }

  return null
}

function appendDefaultObjectFunctionFieldArgument(args: string[], field: CObjectShapeField): void {
  if (isRuntimeObjectFunctionField(field)) {
    args.push('inox_null_value()')
  } else {
    args.push('0')
  }
}

function emitObjectFunctionFieldArgument(
  source: ObjectFunctionArgumentSource,
  field: CObjectShapeField,
  context: CFunctionContext,
  deps: CCallExpressionDependencies,
  seenTypes: string[]
): PreparedExpression {
  let literalValue: CValueNode | null = null
  const expression = source.expression
  const sourceField = objectFunctionFieldAt(source.shape?.fields, field.name)

  if (expression !== null && typeof expression !== 'undefined') {
    literalValue = objectLiteralPropertyValue(expression, field.name)
  }

  if (isRuntimeObjectFunctionField(field)) {
    if (literalValue !== null && typeof literalValue !== 'undefined') {
      return deps.emitRuntimeCallbackValue(literalValue, field.functionType, context)
    }

    const objectName = source.pathName

    if (objectName !== null && typeof objectName !== 'undefined') {
      return {
        lines: [],
        expression: emitObjectFunctionFieldArgumentName(objectName, field.name, context)
      }
    }

    if (field.optional === true) {
      return {
        lines: [],
        expression: 'inox_null_value()'
      }
    }

    context.diagnostics.push(
      diagnostic(
        'INOX_C_FUNCTION_VALUE',
        `object function field ${field.name} is not available as a runtime C callback value`,
        source.loc
      )
    )

    return {
      lines: [],
      expression: 'inox_undefined_value()'
    }
  }

  if (literalValue !== null && typeof literalValue !== 'undefined') {
    const targetFunctionType = deps.resolveFunctionValueType(literalValue, context)
    const target = deps.emitFunctionValueExpression(literalValue, context)

    return {
      lines: [],
      expression: emitAdaptedFunctionPointerExpression(
        target,
        targetFunctionType,
        field.functionType,
        context,
        deps,
        seenTypes,
        []
      )
    }
  }

  const objectName = source.pathName

  if (objectName !== null && typeof objectName !== 'undefined') {
    const target = emitObjectFunctionFieldArgumentName(objectName, field.name, context)

    return {
      lines: [],
      expression: emitAdaptedFunctionPointerExpression(
        target,
        sourceField?.functionType ?? null,
        field.functionType,
        context,
        deps,
        seenTypes,
        objectFunctionArgumentSourceSeenTypes(source, context, seenTypes)
      )
    }
  }

  if (field.optional === true) {
    return {
      lines: [],
      expression: '0'
    }
  }

  context.diagnostics.push(
    diagnostic(
      'INOX_C_FUNCTION_VALUE',
      `object function field ${field.name} is not available as a C function pointer`,
      source.loc
    )
  )

  return {
    lines: [],
    expression: '0'
  }
}

function emitAdaptedFunctionPointerExpression(
  target: string,
  targetFunctionType: CFunctionType | null | undefined,
  functionType: CFunctionType | null | undefined,
  context: CFunctionContext,
  deps: CCallExpressionDependencies,
  seenTypes: string[],
  targetSeenTypes: string[]
): string {
  if (
    targetFunctionType === null ||
    typeof targetFunctionType === 'undefined' ||
    functionType === null ||
    typeof functionType === 'undefined'
  ) {
    return target
  }

  if (functionPointerSignaturesMatch(targetFunctionType, functionType, seenTypes, targetSeenTypes)) {
    return target
  }

  return deps.emitFunctionPointerAdapter(target, targetFunctionType, functionType, context, seenTypes, targetSeenTypes)
}

function functionPointerSignaturesMatch(
  targetFunctionType: CFunctionType,
  functionType: CFunctionType,
  seenTypes: string[],
  targetSeenTypes: string[]
): boolean {
  if (emitFunctionPointerReturnType(targetFunctionType) !== emitFunctionPointerReturnType(functionType)) {
    return false
  }

  return (
    emitFunctionPointerParams(targetFunctionType, [], targetSeenTypes) ===
    emitFunctionPointerParams(functionType, [], seenTypes)
  )
}

function objectFunctionArgumentSourceSeenTypes(
  source: ObjectFunctionArgumentSource,
  context: CFunctionContext,
  expectedSeenTypes: string[]
): string[] {
  if (source.pathName !== null && typeof source.pathName !== 'undefined') {
    if (context.moduleObjectShapes.get(source.pathName)) {
      return ['CFunctionContext']
    }

    return copyStringArray(expectedSeenTypes)
  }

  if (source.expression === null || typeof source.expression === 'undefined') {
    return []
  }

  return objectFunctionCalleeSeenTypes(source.expression, context)
}

function copyStringArray(values: string[]): string[] {
  const result: string[] = []

  for (const value of values) {
    result.push(value)
  }

  return result
}

function appendObjectFunctionFieldArguments(
  lines: string[],
  args: string[],
  expression: CValueNode,
  param: CFunctionParam,
  context: CFunctionContext,
  deps: CCallExpressionDependencies,
  calleeSeenTypes: string[]
): void {
  const seenTypes: string[] = []

  for (const seenType of calleeSeenTypes) {
    seenTypes.push(seenType)
  }

  if (seenTypesIncludeDeclaredType(seenTypes, param.declaredType)) {
    return
  }

  pushSeenDeclaredType(seenTypes, param.declaredType)

  appendObjectShapeFunctionFieldArguments(
    lines,
    args,
    objectFunctionArgumentSource(expression, context),
    param.shape,
    context,
    deps,
    seenTypes
  )
}

function appendDefaultObjectFunctionFieldArguments(
  args: string[],
  param: CFunctionParam,
  calleeSeenTypes: string[]
): void {
  const seenTypes: string[] = []

  for (const seenType of calleeSeenTypes) {
    seenTypes.push(seenType)
  }

  if (seenTypesIncludeDeclaredType(seenTypes, param.declaredType)) {
    return
  }

  pushSeenDeclaredType(seenTypes, param.declaredType)

  appendDefaultObjectShapeFunctionFieldArguments(args, param.shape, seenTypes)
}

function appendObjectShapeFunctionFieldArguments(
  lines: string[],
  args: string[],
  source: ObjectFunctionArgumentSource,
  shape: CObjectShape | null | undefined,
  context: CFunctionContext,
  deps: CCallExpressionDependencies,
  seenTypes: string[]
): void {
  const fields = shape?.fields

  if (fields === null || typeof fields === 'undefined') {
    return
  }

  for (const field of fields) {
    if (field.valueType === 'function') {
      if (!isSupportedObjectFunctionField(field)) {
        continue
      }

      if (source.shapeKnown && !objectFunctionFieldAt(source.shape?.fields, field.name)) {
        appendDefaultObjectFunctionFieldArgument(args, field)
        continue
      }

      const value = emitObjectFunctionFieldArgument(source, field, context, deps, seenTypes)

      appendLines(lines, value.lines)
      args.push(value.expression)
    } else if (field.valueType === 'object') {
      if (seenTypesIncludeDeclaredType(seenTypes, field.declaredType)) {
        continue
      }

      if (
        isMissingOptionalObjectLiteralField(source, field) ||
        isUnavailableOptionalObjectFieldSource(source, field, context)
      ) {
        const pushedTypes = pushSeenDeclaredType(seenTypes, field.declaredType)

        appendDefaultObjectShapeFunctionFieldArguments(args, field.shape, seenTypes)

        popSeenDeclaredTypes(seenTypes, pushedTypes)
      } else {
        const pushedTypes = pushSeenDeclaredType(seenTypes, field.declaredType)

        appendObjectShapeFunctionFieldArguments(
          lines,
          args,
          nestedObjectFunctionArgumentSource(source, field, context),
          field.shape,
          context,
          deps,
          seenTypes
        )

        popSeenDeclaredTypes(seenTypes, pushedTypes)
      }
    }
  }
}

function emitObjectFunctionFieldArgumentName(objectName: string, fieldName: string, context: CFunctionContext): string {
  const fallback = emitDependencyObjectFunctionFieldArgumentName(objectName, fieldName, context)

  if (fallback !== null && typeof fallback !== 'undefined') {
    return fallback
  }

  return emitCObjectFunctionFieldName(objectName, fieldName)
}

function emitDependencyObjectFunctionFieldArgumentName(
  objectName: string,
  fieldName: string,
  context: CFunctionContext
): string | null {
  const suffix = dependencyObjectFunctionFieldSuffix(objectName)

  if (suffix === null || typeof suffix === 'undefined') {
    return null
  }

  const depsName = emitDependencyObjectFunctionFieldArgumentNameForRoot('deps', suffix, fieldName, context)

  if (depsName !== null && typeof depsName !== 'undefined') {
    return depsName
  }

  return emitDependencyObjectFunctionFieldArgumentNameForRoot('dependencies', suffix, fieldName, context)
}

function dependencyObjectFunctionFieldSuffix(objectName: string): string | null {
  if (objectName.startsWith('context_')) {
    return objectName.slice('context_'.length)
  }

  if (objectName.startsWith('baseContext_')) {
    return objectName.slice('baseContext_'.length)
  }

  return null
}

function emitDependencyObjectFunctionFieldArgumentNameForRoot(
  rootName: string,
  suffix: string,
  fieldName: string,
  context: CFunctionContext
): string | null {
  const objectName = `${rootName}_${suffix}`
  const fields = context.objectShapes.get(objectName)

  if (!objectFunctionFieldAt(fields, fieldName)) {
    return null
  }

  return emitCObjectFunctionFieldName(objectName, fieldName)
}

function isMissingOptionalObjectLiteralField(source: ObjectFunctionArgumentSource, field: CObjectShapeField): boolean {
  const expression = source.expression

  return (
    field.optional === true &&
    expression !== null &&
    typeof expression !== 'undefined' &&
    expression.type === 'ObjectLiteral' &&
    !objectLiteralPropertyValue(expression, field.name)
  )
}

function isUnavailableOptionalObjectFieldSource(
  source: ObjectFunctionArgumentSource,
  field: CObjectShapeField,
  context: CFunctionContext
): boolean {
  if (field.optional !== true || source.expression === null || typeof source.expression === 'undefined') {
    return false
  }

  if (source.pathName === null || typeof source.pathName === 'undefined') {
    return true
  }

  return context.moduleValueNames.has(source.pathName) && !objectShapeFieldAt(source.shape?.fields, field.name)
}

function appendDefaultObjectShapeFunctionFieldArguments(
  args: string[],
  shape: CObjectShape | null | undefined,
  seenTypes: string[]
): void {
  const fields = shape?.fields

  if (fields === null || typeof fields === 'undefined') {
    return
  }

  for (const field of fields) {
    if (field.valueType === 'function') {
      if (!isSupportedObjectFunctionField(field)) {
        continue
      }

      if (isRuntimeObjectFunctionField(field)) {
        args.push('inox_null_value()')
      } else {
        args.push('0')
      }
    } else if (field.valueType === 'object') {
      if (seenTypesIncludeDeclaredType(seenTypes, field.declaredType)) {
        continue
      }

      const pushedTypes = pushSeenDeclaredType(seenTypes, field.declaredType)

      appendDefaultObjectShapeFunctionFieldArguments(args, field.shape, seenTypes)

      popSeenDeclaredTypes(seenTypes, pushedTypes)
    }
  }
}

function isSupportedObjectFunctionField(field: CObjectShapeField): boolean {
  return isPlainFunctionPointerType(field.functionType) || isRuntimeFunctionType(field.functionType)
}

function isRuntimeObjectFunctionField(field: CObjectShapeField): boolean {
  return !isPlainFunctionPointerType(field.functionType) && isRuntimeFunctionType(field.functionType)
}

function objectFunctionFieldCallee(callee: CValueNode, context: CFunctionContext): string | null {
  const resolved = resolveObjectFunctionField(callee, context)

  if (resolved === null || typeof resolved === 'undefined') {
    return null
  }

  return emitCObjectFunctionFieldName(resolved.objectName, resolved.fieldName)
}

function resolveObjectFunctionField(
  callee: CValueNode,
  context: CFunctionContext
): ObjectFunctionFieldResolution | null {
  let object: CValueNode | null = null
  let fieldName: string | null = null

  if (callee.type === 'MemberExpression') {
    object = callee.object
    fieldName = callee.property
  } else if (callee.type === 'IndexExpression' && callee.index.type === 'StringLiteral') {
    object = callee.object
    fieldName = callee.index.value
  }

  if (object === null || typeof object === 'undefined' || fieldName === null || typeof fieldName === 'undefined') {
    return null
  }

  const objectName = objectExpressionName(object, context)

  if (objectName === null || typeof objectName === 'undefined') {
    return null
  }

  let fields = context.objectShapes.get(objectName)

  if ((fields === null || typeof fields === 'undefined') && object.type === 'Reference' && object.path.length === 1) {
    const directObjectName = object.path[0]
    fields = context.objectShapes.get(directObjectName)
  }

  if (
    (fields === null || typeof fields === 'undefined') &&
    object.shape !== null &&
    typeof object.shape !== 'undefined'
  ) {
    fields = object.shape.fields
  }

  if (fields === null || typeof fields === 'undefined') {
    const returnShape = objectFunctionReturnShape(object, context)

    if (
      returnShape !== null &&
      typeof returnShape !== 'undefined' &&
      returnShape.fields !== null &&
      typeof returnShape.fields !== 'undefined'
    ) {
      fields = returnShape.fields
    }
  }

  const field = objectFunctionFieldAt(fields, fieldName)

  if (field === null || typeof field === 'undefined') {
    return null
  }

  return {
    field,
    fieldName,
    objectName
  }
}

function runtimeObjectFunctionFieldCallee(
  callee: CValueNode,
  context: CFunctionContext
): RuntimeObjectFunctionCallee | null {
  const resolved = resolveObjectFunctionField(callee, context)

  if (
    resolved === null ||
    typeof resolved === 'undefined' ||
    resolved.field.functionType === null ||
    typeof resolved.field.functionType === 'undefined'
  ) {
    return null
  }

  if (!isRuntimeObjectFunctionField(resolved.field)) {
    return null
  }

  return {
    functionType: resolved.field.functionType,
    name: emitCObjectFunctionFieldName(resolved.objectName, resolved.fieldName)
  }
}

function objectFunctionCalleeSeenTypes(object: CValueNode, context: CFunctionContext): string[] {
  const seenTypes: string[] = []

  appendObjectFunctionCalleeSeenTypes(seenTypes, object, context)

  return seenTypes
}

function objectFunctionCalleeArgumentSeenTypes(callee: CValueNode, context: CFunctionContext): string[] {
  if (callee.type === 'MemberExpression') {
    return objectFunctionCalleeSeenTypes(callee.object, context)
  }

  if (callee.type === 'IndexExpression' && callee.index.type === 'StringLiteral') {
    return objectFunctionCalleeSeenTypes(callee.object, context)
  }

  return []
}

function appendObjectFunctionCalleeSeenTypes(seenTypes: string[], object: CValueNode, context: CFunctionContext): void {
  if (object.type === 'MemberExpression') {
    appendObjectFunctionCalleeSeenTypes(seenTypes, object.object, context)
    appendObjectFunctionFieldDeclaredType(seenTypes, object.object, object.property, context)
    return
  }

  if (object.type === 'IndexExpression' && object.index.type === 'StringLiteral') {
    appendObjectFunctionCalleeSeenTypes(seenTypes, object.object, context)
    appendObjectFunctionFieldDeclaredType(seenTypes, object.object, object.index.value, context)
    return
  }

  if (object.type === 'CallExpression' && object.callee.type === 'Reference') {
    const calleeName = objectExpressionPathName(object.callee, context)

    if (calleeName === null || typeof calleeName === 'undefined') {
      return
    }

    const accessor = context.objectAccessorReturnPaths.get(calleeName)

    if (accessor !== null && typeof accessor !== 'undefined') {
      const argument = functionCallArgumentAt(object.args, accessor.paramIndex)

      if (argument !== null && typeof argument !== 'undefined') {
        appendObjectFunctionCalleeSeenTypes(seenTypes, argument, context)
      }
    }

    const declaredReturnType = context.functionReturnDeclaredTypes.get(calleeName)

    pushSeenDeclaredType(seenTypes, declaredReturnType)

    return
  }

  const objectName = objectExpressionName(object, context)

  if (objectName !== null && typeof objectName !== 'undefined') {
    const contextDeclaredType = context.objectDeclaredTypes.get(objectName)

    pushSeenDeclaredType(seenTypes, contextDeclaredType)
  }

  pushSeenDeclaredType(seenTypes, object.declaredType)
}

function appendObjectFunctionFieldDeclaredType(
  seenTypes: string[],
  object: CValueNode,
  fieldName: string,
  context: CFunctionContext
): void {
  const objectName = objectExpressionName(object, context)
  let fields: CObjectShapeField[] | null | undefined = null

  if (objectName !== null && typeof objectName !== 'undefined') {
    fields = context.objectShapes.get(objectName)
  }

  if (
    (fields === null || typeof fields === 'undefined') &&
    object.shape !== null &&
    typeof object.shape !== 'undefined'
  ) {
    fields = object.shape.fields
  }

  const field = objectShapeFieldAt(fields, fieldName)

  if (field !== null && typeof field !== 'undefined') {
    pushSeenDeclaredType(seenTypes, field.declaredType)
  }
}

function seenTypesIncludeDeclaredType(seenTypes: string[], declaredType: string | null | undefined): boolean {
  if (declaredType === null || typeof declaredType === 'undefined') {
    return false
  }

  for (const seenType of seenTypes) {
    if (
      seenType === declaredType ||
      isContextDeclaredTypePair(seenType, declaredType) ||
      isDependencyCarrierContextPair(seenType, declaredType)
    ) {
      return true
    }
  }

  return false
}

function pushSeenDeclaredType(seenTypes: string[], declaredType: string | null | undefined): number {
  if (
    declaredType === null ||
    typeof declaredType === 'undefined' ||
    seenTypesIncludeDeclaredType(seenTypes, declaredType)
  ) {
    return 0
  }

  seenTypes.push(declaredType)

  if (declaredType === 'CEmitContext') {
    seenTypes.push('CFunctionContext')
    seenTypes.push('CDeclarationFunctionContext')
    return 3
  }

  if (declaredType === 'CFunctionContext') {
    seenTypes.push('CEmitContext')
    seenTypes.push('CDeclarationFunctionContext')
    return 3
  }

  if (declaredType === 'CDeclarationFunctionContext') {
    seenTypes.push('CEmitContext')
    seenTypes.push('CFunctionContext')
    return 3
  }

  return 1
}

function popSeenDeclaredTypes(seenTypes: string[], count: number): void {
  for (let index = 0; index < count; index = index + 1) {
    seenTypes.pop()
  }
}

function isContextDeclaredTypePair(left: string, right: string): boolean {
  return isContextDeclaredType(left) && isContextDeclaredType(right)
}

function isDependencyCarrierContextPair(left: string, right: string): boolean {
  return isDependencyCarrierDeclaredType(left) && isContextDeclaredType(right)
}

function isContextDeclaredType(value: string): boolean {
  return (
    value === 'ArrayFunctionContext' ||
    value === 'CEmitContext' ||
    value === 'CFunctionContext' ||
    value === 'CDeclarationFunctionContext' ||
    value === 'CallbackEmitContext' ||
    value === 'CallbackFunctionContext' ||
    value === 'ClassFunctionContext' ||
    value === 'CollectionFunctionContext' ||
    value === 'DgramFunctionContext' ||
    value === 'FetchFunctionContext' ||
    value === 'FsFunctionContext' ||
    value === 'HttpFunctionContext' ||
    value === 'NullableFunctionContext' ||
    value === 'PromiseEmitContext' ||
    value === 'PromiseFunctionContext' ||
    value === 'StringCContext' ||
    value === 'TimerFunctionContext' ||
    value === 'AsyncTaskEmitContext' ||
    value === 'AsyncTaskFunctionContext' ||
    value === 'AsyncTaskPlannerContext'
  )
}

function isDependencyCarrierDeclaredType(value: string): boolean {
  return (
    value === 'CModuleEmissionDependencies' ||
    value === 'ArrayLoweringDependencies' ||
    value === 'AsyncTaskLoweringDependencies' ||
    value === 'CallbackLoweringDependencies' ||
    value === 'ClassLoweringDependencies' ||
    value === 'CollectionLoweringDependencies' ||
    value === 'DgramLoweringDependencies' ||
    value === 'HttpLoweringDependencies' ||
    value === 'NetLoweringDependencies' ||
    value === 'NullableLoweringDependencies' ||
    value === 'PromiseChainLoweringDependencies' ||
    value === 'StatementLoweringDependencies' ||
    value === 'StringLoweringDependencies'
  )
}

function emitRuntimeObjectFunctionFieldCall(
  expression: CValueNode,
  callee: RuntimeObjectFunctionCallee,
  context: CFunctionContext,
  deps: CCallExpressionDependencies
): PreparedExpression {
  const lines: string[] = []
  const args: string[] = []

  for (const arg of expression.args) {
    const value = deps.emitCValueExpression(arg, context)

    appendLines(lines, value.lines)
    args.push(value.expression)
  }

  const out = nextCName(context, 'inox_callback_out')
  registerOwnedValue(context, out)
  appendLines(lines, emitPrepareOwnedValueWrite(out))

  if (args.length === 0) {
    lines.push(emitStatusCheck(`inox_callback_call(${callee.name}, 0, 0, &${out})`, context))
  } else {
    const argArray = nextCName(context, 'inox_callback_args')

    lines.push(`inox_value ${argArray}[] = { ${joinStrings(args, ', ')} };`)
    lines.push(emitStatusCheck(`inox_callback_call(${callee.name}, ${argArray}, ${args.length}, &${out})`, context))
  }

  return {
    lines,
    expression: out
  }
}

function objectFunctionReturnShape(object: CValueNode, context: CFunctionContext): CObjectShape | null {
  if (object.type !== 'CallExpression' || object.callee.type !== 'Reference' || object.callee.path.length !== 1) {
    return null
  }

  const path: string[] = object.callee.path
  const shape = context.functionReturnShapes.get(path[0])

  if (shape !== null && typeof shape !== 'undefined') {
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

function pushNullableScalarNarrowing(context: CFunctionContext, names: string[]): NullableScalarNarrowingSnapshot {
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

function restoreNullableScalarNarrowing(context: CFunctionContext, snapshot: NullableScalarNarrowingSnapshot): void {
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
  emitPreparedArrayIncludesCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedArrayReduceCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedArrayUnshiftCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedBinaryNumberCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedBytesIndexExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedBytesLengthExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedArrayIsArrayCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitPreparedClassMethodCallExpression(
    expression: CValueNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ): PreparedExpression | null
  emitPreparedCollectionCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedCollectionSizeExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedCryptoNumberCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedNodeNetworkAddressPortExpression(
    expression: CValueNode,
    context: CFunctionContext
  ): PreparedExpression | null
  emitPreparedJsonScalarParseExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedNullableScalarRuntimeValueExpression(
    expression: CValueNode,
    context: CFunctionContext
  ): PreparedExpression
  emitPreparedObjectExpressionScalarIndexValueExpression(
    expression: CValueNode,
    context: CFunctionContext
  ): PreparedExpression | null
  emitPreparedObjectExpressionScalarMemberValueExpression(
    expression: CValueNode,
    context: CFunctionContext
  ): PreparedExpression | null
  emitPreparedObjectRuntimeArrayIndexValueExpression(
    expression: CValueNode,
    context: CFunctionContext
  ): PreparedExpression | null
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
  emitPreparedCppStringArgument(
    expression: CValueNode,
    context: CFunctionContext,
    tempPrefix: string
  ): PreparedExpression | null
  emitPreparedStringBytesOperand(
    expression: CValueNode,
    context: CFunctionContext,
    tempPrefix: string
  ): PreparedStringBytesOperand
  emitPreparedStringCharCodeAtExpression(expression: any, context: CFunctionContext): PreparedExpression | null
  emitPreparedStringIndexCallExpression(expression: any, context: CFunctionContext): PreparedExpression | null
  emitPreparedStringLengthExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedStringPredicateCall(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitPreparedUrlSearchParamsCallExpression(
    expression: CValueNode,
    context: CFunctionContext
  ): PreparedUrlSearchParamsExpression | null
  emitReference(expression: CValueNode, context: CFunctionContext): string
  emitStringExpression(expression: CValueNode, context: CFunctionContext): string
  inferExpressionType(expression: CValueNode, context: CFunctionContext): string
  isIndexAccessExpression(expression: CValueNode): boolean
  isMemberAccessExpression(expression: CValueNode): boolean
  isNullableRuntimeExpression(expression: CValueNode, context: CFunctionContext): boolean
  isNullableScalarRuntimeExpression(expression: CValueNode, context: CFunctionContext): boolean
  isStringPredicateCall(expression: CValueNode, context: CFunctionContext): boolean
  reportCJsGlobalDiagnostic(diagnostics: Diagnostic[], loc: SourceLocation | undefined): void
  resolveKnownArrayIndex(expression: CValueNode, context: CFunctionContext): CKnownArrayElement | null
  resolveKnownObjectIndex(expression: CValueNode, context: CFunctionContext): CKnownObjectIndexField | null
  resolveKnownObjectMember(expression: CValueNode, context: CFunctionContext): CKnownObjectField | null
  resolveRuntimeArrayIndex(expression: CValueNode, context: CFunctionContext): CRuntimeArrayElement | null
}

export type CCallExpressionDependencies = {
  currentErrorTarget(errorTargets: string[]): string
  emitCExpression(expression: CValueNode, context: CFunctionContext): string
  emitCNumberConversionValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitCObjectLiteralValueExpression(
    expression: CValueNode,
    context: CFunctionContext,
    shape?: CObjectShape | null
  ): PreparedExpression
  emitCValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitFunctionValueExpression(expression: CValueNode, context: CFunctionContext): string
  emitFunctionPointerAdapter(
    target: string,
    targetFunctionType: CFunctionType,
    functionType: CFunctionType,
    context: CFunctionContext,
    seenTypes: string[],
    targetSeenTypes: string[]
  ): string
  emitNullableFunctionValueExpression(
    expression: CValueNode,
    functionType: CFunctionType | null | undefined,
    context: CFunctionContext
  ): PreparedExpression
  emitNullableScalarValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitPreparedArrayFilterCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedArrayJoinCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedArrayLengthExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedArrayMapCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedArrayPopCallExpression(
    expression: CValueNode,
    context: CFunctionContext,
    options: PreparedCallOptions | null
  ): PreparedExpression | null
  emitPreparedArraySliceCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedArraySortCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedClassMethodCallExpression(
    expression: CValueNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ): PreparedExpression | null
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
  emitPreparedRuntimeArrayIndexValue(
    expression: CValueNode,
    element: CRuntimeArrayElement,
    context: CFunctionContext,
    tempPrefix: string
  ): PreparedExpression
  emitPreparedTimerCallExpression(
    expression: CValueNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ): PreparedExpression | null
  emitPreparedUrlSearchParamsCallExpression(
    expression: CValueNode,
    context: CFunctionContext
  ): PreparedExpression | null
  emitRuntimeCallbackCall(
    expression: CValueNode,
    callbackType: CFunctionType,
    context: CFunctionContext
  ): PreparedExpression
  emitRuntimeCallbackValue(
    expression: CValueNode,
    functionType: CFunctionType | null | undefined,
    context: CFunctionContext
  ): PreparedExpression
  inferExpressionType(expression: CValueNode, context: CFunctionContext): string
  isExternalEventLoopFunctionCallee(callee: CValueNode, context: CFunctionContext): boolean
  isNullableFunctionType(valueType: string | null | undefined, nullable: boolean | null | undefined): boolean
  isPromiseReturningFunctionCallee(callee: CValueNode, context: CFunctionContext): boolean
  registerErrorChannel(context: CFunctionContext): void
  registerErrorValue(context: CFunctionContext): void
  resolveFunctionValueType(expression: CValueNode, context: CFunctionContext): CFunctionType | null
  resolveFunctionParams(callee: CValueNode, context: CFunctionContext): CFunctionParam[] | null
  resolveRuntimeArrayIndex(expression: CValueNode, context: CFunctionContext): CRuntimeArrayElement | null
  resolveRuntimeCallbackCalleeType(callee: CValueNode, context: CFunctionContext): CFunctionType | null
  resolveRuntimeFunctionArgumentType(
    callee: CValueNode,
    index: number,
    param: CFunctionParam,
    context: CFunctionContext
  ): CFunctionType | null
}

export function emitCallExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CCallExpressionDependencies
): string {
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

  if (mathCall !== null && typeof mathCall !== 'undefined') {
    return mathCall
  }

  const pathStringCall = deps.emitPreparedPathStringCallExpression(expression, context)

  if (pathStringCall !== null && typeof pathStringCall !== 'undefined') {
    return pathStringCall
  }

  const pathBooleanCall = deps.emitPreparedPathBooleanCallExpression(expression, context)

  if (pathBooleanCall !== null && typeof pathBooleanCall !== 'undefined') {
    return pathBooleanCall
  }

  const fsStatsMethod = deps.emitPreparedFsStatsMethodExpression(expression, context)

  if (fsStatsMethod !== null && typeof fsStatsMethod !== 'undefined') {
    return fsStatsMethod
  }

  const numberConversion = deps.emitCNumberConversionValueExpression(expression, context)

  if (numberConversion !== null && typeof numberConversion !== 'undefined') {
    return numberConversion
  }

  const classMethodCall = deps.emitPreparedClassMethodCallExpression(expression, context, {})

  if (classMethodCall !== null && typeof classMethodCall !== 'undefined') {
    return classMethodCall
  }

  const arrayPopCall = deps.emitPreparedArrayPopCallExpression(expression, context, null)

  if (arrayPopCall !== null && typeof arrayPopCall !== 'undefined') {
    return arrayPopCall
  }

  const arrayJoinCall = deps.emitPreparedArrayJoinCallExpression(expression, context)

  if (arrayJoinCall !== null && typeof arrayJoinCall !== 'undefined') {
    return arrayJoinCall
  }

  const arrayMapCall = deps.emitPreparedArrayMapCallExpression(expression, context)

  if (arrayMapCall !== null && typeof arrayMapCall !== 'undefined') {
    return arrayMapCall
  }

  const arrayFilterCall = deps.emitPreparedArrayFilterCallExpression(expression, context)

  if (arrayFilterCall !== null && typeof arrayFilterCall !== 'undefined') {
    return arrayFilterCall
  }

  const arraySliceCall = deps.emitPreparedArraySliceCallExpression(expression, context)

  if (arraySliceCall !== null && typeof arraySliceCall !== 'undefined') {
    return arraySliceCall
  }

  const arraySortCall = deps.emitPreparedArraySortCallExpression(expression, context)

  if (arraySortCall !== null && typeof arraySortCall !== 'undefined') {
    return arraySortCall
  }

  const collectionCall = deps.emitPreparedCollectionCallExpression(expression, context)

  if (collectionCall !== null && typeof collectionCall !== 'undefined') {
    return collectionCall
  }

  const cryptoHashCall = deps.emitPreparedCryptoHashCallExpression(expression, context)

  if (cryptoHashCall !== null && typeof cryptoHashCall !== 'undefined') {
    return cryptoHashCall
  }

  const cryptoHmacCall = deps.emitPreparedCryptoHmacCallExpression(expression, context)

  if (cryptoHmacCall !== null && typeof cryptoHmacCall !== 'undefined') {
    return cryptoHmacCall
  }

  const cryptoCall = deps.emitPreparedCryptoCallExpression(expression, context)

  if (cryptoCall !== null && typeof cryptoCall !== 'undefined') {
    return cryptoCall
  }

  const fsCall = deps.emitPreparedFsCallExpression(expression, context)

  if (fsCall !== null && typeof fsCall !== 'undefined') {
    return fsCall
  }

  const fetchHeadersCall = deps.emitPreparedFetchHeadersCallExpression(expression, context)

  if (fetchHeadersCall !== null && typeof fetchHeadersCall !== 'undefined') {
    return fetchHeadersCall
  }

  const urlSearchParamsCall = deps.emitPreparedUrlSearchParamsCallExpression(expression, context)

  if (urlSearchParamsCall !== null && typeof urlSearchParamsCall !== 'undefined') {
    return urlSearchParamsCall
  }

  const jsonCall = deps.emitPreparedJsonCallExpression(expression, context)

  if (jsonCall !== null && typeof jsonCall !== 'undefined') {
    return jsonCall
  }

  const timerCall = deps.emitPreparedTimerCallExpression(expression, context, {
    asValue: true
  })

  if (timerCall !== null && typeof timerCall !== 'undefined') {
    return timerCall
  }

  const promise = deps.emitPreparedPromiseStaticExpression(expression, context)

  if (promise !== null && typeof promise !== 'undefined') {
    return promise
  }

  const promiseMethod = deps.emitPreparedPromiseMethodExpression(expression, context)

  if (promiseMethod !== null && typeof promiseMethod !== 'undefined') {
    return promiseMethod
  }

  const callbackType = deps.resolveRuntimeCallbackCalleeType(expression.callee, context)

  if (callbackType !== null && typeof callbackType !== 'undefined') {
    return deps.emitRuntimeCallbackCall(expression, callbackType, context)
  }

  const objectCallback = runtimeObjectFunctionFieldCallee(expression.callee, context)

  if (objectCallback !== null && typeof objectCallback !== 'undefined') {
    return emitRuntimeObjectFunctionFieldCall(expression, objectCallback, context, deps)
  }

  const params = deps.resolveFunctionParams(expression.callee, context)

  if (params === null || typeof params === 'undefined') {
    invalidateArrayReferenceArguments(expression, [], context)

    return {
      lines: [],
      expression: emitCallExpression(expression, context, deps)
    }
  }

  const prepared = emitPreparedCallArgs(
    expression,
    params,
    context,
    deps,
    objectFunctionCalleeArgumentSeenTypes(expression.callee, context)
  )
  const lines = prepared.lines
  const args = prepared.args
  invalidateArrayReferenceArguments(expression, params, context)

  if (isThrowingFunctionCallee(expression.callee, context)) {
    return emitPreparedThrowingCallExpression(expression, args, lines, context, deps)
  }

  if (deps.isPromiseReturningFunctionCallee(expression.callee, context)) {
    registerEventLoop(context)

    return {
      lines,
      expression: `${emitCallee(expression.callee, context)}(${joinStrings(args, ', ')})`
    }
  }

  if (deps.isExternalEventLoopFunctionCallee(expression.callee, context)) {
    registerEventLoop(context)

    return {
      lines,
      expression: `${emitCallee(expression.callee, context)}(${joinStrings(args, ', ')})`
    }
  }

  return {
    lines,
    expression: `${emitCallee(expression.callee, context)}(${joinStrings(args, ', ')})`
  }
}

function invalidateArrayReferenceArguments(
  expression: CValueNode,
  params: CFunctionParam[],
  context: CFunctionContext
): void {
  for (let index = 0; index < expression.args.length; index = index + 1) {
    const param = functionParamAt(params, index)

    invalidateArrayReferenceArgument(expression.args[index], param, context)
  }
}

function invalidateArrayReferenceArgument(
  argument: CValueNode,
  param: CFunctionParam | null,
  context: CFunctionContext
): void {
  if (argument.type !== 'Reference' || argument.path.length !== 1) {
    return
  }

  const name = argument.path[0]

  if (context.variables.get(name) !== 'array') {
    return
  }

  const elementType = invalidatedArrayElementType(name, argument, param, context)

  context.arrayShapes.delete(name)
  context.arrayLengths.delete(name)
  context.runtimeArrayElementTypes.set(name, elementType)
}

function invalidatedArrayElementType(
  name: string,
  argument: CValueNode,
  param: CFunctionParam | null,
  context: CFunctionContext
): string {
  const current = context.runtimeArrayElementTypes.get(name)

  if (current !== null && typeof current !== 'undefined') {
    return current
  }

  if (argument.arrayElementType !== null && typeof argument.arrayElementType !== 'undefined') {
    return argument.arrayElementType
  }

  if (
    param !== null &&
    typeof param !== 'undefined' &&
    param.arrayElementType !== null &&
    typeof param.arrayElementType !== 'undefined'
  ) {
    return param.arrayElementType
  }

  const elements = context.arrayShapes.get(name)

  if (elements === null || typeof elements === 'undefined') {
    return 'unknown'
  }

  return arrayShapeElementType(elements)
}

function arrayShapeElementType(elements: CArrayElementInfo[]): string {
  let elementType: string | null = null

  for (const element of elements) {
    if (elementType === null || typeof elementType === 'undefined') {
      elementType = element.valueType
    } else if (elementType !== element.valueType) {
      return 'unknown'
    }
  }

  if (elementType !== null && typeof elementType !== 'undefined') {
    return elementType
  }

  return 'unknown'
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
    expression: `Math.${method}(${joinStrings(expressions, ', ')})`,
    scalarType: 'double',
    valueType: 'number'
  }
}

export function emitPreparedCallArgs(
  expression: CValueNode,
  params: CFunctionParam[],
  context: CFunctionContext,
  deps: CCallExpressionDependencies,
  calleeSeenTypes: string[] = []
): PreparedCallArgs {
  const lines: string[] = []
  const args: string[] = []

  for (let index = 0; index < expression.args.length; index = index + 1) {
    const arg = expression.args[index]
    const param = functionParamAt(params, index)

    if (param !== null && typeof param !== 'undefined') {
      appendPreparedCallArg(lines, args, expression, arg, param, index, context, deps, calleeSeenTypes)
    } else {
      args.push(deps.emitCExpression(arg, context))
    }
  }

  for (let index = expression.args.length; index < params.length; index = index + 1) {
    const param = params[index]

    if (param.optional === true) {
      if (param.defaultValue !== null && typeof param.defaultValue !== 'undefined') {
        appendPreparedCallArg(lines, args, expression, param.defaultValue, param, index, context, deps, calleeSeenTypes)
      } else {
        args.push(emitDefaultOptionalArg(param))
        appendDefaultObjectFunctionFieldArguments(args, param, calleeSeenTypes)
      }
    }
  }

  return {
    lines,
    args
  }
}

function appendPreparedCallArg(
  lines: string[],
  args: string[],
  expression: CValueNode,
  arg: CValueNode,
  param: CFunctionParam,
  index: number,
  context: CFunctionContext,
  deps: CCallExpressionDependencies,
  calleeSeenTypes: string[]
): void {
  const paramValueType = param.valueType

  if (isNullableScalarParam(param)) {
    const value = deps.emitNullableScalarValueExpression(arg, context)

    appendLines(lines, value.lines)
    args.push(value.expression)
  } else if (paramValueType === 'function' && cBooleanValueIsTrue(param.nullable)) {
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
  } else if (nativeClassParamName(param, context) !== null) {
    const value = deps.emitCValueExpression(arg, context)

    appendLines(lines, value.lines)
    args.push(value.expression)
  } else if (paramValueType === 'object') {
    let value = deps.emitCValueExpression(arg, context)

    if (arg.type === 'ObjectLiteral') {
      value = deps.emitCObjectLiteralValueExpression(arg, context, param.shape)
    }

    appendLines(lines, value.lines)
    const objectValue = emitPreparedObjectCallArgumentExpression(value, context)
    appendLines(lines, objectValue.lines)
    args.push(objectValue.expression)
    appendObjectFunctionFieldArguments(lines, args, arg, param, context, deps, calleeSeenTypes)
  } else if (isManagedRuntimeReturnType(paramValueType)) {
    const value = deps.emitCValueExpression(arg, context)

    appendLines(lines, value.lines)
    args.push(value.expression)
  } else if (paramValueType === 'function') {
    const runtimeFunctionType = deps.resolveRuntimeFunctionArgumentType(expression.callee, index, param, context)

    if (runtimeFunctionType !== null && typeof runtimeFunctionType !== 'undefined') {
      const value = deps.emitRuntimeCallbackValue(arg, runtimeFunctionType, context)

      appendLines(lines, value.lines)
      args.push(value.expression)
    } else {
      args.push(deps.emitFunctionValueExpression(arg, context))
    }
  } else if (paramValueType === 'number' || paramValueType === 'boolean') {
    const value = emitPreparedScalarCallArgumentExpression(arg, paramValueType, context, deps)

    appendLines(lines, value.lines)
    args.push(value.expression)
  } else {
    args.push(deps.emitCExpression(arg, context))
  }
}

function emitPreparedObjectCallArgumentExpression(
  value: PreparedExpression,
  context: CFunctionContext
): PreparedExpression {
  const classInstance = emitPreparedClassInstanceRefValueExpression(value, context)

  if (classInstance !== null && typeof classInstance !== 'undefined') {
    return classInstance
  }

  return {
    lines: [],
    expression: value.expression,
    valueType: value.valueType
  }
}

function nativeClassParamName(param: CFunctionParam, context: CFunctionContext): string | null {
  const className = param.className

  if (className === null || typeof className === 'undefined') {
    return null
  }

  const info = context.classInfos.get(className)

  if (info === null || typeof info === 'undefined' || !info.native) {
    return null
  }

  return className
}

function emitPreparedScalarCallArgumentExpression(
  expression: CValueNode,
  valueType: string,
  context: CFunctionContext,
  deps: CCallExpressionDependencies
): PreparedExpression {
  const dynamicValue = emitPreparedExpectedDynamicRuntimeScalarValueExpression(expression, valueType, context, deps)

  if (dynamicValue !== null && typeof dynamicValue !== 'undefined') {
    return dynamicValue
  }

  return deps.emitPreparedNumberExpression(expression, context)
}

function emitDefaultOptionalArg(param: CFunctionParam): string {
  if (param.nullable === true && isRuntimeNullableType(param.valueType)) {
    return 'inox_null_value()'
  }

  if (
    param.valueType === 'unknown' ||
    isManagedRuntimeReturnType(param.valueType) ||
    isOpaqueRuntimeValueType(param.valueType)
  ) {
    return 'inox_undefined_value()'
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

  if (deps.isExternalEventLoopFunctionCallee(expression.callee, context)) {
    registerEventLoop(context)
  }

  appendLines(callArgs, args)
  appendLines(lines, preparedLines)

  const target = deps.currentErrorTarget(context.errorTargets)

  if (target === '' && !context.throwingFunction) {
    context.diagnostics.push(
      diagnostic(
        'INOX_C_THROW',
        'uncaught throwing function calls must be inside try/catch in the current C backend slice',
        expression.loc
      )
    )
  }

  if (target !== '') {
    deps.registerErrorValue(context)
  } else {
    deps.registerErrorChannel(context)
  }
  appendLines(lines, emitPrepareOwnedValueWrite('inox_error'))

  if (returnType !== 'void') {
    if (
      returnType === 'unknown' ||
      isManagedRuntimeReturnType(returnType) ||
      isOpaqueRuntimeValueType(returnType) ||
      (returnNullable && isNullableScalarType(returnType))
    ) {
      result = nextCName(context, 'inox_call_result')
      lines.push(`inox_value ${result} = inox_undefined_value();`)
    } else {
      result = nextCName(context, 'inox_call_result')
      lines.push(`double ${result} = 0;`)
    }

    callArgs.push(`&${result}`)
  }

  callArgs.push('&inox_error')

  const status = nextCName(context, 'inox_call_status')

  lines.push(`inox_status ${status} = ${emitCallee(expression.callee, context)}(${joinStrings(callArgs, ', ')});`)
  appendLines(lines, emitThrowingCallStatusCheck(status, target, context))

  return {
    lines,
    expression: result
  }
}

function resolveCFunctionCallReturnInfo(name: string, context: CFunctionContext): CFunctionCallReturnInfo {
  const configuredReturnType = context.functionReturnTypes.get(name)
  let returnType = 'void'

  if (configuredReturnType !== null && typeof configuredReturnType !== 'undefined') {
    returnType = configuredReturnType
  }

  if (cBooleanValueIsTrue(context.functionAsyncFlags.get(name)) && returnType === 'promise') {
    const promiseValueType = context.functionReturnPromiseValueTypes.get(name)
    let asyncReturnType = 'void'

    if (promiseValueType !== null && typeof promiseValueType !== 'undefined') {
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

function emitThrowingCallStatusCheck(
  status: string,
  target: string,
  context: CFunctionContext
): string[] {
  const lines = [`if (${status} == INOX_ERR_THROW) {`]

  if (target !== '') {
    lines.push('  inox::throw_value(inox_error);')
    lines.push(`  goto ${target};`)
  } else if (context.throwingFunction) {
    lines.push('  inox_error_active = 1;')
    lines.push('  inox_status_result = INOX_ERR_THROW;')
    lines.push('  goto cleanup;')
  } else {
    lines.push(`  ${emitFailureStatement(context)}`)
  }

  lines.push('}')
  lines.push(`if (${status} != INOX_OK) ${emitFailureStatement(context)}`)

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

  if (objectFunctionCallee !== null && typeof objectFunctionCallee !== 'undefined') {
    return objectFunctionCallee
  }

  if (callee.type === 'Reference' && callee.path.length === 1) {
    const name = stringValueAt(callee.path, 0)

    if (isCJsGlobalRoot(name, context)) {
      reportCJsGlobalDiagnostic(context.diagnostics, callee.loc)
      return '_'
    }

    const functionName = context.functionNames.get(name)

    if (functionName !== null && typeof functionName !== 'undefined') {
      return functionName
    }

    return name
  }

  if (usesCJsGlobal(callee, context)) {
    reportCJsGlobalDiagnostic(context.diagnostics, callee.loc)
    return '_'
  }

  context.diagnostics.push(
    diagnostic('INOX_C_CALL_EXPR', 'this call expression is not supported by the current C backend slice', callee.loc)
  )
  return '_'
}

export function emitCExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CScalarExpressionDependencies
): string {
  if (isCoalesceExpression(expression)) {
    context.diagnostics.push(
      diagnostic('INOX_C_NULLISH', 'nullish coalescing is not supported by the current C backend slice', expression.loc)
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
        'INOX_C_FUNCTION_VALUE',
        'function values are not supported by the current C backend slice',
        expressionLocation(expression)
      )
    )
    return '0'
  }

  if (valueType === 'timer') {
    context.diagnostics.push(
      diagnostic(
        'INOX_C_TIMER_HANDLE',
        'timer handles can only be stored or passed to clear timer functions in the current C backend slice',
        expressionLocation(expression)
      )
    )
    return '0'
  }

  if (valueType === 'crypto-hash') {
    context.diagnostics.push(
      diagnostic(
        'INOX_C_CRYPTO_HASH',
        'crypto hash handles can only be stored or used through Hash.update() and Hash.digest() in the current C backend slice',
        expressionLocation(expression)
      )
    )
    return '0'
  }

  if (valueType === 'crypto-hmac') {
    context.diagnostics.push(
      diagnostic(
        'INOX_C_CRYPTO_HMAC',
        'crypto hmac handles can only be stored or used through Hmac.update() and Hmac.digest() in the current C backend slice',
        expressionLocation(expression)
      )
    )
    return '0'
  }

  if (valueType === 'optional') {
    context.diagnostics.push(
      diagnostic(
        'INOX_C_OPTIONAL_CHAINING',
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
  const classMethodCall = deps.emitPreparedClassMethodCallExpression(expression, context, {})

  if (classMethodCall !== null && typeof classMethodCall !== 'undefined' && classMethodCall.expression !== '') {
    return classMethodCall
  }

  const fsConstant = deps.cFsRuntimeConstantExpression(expression)

  if (fsConstant !== null && typeof fsConstant !== 'undefined') {
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

  if (pathBooleanCall !== null && typeof pathBooleanCall !== 'undefined') {
    return pathBooleanCall
  }

  const arrayIsArrayCall = deps.emitPreparedArrayIsArrayCallExpression(expression, context)

  if (arrayIsArrayCall !== null && typeof arrayIsArrayCall !== 'undefined') {
    return arrayIsArrayCall
  }

  const urlSearchParamsCall = deps.emitPreparedUrlSearchParamsCallExpression(expression, context)

  if (
    urlSearchParamsCall !== null &&
    typeof urlSearchParamsCall !== 'undefined' &&
    urlSearchParamsCall.valueType === 'boolean'
  ) {
    return urlSearchParamsCall
  }

  const processNumber = deps.emitPreparedProcessNumberExpression(expression)

  if (processNumber !== null && typeof processNumber !== 'undefined') {
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

    if (resolvedType !== null && typeof resolvedType !== 'undefined') {
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
        'INOX_C_NULLISH',
        'nullable scalar values must be narrowed with ?? before scalar use in the current C backend slice',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: '0'
    }
  }

  const referencePathStringLength = deps.emitPreparedStringLengthExpression(expression, context)

  if (referencePathStringLength !== null && typeof referencePathStringLength !== 'undefined') {
    return referencePathStringLength
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

      if (truthiness !== null && typeof truthiness !== 'undefined') {
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

    if (scalarNullish !== null && typeof scalarNullish !== 'undefined') {
      return scalarNullish
    }

    if (isCoalesceExpression(expression)) {
      context.diagnostics.push(
        diagnostic(
          'INOX_C_NULLISH',
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

    if (nullableNullCompare !== null && typeof nullableNullCompare !== 'undefined') {
      return nullableNullCompare
    }

    const nullableBooleanLiteralCompare = emitPreparedNullableBooleanLiteralCompareExpression(expression, context, deps)

    if (nullableBooleanLiteralCompare !== null && typeof nullableBooleanLiteralCompare !== 'undefined') {
      return nullableBooleanLiteralCompare
    }

    const dynamicObjectNullCompare = emitPreparedDynamicObjectNullCompareExpression(expression, context, deps)

    if (dynamicObjectNullCompare !== null && typeof dynamicObjectNullCompare !== 'undefined') {
      return dynamicObjectNullCompare
    }

    const stringNullCompare = emitPreparedStringNullCompareExpression(expression, leftType, rightType)

    if (stringNullCompare !== null && typeof stringNullCompare !== 'undefined') {
      return stringNullCompare
    }

    const runtimeReferenceCompare = emitPreparedRuntimeReferenceCompareExpression(
      expression,
      leftType,
      rightType,
      context,
      deps
    )

    if (runtimeReferenceCompare !== null && typeof runtimeReferenceCompare !== 'undefined') {
      return runtimeReferenceCompare
    }

    const dynamicObjectBooleanLiteralCompare = emitPreparedDynamicObjectBooleanLiteralCompareExpression(
      expression,
      context,
      deps
    )

    if (dynamicObjectBooleanLiteralCompare !== null && typeof dynamicObjectBooleanLiteralCompare !== 'undefined') {
      return dynamicObjectBooleanLiteralCompare
    }

    const typeofCompare = emitPreparedTypeofCompareExpression(expression, context, deps)

    if (typeofCompare !== null && typeof typeofCompare !== 'undefined') {
      return typeofCompare
    }

    const dynamicObjectStringLiteralCompare = emitPreparedDynamicObjectStringLiteralCompareExpression(
      expression,
      context,
      deps
    )

    if (dynamicObjectStringLiteralCompare !== null && typeof dynamicObjectStringLiteralCompare !== 'undefined') {
      return dynamicObjectStringLiteralCompare
    }

    const nullableStringCompare = emitPreparedNullableStringCompareExpression(expression, context, deps)

    if (nullableStringCompare !== null && typeof nullableStringCompare !== 'undefined') {
      return nullableStringCompare
    }

    if (
      isStringComparisonOperator(expression.operator) &&
      (shouldEmitTypedStringValueCompare(expression) ||
        ((leftType === 'string' || rightType === 'string') &&
          canEmitStringCompareOperands(expression, leftType, rightType, context, deps)))
    ) {
      return deps.emitPreparedStringCompareExpression(expression, context)
    }

    const runtimeStringLiteralCompare = emitPreparedRuntimeStringLiteralCompareExpression(expression, context, deps)

    if (runtimeStringLiteralCompare !== null && typeof runtimeStringLiteralCompare !== 'undefined') {
      return runtimeStringLiteralCompare
    }

    if (expression.operator === '&&' || expression.operator === '||') {
      return emitPreparedLogicalExpression(expression, context, deps)
    }

    if (leftType === 'string' || rightType === 'string') {
      context.diagnostics.push(
        diagnostic(
          'INOX_C_STRING_EXPR',
          'string binary expressions are not supported by the current C backend slice',
          expression.loc
        )
      )

      return {
        lines: [],
        expression: '0'
      }
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

  if (expression.type === 'ConditionalExpression') {
    return emitPreparedConditionalNumberExpression(expression, context, deps)
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

    if (jsonScalarParse !== null && typeof jsonScalarParse !== 'undefined') {
      return jsonScalarParse
    }

    const binaryCall = deps.emitPreparedBinaryNumberCallExpression(expression, context)

    if (binaryCall !== null && typeof binaryCall !== 'undefined') {
      return binaryCall
    }

    const cryptoCall = deps.emitPreparedCryptoNumberCallExpression(expression, context)

    if (cryptoCall !== null && typeof cryptoCall !== 'undefined') {
      return cryptoCall
    }

    const numericCast = emitPreparedNumericCastExpression(expression, context, deps)

    if (numericCast !== null && typeof numericCast !== 'undefined') {
      return numericCast
    }

    const regexpTest = emitPreparedRegExpTestExpression(expression, context, deps)

    if (regexpTest !== null && typeof regexpTest !== 'undefined') {
      return regexpTest
    }

    if (deps.isStringPredicateCall(expression, context)) {
      return deps.emitPreparedStringPredicateCall(expression, context)
    }

    const arrayIncludesCall = deps.emitPreparedArrayIncludesCallExpression(expression, context)

    if (arrayIncludesCall !== null && typeof arrayIncludesCall !== 'undefined') {
      return arrayIncludesCall
    }

    const arrayReduceCall = deps.emitPreparedArrayReduceCallExpression(expression, context)

    if (arrayReduceCall !== null && typeof arrayReduceCall !== 'undefined') {
      return arrayReduceCall
    }

    const arrayUnshiftCall = deps.emitPreparedArrayUnshiftCallExpression(expression, context)

    if (arrayUnshiftCall !== null && typeof arrayUnshiftCall !== 'undefined') {
      return arrayUnshiftCall
    }

    const stringCharCodeAt = deps.emitPreparedStringCharCodeAtExpression(expression, context)

    if (stringCharCodeAt !== null && typeof stringCharCodeAt !== 'undefined') {
      return stringCharCodeAt
    }

    const stringIndexCall = deps.emitPreparedStringIndexCallExpression(expression, context)

    if (stringIndexCall !== null && typeof stringIndexCall !== 'undefined') {
      return stringIndexCall
    }

    const collectionCall = deps.emitPreparedCollectionCallExpression(expression, context)

    if (collectionCall !== null && typeof collectionCall !== 'undefined') {
      return collectionCall
    }

    return deps.emitPreparedCallExpression(expression, context)
  }

  if (expression.type === 'OptionalCallExpression') {
    const optionalPlainCall = emitPreparedOptionalPlainFunctionPointerCallExpression(expression, context, deps)

    if (optionalPlainCall !== null && typeof optionalPlainCall !== 'undefined') {
      return optionalPlainCall
    }
  }

  const stringLength = deps.emitPreparedStringLengthExpression(expression, context)

  if (stringLength !== null && typeof stringLength !== 'undefined') {
    return stringLength
  }

  if (deps.isMemberAccessExpression(expression)) {
    const nodeNetworkAddressPort = deps.emitPreparedNodeNetworkAddressPortExpression(expression, context)

    if (nodeNetworkAddressPort !== null && typeof nodeNetworkAddressPort !== 'undefined') {
      return nodeNetworkAddressPort
    }

    let length: PreparedExpression | null = null

    if (expression.property === 'length') {
      length = deps.emitPreparedArrayLengthExpression(expression, context)
    }

    if (length !== null && typeof length !== 'undefined') {
      return length
    }

    const collectionSize = deps.emitPreparedCollectionSizeExpression(expression, context)

    if (collectionSize !== null && typeof collectionSize !== 'undefined') {
      return collectionSize
    }

    const bytesLength = deps.emitPreparedBytesLengthExpression(expression, context)

    if (bytesLength !== null && typeof bytesLength !== 'undefined') {
      return bytesLength
    }

    const nativeClassField = emitPreparedNativeClassFieldScalarExpression(expression, context)

    if (nativeClassField !== null && typeof nativeClassField !== 'undefined') {
      return nativeClassField
    }

    const fetchResponseMember = emitPreparedFetchResponseScalarMemberExpression(expression, context)

    if (fetchResponseMember !== null && typeof fetchResponseMember !== 'undefined') {
      return fetchResponseMember
    }

    const member = deps.resolveKnownObjectMember(expression, context)

    if (member !== null && typeof member !== 'undefined' && isNumberOrBooleanValueType(member.valueType)) {
      const value = nextCName(context, 'inox_expr_value')
      const objectReference = deps.emitObjectValueReference(member.objectName ?? '', context)
      const key = member.key ?? ''
      const getLines = emitRuntimeObjectGetValueLines(objectReference, key, value, context)

      return emitPreparedRuntimeNumberValue(member.valueType, value, getLines, context)
    }

    const objectMember = deps.emitPreparedObjectExpressionScalarMemberValueExpression(expression, context)

    if (objectMember !== null && typeof objectMember !== 'undefined') {
      return {
        lines: objectMember.lines,
        expression: scalarRuntimeValueExpression(objectMember.expression, objectMember.valueType ?? 'number')
      }
    }
  }

  if (deps.isIndexAccessExpression(expression)) {
    const element = deps.resolveKnownArrayIndex(expression, context)

    if (element !== null && typeof element !== 'undefined' && isNumberOrBooleanValueType(element.valueType)) {
      const value = nextCName(context, 'inox_expr_value')
      const getLines = [
        `${value} = ArrayClass(${element.arrayName}).get(${element.index});`,
        emitRuntimeTypeCheck('inox::thrown()', context)
      ]

      return emitPreparedRuntimeNumberValue(element.valueType, value, getLines, context)
    }

    const field = deps.resolveKnownObjectIndex(expression, context)

    if (field !== null && typeof field !== 'undefined' && isNumberOrBooleanValueType(field.valueType)) {
      const value = nextCName(context, 'inox_expr_value')
      const objectReference = deps.emitObjectValueReference(field.objectName ?? '', context)
      const getLines = emitRuntimeObjectGetValueLines(objectReference, field.key, value, context)

      return emitPreparedRuntimeNumberValue(field.valueType, value, getLines, context)
    }

    const objectField = deps.emitPreparedObjectExpressionScalarIndexValueExpression(expression, context)

    if (objectField !== null && typeof objectField !== 'undefined') {
      return {
        lines: objectField.lines,
        expression: scalarRuntimeValueExpression(objectField.expression, objectField.valueType ?? 'number')
      }
    }

    const objectRuntimeArrayValue = deps.emitPreparedObjectRuntimeArrayIndexValueExpression(expression, context)

    if (
      objectRuntimeArrayValue !== null &&
      typeof objectRuntimeArrayValue !== 'undefined' &&
      isNumberOrBooleanValueType(objectRuntimeArrayValue.valueType ?? 'unknown')
    ) {
      return {
        lines: objectRuntimeArrayValue.lines,
        expression: scalarRuntimeValueExpression(
          objectRuntimeArrayValue.expression,
          objectRuntimeArrayValue.valueType ?? 'number'
        )
      }
    }

    const runtimeElement = deps.resolveRuntimeArrayIndex(expression, context)

    if (
      runtimeElement !== null &&
      typeof runtimeElement !== 'undefined' &&
      isNumberOrBooleanValueType(runtimeElement.valueType)
    ) {
      const value = deps.emitPreparedRuntimeArrayIndexValue(expression, runtimeElement, context, 'inox_expr_value')

      return {
        lines: value.lines,
        expression: scalarRuntimeValueExpression(value.expression, runtimeElement.valueType)
      }
    }

    const bytesIndex = deps.emitPreparedBytesIndexExpression(expression, context)

    if (bytesIndex !== null && typeof bytesIndex !== 'undefined') {
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

  if (dynamicRuntimeScalar !== null && typeof dynamicRuntimeScalar !== 'undefined') {
    return dynamicRuntimeScalar
  }

  if (isOptionalChainExpression(expression)) {
    context.diagnostics.push(
      diagnostic(
        'INOX_C_OPTIONAL_CHAINING',
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
      'INOX_C_NUMBER_EXPR',
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

    if (argument === null || typeof argument === 'undefined') {
      return null
    }

    return {
      lines: argument.lines,
      expression: `(!(${argument.expression}))`
    }
  }

  if (deps.isMemberAccessExpression(expression)) {
    const nativeClassField = emitPreparedNativeClassFieldScalarExpression(expression, context)

    if (nativeClassField !== null && typeof nativeClassField !== 'undefined') {
      return nativeClassField
    }
  }

  if (deps.isNullableRuntimeExpression(expression, context)) {
    const value = deps.emitCValueExpression(expression, context)

    return {
      lines: value.lines,
      expression: `inox_value_truthy(${value.expression}) ? 1 : 0`
    }
  }

  const runtimeReference = emitPreparedRuntimeValueReferenceExpression(expression, context)

  if (runtimeReference !== null && typeof runtimeReference !== 'undefined') {
    return {
      lines: runtimeReference.lines,
      expression: `inox_value_truthy(${runtimeReference.expression}) ? 1 : 0`
    }
  }

  const value = emitPreparedOptionalDynamicObjectFieldValueExpression(expression, context, deps)

  if (value === null || typeof value === 'undefined') {
    const dynamicValue = emitPreparedDynamicRuntimeValueExpression(expression, context, deps)

    if (dynamicValue === null || typeof dynamicValue === 'undefined') {
      return null
    }

    return {
      lines: dynamicValue.lines,
      expression: `inox_value_truthy(${dynamicValue.expression}) ? 1 : 0`
    }
  }

  return {
    lines: value.lines,
    expression: `inox_value_truthy(${value.expression}) ? 1 : 0`
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
    return emitPreparedOptionalRuntimeObjectFieldValueExpression(
      expression.object,
      expression.index.value,
      context,
      deps
    )
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
  const value = nextCName(context, 'inox_value')
  const lines: string[] = []

  registerOwnedValue(context, value)
  appendLines(lines, object.lines)
  appendLines(lines, emitPrepareOwnedValueWrite(value))
  appendLines(lines, emitRuntimeObjectGetValueLines(object.expression, key, value, context))

  return {
    lines,
    expression: value,
    owned: true
  }
}

function emitPreparedDynamicObjectStringLiteralCompareExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CScalarExpressionDependencies
): PreparedExpression | null {
  if (!isEqualityOperator(expression.operator)) {
    return null
  }

  const leftLiteral = stringLiteralValue(expression.left)

  if (leftLiteral !== null && typeof leftLiteral !== 'undefined') {
    if (deps.isMemberAccessExpression(expression.right)) {
      const nativeClassField = emitPreparedNativeClassFieldValueExpression(expression.right, context)

      if (nativeClassField !== null && typeof nativeClassField !== 'undefined' && nativeClassField.valueType === 'string') {
        return deps.emitPreparedStringCompareExpression(expression, context)
      }
    }

    if (isDynamicReferenceObjectFieldExpression(expression.right, context, deps)) {
      const value = emitPreparedOptionalDynamicObjectFieldValueExpression(expression.right, context, deps)

      if (value !== null && typeof value !== 'undefined') {
        return emitPreparedRuntimePreparedValueStringLiteralCompare(value, leftLiteral, expression.operator, context)
      }
    }
  }

  const rightLiteral = stringLiteralValue(expression.right)

  if (rightLiteral !== null && typeof rightLiteral !== 'undefined') {
    if (deps.isMemberAccessExpression(expression.left)) {
      const nativeClassField = emitPreparedNativeClassFieldValueExpression(expression.left, context)

      if (nativeClassField !== null && typeof nativeClassField !== 'undefined' && nativeClassField.valueType === 'string') {
        return deps.emitPreparedStringCompareExpression(expression, context)
      }
    }

    if (isDynamicReferenceObjectFieldExpression(expression.left, context, deps)) {
      const value = emitPreparedOptionalDynamicObjectFieldValueExpression(expression.left, context, deps)

      if (value !== null && typeof value !== 'undefined') {
        return emitPreparedRuntimePreparedValueStringLiteralCompare(value, rightLiteral, expression.operator, context)
      }
    }
  }

  return null
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

  if (leftLiteral !== null && typeof leftLiteral !== 'undefined') {
    return emitPreparedRuntimeValueStringLiteralCompare(
      expression.right,
      leftLiteral,
      expression.operator,
      context,
      deps
    )
  }

  const rightLiteral = stringLiteralValue(expression.right)

  if (rightLiteral !== null && typeof rightLiteral !== 'undefined') {
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

function emitPreparedNullableStringCompareExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CScalarExpressionDependencies
): PreparedExpression | null {
  if (!isEqualityOperator(expression.operator)) {
    return null
  }

  const leftNullable = isNullableStringRuntimeValueExpression(expression.left, context, deps)
  const rightNullable = isNullableStringRuntimeValueExpression(expression.right, context, deps)

  if (!leftNullable && !rightNullable) {
    return null
  }

  const leftLiteral = stringLiteralValue(expression.left)

  if (
    leftLiteral !== null &&
    typeof leftLiteral !== 'undefined' &&
    isNullableStringRuntimeValueExpression(expression.right, context, deps)
  ) {
    return emitPreparedRuntimeValueStringLiteralCompare(
      expression.right,
      leftLiteral,
      expression.operator,
      context,
      deps
    )
  }

  const rightLiteral = stringLiteralValue(expression.right)

  if (
    rightLiteral !== null &&
    typeof rightLiteral !== 'undefined' &&
    isNullableStringRuntimeValueExpression(expression.left, context, deps)
  ) {
    return emitPreparedRuntimeValueStringLiteralCompare(
      expression.left,
      rightLiteral,
      expression.operator,
      context,
      deps
    )
  }

  if (leftNullable && rightNullable) {
    const left = emitPreparedNullableStringRuntimeValueExpression(expression.left, context, deps)
    const right = emitPreparedNullableStringRuntimeValueExpression(expression.right, context, deps)
    const lines: string[] = []

    appendLines(lines, left.lines)
    appendLines(lines, right.lines)

    return emitPreparedNullableStringCompareResult(
      lines,
      runtimeStringValuesEqualExpression(left.expression, right.expression),
      expression.operator
    )
  }

  if (leftNullable) {
    if (!deps.canEmitStringBytesOperand(expression.right, context)) {
      return null
    }

    const left = emitPreparedNullableStringRuntimeValueExpression(expression.left, context, deps)
    const right = deps.emitPreparedStringBytesOperand(expression.right, context, 'inox_cmp_string')
    const lines: string[] = []

    appendLines(lines, left.lines)
    appendLines(lines, right.lines)

    return emitPreparedNullableStringCompareResult(
      lines,
      runtimeStringValueEqualsBytesExpression(left.expression, right.bytes, right.length),
      expression.operator
    )
  }

  if (!deps.canEmitStringBytesOperand(expression.left, context)) {
    return null
  }

  const left = deps.emitPreparedStringBytesOperand(expression.left, context, 'inox_cmp_string')
  const right = emitPreparedNullableStringRuntimeValueExpression(expression.right, context, deps)
  const lines: string[] = []

  appendLines(lines, left.lines)
  appendLines(lines, right.lines)

  return emitPreparedNullableStringCompareResult(
    lines,
    runtimeStringValueEqualsBytesExpression(right.expression, left.bytes, left.length),
    expression.operator
  )
}

function isNullableStringRuntimeValueExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CScalarExpressionDependencies
): boolean {
  if (isOptionalKnownStringFieldExpression(expression, context, deps)) {
    return true
  }

  if (deps.inferExpressionType(expression, context) !== 'string') {
    return false
  }

  return deps.isNullableRuntimeExpression(expression, context)
}

function emitPreparedNullableStringRuntimeValueExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CScalarExpressionDependencies
): PreparedExpression {
  const dynamicValue = emitPreparedDynamicRuntimeValueExpression(expression, context, deps)

  if (dynamicValue !== null && typeof dynamicValue !== 'undefined') {
    return dynamicValue
  }

  return deps.emitCValueExpression(expression, context)
}

function isOptionalKnownStringFieldExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CScalarExpressionDependencies
): boolean {
  return (
    isOptionalKnownStringField(deps.resolveKnownObjectMember(expression, context)) ||
    isOptionalKnownStringField(deps.resolveKnownObjectIndex(expression, context))
  )
}

function isOptionalKnownStringField(field: CKnownObjectField | CKnownObjectIndexField | null | undefined): boolean {
  return field !== null && typeof field !== 'undefined' && field.optional === true && field.valueType === 'string'
}

function emitPreparedNullableStringCompareResult(
  lines: string[],
  equals: string,
  operator: string
): PreparedExpression {
  if (isPositiveEqualityOperator(operator)) {
    return {
      lines,
      expression: equals
    }
  }

  return {
    lines,
    expression: `(!${equals})`
  }
}

function runtimeStringValuesEqualExpression(left: string, right: string): string {
  const leftString = `((inox_string*)${left}.as.ref)`
  const rightString = `((inox_string*)${right}.as.ref)`

  return (
    `((${left}.tag == INOX_TAG_STRING && ${right}.tag == INOX_TAG_STRING && ` +
    `${left}.as.ref != 0 && ${right}.as.ref != 0 && ` +
    `${leftString}->len == ${rightString}->len && ` +
    `memcmp(${leftString}->bytes, ${rightString}->bytes, ${leftString}->len) == 0) || ` +
    `(${left}.tag == ${right}.tag && (${left}.tag == INOX_TAG_NULL || ${left}.tag == INOX_TAG_UNDEFINED)))`
  )
}

function runtimeStringValueEqualsBytesExpression(value: string, bytes: string, length: string): string {
  const string = `((inox_string*)${value}.as.ref)`

  return (
    `(${value}.tag == INOX_TAG_STRING && ${value}.as.ref != 0 && ` +
    `${string}->len == ${length} && memcmp(${string}->bytes, ${bytes}, ${length}) == 0)`
  )
}

function emitPreparedRuntimeValueStringLiteralCompare(
  valueExpression: CValueNode,
  literal: string,
  operator: string,
  context: CFunctionContext,
  deps: CScalarExpressionDependencies
): PreparedExpression {
  if (isDynamicReferenceObjectFieldExpression(valueExpression, context, deps)) {
    const objectFieldValue = emitPreparedOptionalDynamicObjectFieldValueExpression(valueExpression, context, deps)

    if (objectFieldValue !== null && typeof objectFieldValue !== 'undefined') {
      return emitPreparedRuntimePreparedValueStringLiteralCompare(objectFieldValue, literal, operator, context)
    }
  }

  const dynamicValue = emitPreparedDynamicRuntimeValueExpression(valueExpression, context, deps)

  if (dynamicValue !== null && typeof dynamicValue !== 'undefined') {
    return emitPreparedRuntimePreparedValueStringLiteralCompare(dynamicValue, literal, operator, context)
  }

  const value = deps.emitCValueExpression(valueExpression, context)

  return emitPreparedRuntimePreparedValueStringLiteralCompare(value, literal, operator, context)
}

function isDynamicReferenceObjectFieldExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CScalarExpressionDependencies
): boolean {
  const access = dynamicObjectFieldAccess(expression, context, deps)

  if (access === null || typeof access === 'undefined') {
    return false
  }

  if (deps.resolveKnownObjectMember(expression, context)) {
    return false
  }

  return !deps.resolveKnownObjectIndex(expression, context)
}

function emitPreparedRuntimePreparedValueStringLiteralCompare(
  value: PreparedExpression,
  literal: string,
  operator: string,
  context: CFunctionContext
): PreparedExpression {
  const temp = nextCName(context, 'inox_string_cmp_value')
  const literalLength = utf8ByteLength(literal)
  const string = `((inox_string*)${temp}.as.ref)`
  const equals =
    `(${temp}.tag == INOX_TAG_STRING && ${temp}.as.ref != 0 && ` +
    `${string}->len == ${literalLength} && memcmp(${string}->bytes, ${cStringLiteral(literal)}, ${literalLength}) == 0)`
  const lines: string[] = []
  let resultExpression = `(!${equals})`

  appendLines(lines, value.lines)
  lines.push(`inox_value ${temp} = ${value.expression};`)

  if (operator === '===') {
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
  const left = emitPreparedBooleanOperandExpression(expression.left, context, deps)
  const leftNarrowing = resolveNullableScalarConditionNarrowing(expression.left, context)
  let rightNarrowed = leftNarrowing.falseNames

  if (expression.operator === '&&') {
    rightNarrowed = leftNarrowing.trueNames
  }
  const snapshot = pushNullableScalarNarrowing(context, rightNarrowed)
  const right = emitPreparedBooleanOperandExpression(expression.right, context, deps)

  restoreNullableScalarNarrowing(context, snapshot)

  const temp = nextCName(context, 'inox_logical')

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

function emitPreparedBooleanOperandExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CScalarExpressionDependencies
): PreparedExpression {
  const truthiness = emitPreparedRuntimeTruthinessExpression(expression, context, deps)

  if (truthiness !== null && typeof truthiness !== 'undefined') {
    return truthiness
  }

  return emitPreparedNumberExpression(expression, context, deps)
}

function emitPreparedConditionalNumberExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CScalarExpressionDependencies
): PreparedExpression {
  const test = emitPreparedBooleanOperandExpression(expression.test, context, deps)
  const consequent = emitPreparedNumberExpression(expression.consequent, context, deps)
  const alternate = emitPreparedNumberExpression(expression.alternate, context, deps)
  const temp = nextCName(context, 'inox_conditional')
  const lines: string[] = []

  appendLines(lines, test.lines)
  lines.push(`double ${temp} = 0;`)
  lines.push(`if ${emitCConditionClause(test.expression)} {`)
  appendPrefixedLines(lines, consequent.lines, '  ')
  lines.push(`  ${temp} = ${consequent.expression};`)
  lines.push('} else {')
  appendPrefixedLines(lines, alternate.lines, '  ')
  lines.push(`  ${temp} = ${alternate.expression};`)
  lines.push('}')

  return {
    lines,
    expression: temp
  }
}

function emitPreparedOptionalPlainFunctionPointerCallExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CScalarExpressionDependencies
): PreparedExpression | null {
  const functionType = plainOptionalCallFunctionType(expression, context)

  if (functionType === null || typeof functionType === 'undefined') {
    return null
  }

  const returnType = functionType.returnType

  if (returnType !== 'number' && returnType !== 'boolean') {
    return null
  }

  return deps.emitPreparedCallExpression(asRequiredCallExpression(expression), context)
}

function plainOptionalCallFunctionType(
  expression: CValueNode,
  context: CFunctionContext
): CFunctionType | null {
  if (expression.type !== 'OptionalCallExpression') {
    return null
  }

  const callee = expression.callee

  if (callee.type !== 'Reference' || callee.path.length !== 1) {
    return null
  }

  const name = stringValueAt(callee.path, 0)

  if (context.nullableVariables.has(name) || context.runtimeCallbacks.has(name)) {
    return null
  }

  if (context.variables.get(name) !== 'function') {
    return null
  }

  const functionType = context.functionTypes.get(name)

  if (!isPlainFunctionPointerType(functionType)) {
    return null
  }

  return functionType ?? null
}

function asRequiredCallExpression(expression: CValueNode): CValueNode {
  return {
    type: 'CallExpression',
    callee: expression.callee,
    args: expression.args,
    valueType: expression.valueType,
    nullable: expression.nullable === true,
    arrayElementType: expression.arrayElementType,
    arrayElementDeclaredType: expression.arrayElementDeclaredType,
    mapKeyType: expression.mapKeyType,
    mapValueType: expression.mapValueType,
    promiseValueType: expression.promiseValueType,
    setElementType: expression.setElementType,
    functionType: expression.functionType,
    shape: expression.shape,
    className: expression.className,
    collectionKind: expression.collectionKind,
    loc: expression.loc
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
  const temp = nextCName(context, 'inox_nullable_scalar')
  const leftValue = scalarRuntimeValueExpression(left.expression, valueType)
  const leftTypeCheck = emitRuntimeTypeCheck(`${left.expression}.tag != ${expectedTag}`, context)
  const lines: string[] = []

  appendLines(lines, left.lines)
  lines.push(`double ${temp} = 0;`)
  lines.push(`if (${left.expression}.tag == INOX_TAG_NULL || ${left.expression}.tag == INOX_TAG_UNDEFINED) {`)
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
  const equals = `(${value.expression}.tag == INOX_TAG_NULL || ${value.expression}.tag == INOX_TAG_UNDEFINED)`
  let result = `(!${equals})`

  if (isPositiveEqualityOperator(expression.operator)) {
    result = equals
  }

  return {
    lines: value.lines,
    expression: result
  }
}

function emitPreparedNullableBooleanLiteralCompareExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CScalarExpressionDependencies
): PreparedExpression | null {
  if (!isEqualityOperator(expression.operator)) {
    return null
  }

  let nullable = expression.left
  let literal = expression.right

  if (expression.left.type === 'BooleanLiteral') {
    nullable = expression.right
    literal = expression.left
  }

  if (
    literal.type !== 'BooleanLiteral' ||
    deps.inferExpressionType(nullable, context) !== 'boolean' ||
    !isNullableRuntimeExpression(nullable, context)
  ) {
    return null
  }

  const value = deps.emitCValueExpression(nullable, context)
  let expected = '0'

  if (literal.value) {
    expected = '1'
  }

  const equals = `(${value.expression}.tag == INOX_TAG_BOOL && (${value.expression}.as.boolean ? 1 : 0) == ${expected})`

  if (!isPositiveEqualityOperator(expression.operator)) {
    return {
      lines: value.lines,
      expression: '(!' + equals + ')'
    }
  }

  return {
    lines: value.lines,
    expression: equals
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

  if (value === null || typeof value === 'undefined') {
    return null
  }

  const equals = `(${value.expression}.tag == INOX_TAG_NULL || ${value.expression}.tag == INOX_TAG_UNDEFINED)`
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

  if (literal === null || typeof literal === 'undefined') {
    valueExpression = expression.right
    literal = booleanLiteralValue(expression.left)
  }

  if (literal === null || typeof literal === 'undefined') {
    return null
  }

  const value = emitPreparedDynamicRuntimeValueExpression(valueExpression, context, deps)

  if (value === null || typeof value === 'undefined') {
    return null
  }

  const expected = runtimeBoolValueExpression(literal)
  const equals = `(${value.expression}.tag == INOX_TAG_BOOL && ${value.expression}.as.boolean == ${expected})`
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

  return emitPreparedExpectedDynamicRuntimeScalarValueExpression(expression, valueType, context, deps)
}

function emitPreparedExpectedDynamicRuntimeScalarValueExpression(
  expression: CValueNode,
  valueType: string,
  context: CFunctionContext,
  deps: CDynamicObjectArrayIndexDependencies
): PreparedExpression | null {
  if (!isNumberOrBooleanValueType(valueType)) {
    return null
  }

  if (expression.type === 'MemberExpression' && expression.property === 'length') {
    const arrayLength = deps.emitPreparedArrayLengthExpression(expression, context)

    if (arrayLength !== null && typeof arrayLength !== 'undefined') {
      return arrayLength
    }
  }

  const value = emitPreparedDynamicRuntimeValueExpression(expression, context, deps)

  if (value === null || typeof value === 'undefined') {
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

  if (expression.type === 'IndexExpression') {
    return (
      deps.inferExpressionType(expression.object, context) === 'object' &&
      deps.inferExpressionType(expression.index, context) === 'string'
    )
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

  if (isRuntimeArrayObjectIndexExpression(expression, context, deps)) {
    return true
  }

  return isDynamicRuntimeObjectFieldValueExpression(expression, context, deps)
}

function emitPreparedDynamicRuntimeValueExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CDynamicObjectArrayIndexDependencies
): PreparedExpression | null {
  const runtimeReference = emitPreparedRuntimeValueReferenceExpression(expression, context)

  if (runtimeReference !== null && typeof runtimeReference !== 'undefined') {
    return runtimeReference
  }

  if (isDynamicObjectFieldValueExpression(expression, context, deps)) {
    return deps.emitCValueExpression(expression, context)
  }

  const arrayIndexValue = emitPreparedDynamicObjectArrayIndexValueExpression(expression, context, deps)

  if (arrayIndexValue !== null && typeof arrayIndexValue !== 'undefined') {
    return arrayIndexValue
  }

  const runtimeArrayIndexValue = emitPreparedRuntimeArrayObjectIndexValueExpression(expression, context, deps)

  if (runtimeArrayIndexValue !== null && typeof runtimeArrayIndexValue !== 'undefined') {
    return runtimeArrayIndexValue
  }

  return emitPreparedDynamicRuntimeObjectFieldValueExpression(expression, context, deps)
}

function isDynamicRuntimeObjectFieldValueExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CDynamicObjectArrayIndexDependencies
): boolean {
  const access = dynamicRuntimeObjectFieldAccess(expression)

  if (access === null || typeof access === 'undefined') {
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

  if (access === null || typeof access === 'undefined') {
    return null
  }

  const object = emitPreparedDynamicRuntimeObjectValueExpression(access.object, context, deps)

  if (object === null || typeof object === 'undefined') {
    return null
  }

  const value = nextCName(context, 'inox_value')
  const lines: string[] = []

  appendLines(lines, object.lines)
  lines.push(`inox::Value ${value};`)
  lines.push(`if (${object.expression}.tag == INOX_TAG_ARRAY) {`)
  lines.push(`  ${value} = inox::Value();`)
  lines.push('} else {')
  lines.push(`  ${value} = inox::get(${object.expression}, ${cStringLiteral(access.key)});`)
  lines.push('}')
  appendLines(lines, emitRuntimeThrownCheckLines(context))

  return {
    lines,
    expression: value,
    cppType: 'inox::Value',
    owned: false
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

  const receiver = emitPreparedDynamicObjectArrayReceiver(expression.object, context, deps)
  const index = emitPreparedDynamicArrayIndexExpression(expression.index, context, deps)

  if (receiver === null || typeof receiver === 'undefined' || index === null || typeof index === 'undefined') {
    return null
  }

  const array = nextCName(context, 'inox_array_value')
  const value = nextCName(context, 'inox_value')
  const lines: string[] = []

  registerOwnedValue(context, array)
  registerOwnedValue(context, value)
  appendLines(lines, receiver.lines)
  appendLines(lines, index.lines)
  appendLines(lines, emitPrepareOwnedValueWrite(array))
  appendLines(lines, emitRuntimeObjectGetValueLines(receiver.expression, receiver.key, array, context))
  lines.push(emitRuntimeTypeCheck(`${array}.tag != INOX_TAG_ARRAY || ${array}.as.ref == 0`, context))
  appendLines(lines, emitPrepareOwnedValueWrite(value))
  lines.push(`${value} = ArrayClass(${array}).get(${index.expression});`)
  lines.push(emitRuntimeTypeCheck('inox::thrown()', context))

  return {
    lines,
    expression: value
  }
}

function emitPreparedDynamicObjectArrayReceiver(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CDynamicObjectArrayIndexDependencies
): CDynamicObjectArrayReceiver | null {
  const access = dynamicObjectFieldAccess(expression, context, deps)

  if (access !== null && typeof access !== 'undefined') {
    const object = deps.emitCValueExpression(access.object, context)

    return {
      lines: object.lines,
      expression: object.expression,
      key: access.key
    }
  }

  const runtimeAccess = dynamicRuntimeObjectFieldAccess(expression)

  if (runtimeAccess === null || typeof runtimeAccess === 'undefined') {
    return null
  }

  const object = emitPreparedDynamicRuntimeObjectValueExpression(runtimeAccess.object, context, deps)

  if (object === null || typeof object === 'undefined') {
    return null
  }

  const lines: string[] = []

  appendLines(lines, object.lines)
  lines.push(emitRuntimeTypeCheck(runtimeObjectApiValueMismatchCondition(object.expression), context))

  return {
    lines,
    expression: object.expression,
    key: runtimeAccess.key
  }
}

function emitPreparedDynamicRuntimeObjectValueExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CDynamicObjectArrayIndexDependencies
): PreparedExpression | null {
  const runtimeReference = emitPreparedRuntimeValueReferenceExpression(expression, context)

  if (runtimeReference !== null && typeof runtimeReference !== 'undefined') {
    return runtimeReference
  }

  if (isDynamicObjectFieldValueExpression(expression, context, deps)) {
    return deps.emitCValueExpression(expression, context)
  }

  const arrayIndexValue = emitPreparedDynamicObjectArrayIndexValueExpression(expression, context, deps)

  if (arrayIndexValue !== null && typeof arrayIndexValue !== 'undefined') {
    return arrayIndexValue
  }

  return emitPreparedDynamicRuntimeObjectFieldValueExpression(expression, context, deps)
}

function emitPreparedRuntimeValueReferenceExpression(
  expression: CValueNode,
  context: CFunctionContext
): PreparedExpression | null {
  const name = runtimeValueReferenceName(expression, context)

  if (name === null || typeof name === 'undefined') {
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

  if (dynamicObjectFieldAccess(expression.object, context, deps)) {
    return isDynamicArrayIndexExpression(expression.index, context, deps)
  }

  const runtimeAccess = dynamicRuntimeObjectFieldAccess(expression.object)

  if (runtimeAccess === null || typeof runtimeAccess === 'undefined') {
    return false
  }

  if (!isDynamicRuntimeObjectValueExpression(runtimeAccess.object, context, deps)) {
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
  return !!runtimeValueReferenceName(expression, context)
}

function isRuntimeArrayObjectIndexExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CDynamicObjectArrayIndexDependencies
): boolean {
  const element = deps.resolveRuntimeArrayIndex(expression, context)

  if (element === null || typeof element === 'undefined') {
    return false
  }

  return element.valueType === 'object' || element.valueType === 'unknown'
}

function emitPreparedRuntimeArrayObjectIndexValueExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CDynamicObjectArrayIndexDependencies
): PreparedExpression | null {
  const element = deps.resolveRuntimeArrayIndex(expression, context)

  if (
    element === null ||
    typeof element === 'undefined' ||
    (element.valueType !== 'object' && element.valueType !== 'unknown')
  ) {
    return null
  }

  return deps.emitPreparedRuntimeArrayIndexValue(expression, element, context, 'inox_object_value')
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

  if (!runtimeValueReferenceUsesInoxValueStorage(name, valueType, context)) {
    return null
  }

  return emitCIdentifier(name)
}

function runtimeValueReferenceUsesInoxValueStorage(
  name: string,
  valueType: string | null | undefined,
  context: CFunctionContext
): boolean {
  if (valueType === 'unknown' || isOpaqueRuntimeValueType(valueType)) {
    return true
  }

  if (!isManagedRuntimeReturnType(valueType)) {
    return false
  }

  if (valueType === 'string') {
    return isOwnedRuntimeValueName(name, context)
  }

  return true
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
  deps: CDynamicObjectFieldAccessDependencies
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
    const result = nextCName(context, 'inox_f32')
    const lines: string[] = []

    appendLines(lines, value.lines)
    lines.push(`double ${result} = (double)((float)${value.expression});`)

    return {
      lines,
      expression: result
    }
  }

  const limits = numericIntegerCastLimits(cast)

  if (limits === null || typeof limits === 'undefined') {
    return null
  }

  const raw = nextCName(context, `inox_${cast}_value`)
  const truncated = nextCName(context, `inox_${cast}_truncated`)
  const result = nextCName(context, `inox_${cast}`)
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

function isNumericCastCall(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CScalarExpressionDependencies
): boolean {
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

function emitPreparedRegExpTestExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CScalarExpressionDependencies
): PreparedExpression | null {
  if (
    expression.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.property !== 'test' ||
    expression.args.length !== 1
  ) {
    return null
  }

  const literal = resolveRegExpLiteralExpression(expression.callee.object, context)

  if (literal === null || typeof literal === 'undefined') {
    pushDiagnostic(
      context,
      diagnostic(
        'INOX_C_REGEXP_EXPR',
        'regular expression value is not supported by the current C backend slice',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: '0'
    }
  }

  const value = deps.emitPreparedCppStringArgument(expression.args[0], context, 'inox_regexp_value')
  const lines: string[] = []

  if (value === null || typeof value === 'undefined') {
    return {
      lines: [],
      expression: '0'
    }
  }

  appendLines(lines, value.lines)

  return {
    lines,
    expression: `${emitPreparedRegExpExpression(expression.callee.object, literal, context, deps)}.test(${value.expression})`
  }
}

function emitPreparedRegExpExpression(
  expression: CValueNode,
  literal: CValueNode,
  context: CFunctionContext,
  deps: CScalarExpressionDependencies
): string {
  if (
    expression.type === 'Reference' &&
    expression.path.length === 1 &&
    context.regexpLiterals.has(expression.path[0])
  ) {
    return deps.emitReference(expression, context)
  }

  return `RegExp(${cStringLiteral(literal.pattern)}, ${emitCRegExpFlags(literal.flags)})`
}

function resolveRegExpLiteralExpression(expression: CValueNode, context: CFunctionContext): CValueNode | null {
  if (expression.type === 'RegExpLiteral') {
    return expression
  }

  if (expression.type === 'Reference' && expression.path.length === 1) {
    const literal = context.regexpLiterals.get(expression.path[0])

    if (literal !== null && typeof literal !== 'undefined') {
      return literal
    }
  }

  return null
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

function emitPreparedFetchResponseScalarMemberExpression(
  expression: CValueNode,
  context: CFunctionContext
): PreparedExpression | null {
  if (expression.type !== 'MemberExpression' || expression.object.type !== 'Reference') {
    return null
  }

  if (expression.object.path.length !== 1) {
    return null
  }

  const objectName = expression.object.path[0]

  if (context.objectDeclaredTypes.get(objectName) !== 'fetch.Response') {
    return null
  }

  const reference = emitCIdentifier(objectName)

  if (expression.property === 'status') {
    return {
      lines: [],
      expression: `${reference}.status()`
    }
  }

  if (expression.property === 'ok') {
    return {
      lines: [],
      expression: `(${reference}.ok() ? 1 : 0)`
    }
  }

  if (expression.property === 'redirected') {
    return {
      lines: [],
      expression: `(${reference}.redirected() ? 1 : 0)`
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

  const previous = nextCName(context, 'inox_update_previous')

  return {
    lines: [`double ${previous} = ${reference};`, `${reference}${operator};`],
    expression: previous
  }
}

function emitPreparedRuntimeNumberValue(
  valueType: string,
  value: string,
  getLines: string[],
  context: CFunctionContext
): PreparedExpression {
  registerOwnedValue(context, value)
  const lines: string[] = []

  appendLines(lines, emitPrepareOwnedValueWrite(value))
  appendLines(lines, getLines)

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
  emitCObjectLiteralValueExpression(
    expression: CValueNode,
    context: CFunctionContext,
    shape?: CObjectShape | null
  ): PreparedExpression
  emitCValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitCOptionalIndexValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitCOptionalMemberValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitCStringConcatValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitCStringConversionValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitCNumberToStringValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitCStringCaseValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitCStringIndexValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitCStringPadStartValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitCStringSliceValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitCStringSplitValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitCStringTrimValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitCTemplateLiteralValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitOptionalRuntimeCallbackCallValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitPreparedArrayLengthExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedArrayPopCallExpression(
    expression: CValueNode,
    context: CFunctionContext,
    options: PreparedCallOptions | null
  ): PreparedExpression | null
  emitPreparedArrayReduceCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedArrayJoinCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedArraySliceCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedBinaryValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitPreparedChildProcessCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedClassMethodCallExpression(
    expression: CValueNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ): PreparedExpression | null
  emitPreparedCollectionCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedCollectionConstructorValueExpression(
    expression: CValueNode,
    context: CFunctionContext
  ): PreparedExpression | null
  emitPreparedCollectionSizeExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedCryptoCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedDebugMemoryCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedFetchHeadersCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedFsSyncValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedJsonCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedKnownArrayIndexValueExpression(
    expression: CValueNode,
    context: CFunctionContext
  ): PreparedExpression | null
  emitPreparedKnownObjectIndexValueExpression(
    expression: CValueNode,
    context: CFunctionContext
  ): PreparedExpression | null
  emitPreparedKnownObjectMemberValueExpression(
    expression: CValueNode,
    context: CFunctionContext
  ): PreparedExpression | null
  emitPreparedMapIndexGetExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedNullableScalarRuntimeValueExpression(
    expression: CValueNode,
    context: CFunctionContext
  ): PreparedExpression
  emitPreparedObjectValuesCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedObjectRuntimeArrayIndexValueExpression(
    expression: CValueNode,
    context: CFunctionContext
  ): PreparedExpression | null
  emitPreparedDynamicObjectIndexValueExpression(
    expression: CValueNode,
    context: CFunctionContext
  ): PreparedExpression | null
  emitPreparedDynamicObjectMemberValueExpression(
    expression: CValueNode,
    context: CFunctionContext
  ): PreparedExpression | null
  emitPreparedNumberExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitPreparedObjectExpressionIndexValueExpression(
    expression: CValueNode,
    context: CFunctionContext
  ): PreparedExpression | null
  emitPreparedObjectExpressionMemberValueExpression(
    expression: CValueNode,
    context: CFunctionContext
  ): PreparedExpression | null
  emitPreparedCompilerLibraryExpression(expression: CValueNode): PreparedExpression | null
  emitPreparedPathConstantExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedPathObjectCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedPathStringCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedProcessStringExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedProcessValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedRuntimeArrayIndexValueExpression(
    expression: CValueNode,
    context: CFunctionContext
  ): PreparedExpression | null
  emitPreparedRuntimeArrayIndexValue(
    expression: CValueNode,
    element: CRuntimeArrayElement,
    context: CFunctionContext,
    tempPrefix: string
  ): PreparedExpression
  emitPreparedUrlObjectExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedUrlSearchParamsCallExpression(
    expression: CValueNode,
    context: CFunctionContext
  ): PreparedExpression | null
  emitPreparedUrlSearchParamsObjectExpression(
    expression: CValueNode,
    context: CFunctionContext
  ): PreparedExpression | null
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
  isNumberToStringCall(expression: CValueNode, context: CFunctionContext): boolean
  isStringCaseCall(expression: CValueNode, context: CFunctionContext): boolean
  isStringConversionCall(expression: CValueNode, context: CFunctionContext): boolean
  isStringPadStartCall(expression: CValueNode, context: CFunctionContext): boolean
  isStringSliceCall(expression: CValueNode, context: CFunctionContext): boolean
  isStringSplitCall(expression: CValueNode, context: CFunctionContext): boolean
  isStringTrimCall(expression: CValueNode, context: CFunctionContext): boolean
  resolveRuntimeArrayIndex(expression: CValueNode, context: CFunctionContext): CRuntimeArrayElement | null
}

export function emitCValueExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CValueExpressionDependencies
): PreparedExpression {
  if (isCoalesceExpression(expression)) {
    return deps.emitCNullishCoalescingValueExpression(expression, context)
  }

  if (expression.type === 'ConditionalExpression') {
    return emitCConditionalValueExpression(expression, context, deps)
  }

  if (expression.type === 'AwaitExpression') {
    return deps.emitCAwaitValueExpression(expression, context)
  }

  const childProcessCall = deps.emitPreparedChildProcessCallExpression(expression, context)

  if (childProcessCall !== null && typeof childProcessCall !== 'undefined') {
    return childProcessCall
  }

  const libraryExpression = deps.emitPreparedCompilerLibraryExpression(expression)

  if (libraryExpression !== null) {
    return libraryExpression
  }

  const processString = deps.emitPreparedProcessStringExpression(expression, context)

  if (processString !== null && typeof processString !== 'undefined') {
    return processString
  }

  const processValue = deps.emitPreparedProcessValueExpression(expression, context)

  if (processValue !== null && typeof processValue !== 'undefined') {
    return processValue
  }

  const urlStringCall = deps.emitPreparedUrlStringCallExpression(expression, context)

  if (urlStringCall !== null && typeof urlStringCall !== 'undefined') {
    return urlStringCall
  }

  const urlObject = deps.emitPreparedUrlObjectExpression(expression, context)

  if (urlObject !== null && typeof urlObject !== 'undefined') {
    return urlObject
  }

  const urlSearchParamsObject = deps.emitPreparedUrlSearchParamsObjectExpression(expression, context)

  if (urlSearchParamsObject !== null && typeof urlSearchParamsObject !== 'undefined') {
    return urlSearchParamsObject
  }

  const pathConstant = deps.emitPreparedPathConstantExpression(expression, context)

  if (pathConstant !== null && typeof pathConstant !== 'undefined') {
    return pathConstant
  }

  const pathObject = deps.emitPreparedPathObjectCallExpression(expression, context)

  if (pathObject !== null && typeof pathObject !== 'undefined') {
    return pathObject
  }

  const pathCall = deps.emitPreparedPathStringCallExpression(expression, context)

  if (pathCall !== null && typeof pathCall !== 'undefined') {
    return pathCall
  }

  const fsSyncValue = deps.emitPreparedFsSyncValueExpression(expression, context)

  if (fsSyncValue !== null && typeof fsSyncValue !== 'undefined') {
    return fsSyncValue
  }

  const fetchHeadersCall = deps.emitPreparedFetchHeadersCallExpression(expression, context)

  if (fetchHeadersCall !== null && typeof fetchHeadersCall !== 'undefined') {
    return fetchHeadersCall
  }

  const urlSearchParamsCall = deps.emitPreparedUrlSearchParamsCallExpression(expression, context)

  if (urlSearchParamsCall !== null && typeof urlSearchParamsCall !== 'undefined') {
    return urlSearchParamsCall
  }

  const jsonCall = deps.emitPreparedJsonCallExpression(expression, context)

  if (jsonCall !== null && typeof jsonCall !== 'undefined') {
    return jsonCall
  }

  const debugMemoryCall = deps.emitPreparedDebugMemoryCallExpression(expression, context)

  if (debugMemoryCall !== null && typeof debugMemoryCall !== 'undefined') {
    return debugMemoryCall
  }

  const cryptoCall = deps.emitPreparedCryptoCallExpression(expression, context)

  if (cryptoCall !== null && typeof cryptoCall !== 'undefined') {
    return cryptoCall
  }

  const binaryValue = deps.emitPreparedBinaryValueExpression(expression, context)

  if (binaryValue !== null && typeof binaryValue !== 'undefined') {
    return binaryValue
  }

  const arrayPopCall = deps.emitPreparedArrayPopCallExpression(expression, context, null)

  if (arrayPopCall !== null && typeof arrayPopCall !== 'undefined') {
    return arrayPopCall
  }

  const arrayJoinCall = deps.emitPreparedArrayJoinCallExpression(expression, context)

  if (arrayJoinCall !== null && typeof arrayJoinCall !== 'undefined') {
    return arrayJoinCall
  }

  const arraySliceCall = deps.emitPreparedArraySliceCallExpression(expression, context)

  if (arraySliceCall !== null && typeof arraySliceCall !== 'undefined') {
    return arraySliceCall
  }

  const mapIndexGet = deps.emitPreparedMapIndexGetExpression(expression, context)

  if (mapIndexGet !== null && typeof mapIndexGet !== 'undefined') {
    return mapIndexGet
  }

  const collectionConstructor = deps.emitPreparedCollectionConstructorValueExpression(expression, context)

  if (collectionConstructor !== null && typeof collectionConstructor !== 'undefined') {
    return collectionConstructor
  }

  const collectionSize = deps.emitPreparedCollectionSizeExpression(expression, context)

  if (collectionSize !== null && typeof collectionSize !== 'undefined') {
    return {
      lines: collectionSize.lines,
      expression: `inox_number_value(${collectionSize.expression})`
    }
  }

  if (expression.type === 'MemberExpression' && expression.property === 'length') {
    let arrayLength: PreparedExpression | null = null
    arrayLength = deps.emitPreparedArrayLengthExpression(expression, context)

    if (arrayLength !== null && typeof arrayLength !== 'undefined') {
      return {
        lines: arrayLength.lines,
        expression: `inox_number_value(${arrayLength.expression})`
      }
    }
  }

  const objectValuesCall = deps.emitPreparedObjectValuesCallExpression(expression, context)

  if (objectValuesCall !== null && typeof objectValuesCall !== 'undefined') {
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

  if (numberConversion !== null && typeof numberConversion !== 'undefined') {
    return numberConversion
  }

  if (deps.isNullableScalarRuntimeExpression(expression, context)) {
    return deps.emitPreparedNullableScalarRuntimeValueExpression(expression, context)
  }

  if (deps.isStringConversionCall(expression, context)) {
    return deps.emitCStringConversionValueExpression(expression, context)
  }

  if (deps.isNumberToStringCall(expression, context)) {
    return deps.emitCNumberToStringValueExpression(expression, context)
  }

  if (deps.isStringCaseCall(expression, context)) {
    return deps.emitCStringCaseValueExpression(expression, context)
  }

  if (deps.isStringPadStartCall(expression, context)) {
    return deps.emitCStringPadStartValueExpression(expression, context)
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

  if (stringIndex !== null && typeof stringIndex !== 'undefined') {
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
    return {
      lines: [],
      expression: `inox::String(${cStringLiteral(expression.value)}, ${utf8ByteLength(expression.value)})`,
      cppType: 'inox::String',
      runtimeTypeChecked: true,
      valueType: 'string'
    }
  }

  if (expression.type === 'NumberLiteral') {
    return {
      lines: [],
      expression: `inox_number_value(${expression.value})`
    }
  }

  if (expression.type === 'BooleanLiteral') {
    return {
      lines: [],
      expression: `inox_bool_value(${runtimeBoolValueExpression(expression.value)})`
    }
  }

  if (expression.type === 'NullLiteral') {
    return {
      lines: [],
      expression: 'inox_null_value()'
    }
  }

  if (expression.type === 'Reference') {
    const name = joinStrings(expression.path, '_')
    const reference = emitCIdentifier(name)
    let valueType = context.variables.get(name) ?? ''
    let moduleValueName = ''

    if (!(expression.path.length === 1 && context.localValueNames.has(name))) {
      const resolvedModuleValueName = context.moduleValueNames.get(name)

      if (resolvedModuleValueName !== null && typeof resolvedModuleValueName !== 'undefined') {
        moduleValueName = resolvedModuleValueName
      }
    }

    if (valueType === '' && (context.runtimeArrayElementTypes.has(name) || context.arrayShapes.has(name))) {
      valueType = 'array'
    }

    if (moduleValueName !== '') {
      const nativeClassValueType = nativeClassReferenceValueType(name, context)

      if (nativeClassValueType !== null) {
        return {
          lines: [],
          expression: moduleValueName,
          valueType: nativeClassValueType
        }
      }

      const moduleValueType = context.moduleValueTypes.get(name)

      if (moduleValueType === 'url.URL') {
        return {
          lines: [],
          expression: moduleValueName,
          cppType: 'URL',
          valueType: 'object'
        }
      }

      if (moduleValueType === 'url.URLSearchParams') {
        return {
          lines: [],
          expression: moduleValueName,
          cppType: 'URLSearchParams',
          valueType: 'object'
        }
      }

      if (moduleValueType === 'string') {
        return {
          lines: [],
          expression: `inox::String(${moduleValueName})`,
          cppType: 'inox::String',
          runtimeTypeChecked: true,
          valueType: 'string'
        }
      }

      return {
        lines: [],
        expression: moduleValueName
      }
    }

    if (valueType.startsWith('class:')) {
      return {
        lines: [],
        expression: reference,
        valueType
      }
    }

    const cppValueType = context.cppValueTypes.get(name)

    if (cppValueType !== null && typeof cppValueType !== 'undefined') {
      return {
        lines: [],
        expression: reference,
        cppType: cppValueType,
        valueType
      }
    }

    const nativeClassValueType = nativeClassReferenceValueType(name, context)

    if (nativeClassValueType !== null) {
      return {
        lines: [],
        expression: reference,
        valueType: nativeClassValueType
      }
    }

    if (context.nullableVariables.has(name)) {
      return {
        lines: [],
        expression: reference
      }
    }

    if (deps.isBoxedRuntimeValueName(name, context)) {
      let tag = 'INOX_TAG_OBJECT'

      if (valueType === 'string') {
        tag = 'INOX_TAG_STRING'
      }

      return {
        lines: [emitRuntimeTypeCheck(`(*${reference}).tag != ${tag} || (*${reference}).as.ref == 0`, context)],
        expression: `(*${reference})`
      }
    }

    if (valueType === 'string' && context.runtimeStrings.has(name)) {
      const runtimeValue = context.runtimeStringValues.get(name)

      if (runtimeValue !== null && typeof runtimeValue !== 'undefined') {
        return {
          lines: [],
          expression: runtimeValue
        }
      }

      const temp = nextCName(context, 'inox_value')

      return {
        lines: [
          `inox_value ${temp};`,
          `${temp}.tag = INOX_TAG_STRING;`,
          `${temp}.as.ref = (inox_ref*)&${reference}->header;`
        ],
        expression: temp
      }
    }

    if (valueType === 'string' && context.cppStringValues.has(name)) {
      return {
        lines: [],
        expression: reference,
        cppType: 'inox::String',
        runtimeTypeChecked: true,
        valueType: 'string'
      }
    }

    if (valueType === 'url.URL') {
      return {
        lines: [],
        expression: reference,
        cppType: 'URL',
        valueType: 'object'
      }
    }

    if (valueType === 'url.URLSearchParams') {
      return {
        lines: [],
        expression: reference,
        cppType: 'URLSearchParams',
        valueType: 'object'
      }
    }

    if (valueType === 'string') {
      return {
        lines: [],
        expression: `inox::String(${reference})`,
        cppType: 'inox::String',
        runtimeTypeChecked: true,
        valueType: 'string'
      }
    }

    if (valueType === 'bytes' || valueType === 'object' || valueType === 'array') {
      return {
        lines: [],
        expression: reference
      }
    }

    if (valueType === 'map' || valueType === 'set') {
      return {
        lines: [],
        expression: reference
      }
    }

    if (valueType === 'unknown' || isOpaqueRuntimeValueType(valueType)) {
      return {
        lines: [],
        expression: reference
      }
    }

    if (valueType === 'number') {
      return {
        lines: [],
        expression: `inox_number_value(${reference})`
      }
    }

    if (valueType === 'boolean') {
      return {
        lines: [],
        expression: `inox_bool_value(${reference})`
      }
    }
  }

  if (expression.type === 'ThisExpression') {
    return {
      lines: [],
      expression: emitCIdentifier('this')
    }
  }

  if (expression.type === 'OptionalMemberExpression') {
    return deps.emitCOptionalMemberValueExpression(expression, context)
  }

  if (expression.type === 'OptionalIndexExpression') {
    return deps.emitCOptionalIndexValueExpression(expression, context)
  }

  if (deps.isMemberAccessExpression(expression)) {
    const nativeClassField = emitPreparedNativeClassFieldValueExpression(expression, context)

    if (nativeClassField !== null && typeof nativeClassField !== 'undefined') {
      return nativeClassField
    }

    const memberValue = deps.emitPreparedKnownObjectMemberValueExpression(expression, context)

    if (memberValue !== null && typeof memberValue !== 'undefined') {
      return memberValue
    }

    const objectMemberValue = deps.emitPreparedObjectExpressionMemberValueExpression(expression, context)

    if (objectMemberValue !== null && typeof objectMemberValue !== 'undefined') {
      return objectMemberValue
    }

    const dynamicMemberValue = deps.emitPreparedDynamicObjectMemberValueExpression(expression, context)

    if (dynamicMemberValue !== null && typeof dynamicMemberValue !== 'undefined') {
      return dynamicMemberValue
    }

    const dynamicRuntimeMemberValue = emitPreparedDynamicRuntimeObjectFieldValueExpression(expression, context, deps)

    if (dynamicRuntimeMemberValue !== null && typeof dynamicRuntimeMemberValue !== 'undefined') {
      return dynamicRuntimeMemberValue
    }
  }

  if (deps.isIndexAccessExpression(expression)) {
    const arrayValue = deps.emitPreparedKnownArrayIndexValueExpression(expression, context)

    if (arrayValue !== null && typeof arrayValue !== 'undefined') {
      return arrayValue
    }

    const objectRuntimeArrayValue = deps.emitPreparedObjectRuntimeArrayIndexValueExpression(expression, context)

    if (objectRuntimeArrayValue !== null && typeof objectRuntimeArrayValue !== 'undefined') {
      return objectRuntimeArrayValue
    }

    const runtimeArrayValue = deps.emitPreparedRuntimeArrayIndexValueExpression(expression, context)

    if (runtimeArrayValue !== null && typeof runtimeArrayValue !== 'undefined') {
      return runtimeArrayValue
    }

    const dynamicArrayValue = emitPreparedDynamicObjectArrayIndexValueExpression(expression, context, deps)

    if (dynamicArrayValue !== null && typeof dynamicArrayValue !== 'undefined') {
      return dynamicArrayValue
    }

    const objectValue = deps.emitPreparedKnownObjectIndexValueExpression(expression, context)

    if (objectValue !== null && typeof objectValue !== 'undefined') {
      return objectValue
    }

    const objectExpressionValue = deps.emitPreparedObjectExpressionIndexValueExpression(expression, context)

    if (objectExpressionValue !== null && typeof objectExpressionValue !== 'undefined') {
      return objectExpressionValue
    }

    const dynamicObjectValue = deps.emitPreparedDynamicObjectIndexValueExpression(expression, context)

    if (dynamicObjectValue !== null && typeof dynamicObjectValue !== 'undefined') {
      return dynamicObjectValue
    }

    const dynamicRuntimeIndexValue = emitPreparedDynamicRuntimeObjectFieldValueExpression(expression, context, deps)

    if (dynamicRuntimeIndexValue !== null && typeof dynamicRuntimeIndexValue !== 'undefined') {
      return dynamicRuntimeIndexValue
    }
  }

  const scalarValue = emitPreparedScalarRuntimeValueExpression(expression, context, deps)

  if (scalarValue !== null && typeof scalarValue !== 'undefined') {
    return scalarValue
  }

  if (expression.type === 'CallExpression') {
    const arrayReduceCall = deps.emitPreparedArrayReduceCallExpression(expression, context)

    if (arrayReduceCall !== null && typeof arrayReduceCall !== 'undefined') {
      return {
        lines: arrayReduceCall.lines,
        expression: `inox_number_value(${arrayReduceCall.expression})`
      }
    }

    const valueType = deps.inferExpressionType(expression, context)

    if (
      valueType !== 'unknown' &&
      valueType !== 'promise' &&
      !isManagedRuntimeReturnType(valueType) &&
      !isOpaqueRuntimeValueType(valueType)
    ) {
      return emitUnsupportedCValueExpression(expression, context, deps)
    }

    const collectionCall = deps.emitPreparedCollectionCallExpression(expression, context)

    if (collectionCall !== null && typeof collectionCall !== 'undefined') {
      return collectionCall
    }

    const classMethodCall = deps.emitPreparedClassMethodCallExpression(expression, context, {})

    if (classMethodCall !== null && typeof classMethodCall !== 'undefined') {
      return classMethodCall
    }

    const temp = nextCName(context, 'inox_value')
    const tag = cRuntimeValueTag(valueType)
    registerOwnedValue(context, temp)
    const call = deps.emitPreparedCallExpression(expression, context)
    const lines: string[] = []

    appendLines(lines, call.lines)
    appendLines(lines, emitPrepareOwnedValueWrite(temp))
    lines.push(`${temp} = ${call.expression};`)

    if (isOwnedRuntimeValueName(call.expression, context)) {
      lines.push(`inox_retain(${temp});`)
    }

    if (callExpressionReturnsNullableRuntimeValue(expression, valueType, context)) {
      appendLines(lines, emitRuntimeNullableValueCheck(temp, tag, context))
    } else {
      lines.push(emitRuntimeValueCheck(temp, tag, context))
    }

    return {
      lines,
      expression: temp
    }
  }

  return emitUnsupportedCValueExpression(expression, context, deps)
}

function callExpressionReturnsNullableRuntimeValue(
  expression: CValueNode,
  valueType: string,
  context: CFunctionContext
): boolean {
  if (!isRuntimeNullableType(valueType)) {
    return false
  }

  if (expression.nullable === true) {
    return true
  }

  if (expression.callee.type !== 'Reference' || expression.callee.path.length !== 1) {
    const resolved = resolveObjectFunctionField(expression.callee, context)

    if (resolved === null || typeof resolved === 'undefined') {
      return false
    }

    const functionType = resolved.field.functionType

    return functionType !== null && typeof functionType !== 'undefined' && functionType.returnNullable === true
  }

  const path = expression.callee.path
  const name: string = path[0]

  return context.functionReturnNullables.get(name) === true
}

function emitUnsupportedCValueExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CValueExpressionDependencies
): PreparedExpression {
  const unsupportedType = deps.inferExpressionType(expression, context)
  let unsupportedMessage = 'this object field expression is not supported by the current C backend slice'

  if (unsupportedType === 'function') {
    unsupportedMessage =
      'stored callback values need delayed closure lifetime support and are not supported by the current C backend slice'
  }

  context.diagnostics.push(
    diagnostic(cUnsupportedExpressionCode(unsupportedType), unsupportedMessage, expressionLocation(expression))
  )

  return {
    lines: [],
    expression: 'inox_undefined_value()'
  }
}

function emitCConditionalValueExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CValueExpressionDependencies
): PreparedExpression {
  const test = deps.emitPreparedNumberExpression(expression.test, context)
  const consequent = emitCConditionalBranchValueExpression(expression.consequent, expression, context, deps)
  const alternate = emitCConditionalBranchValueExpression(expression.alternate, expression, context, deps)
  const temp = nextCName(context, 'inox_conditional_value')
  const valueType = deps.inferExpressionType(expression, context)
  const tag = cRuntimeValueTag(valueType)
  const lines: string[] = []

  registerOwnedValue(context, temp)
  appendLines(lines, test.lines)
  lines.push(`if ${emitCConditionClause(test.expression)} {`)
  appendPrefixedLines(lines, consequent.lines, '  ')
  appendPrefixedLines(lines, emitPrepareOwnedValueWrite(temp), '  ')
  lines.push(`  ${temp} = ${consequent.expression};`)
  appendPrefixedLines(lines, retainConditionalBranchValueExpression(consequent.expression, context), '  ')
  lines.push('} else {')
  appendPrefixedLines(lines, alternate.lines, '  ')
  appendPrefixedLines(lines, emitPrepareOwnedValueWrite(temp), '  ')
  lines.push(`  ${temp} = ${alternate.expression};`)
  appendPrefixedLines(lines, retainConditionalBranchValueExpression(alternate.expression, context), '  ')
  lines.push('}')

  if (expression.nullable === true) {
    appendLines(lines, emitRuntimeNullableValueCheck(temp, tag, context))
  } else {
    const check = emitRuntimeValueCheck(temp, tag, context)

    if (check.length > 0) {
      lines.push(check)
    }
  }

  return {
    lines,
    expression: temp
  }
}

function emitCConditionalBranchValueExpression(
  branch: CValueNode,
  expression: CValueNode,
  context: CFunctionContext,
  deps: CValueExpressionDependencies
): PreparedExpression {
  if (branch.type === 'ObjectLiteral') {
    return deps.emitCObjectLiteralValueExpression(branch, context, expression.shape)
  }

  return deps.emitCValueExpression(branch, context)
}

function nativeClassReferenceValueType(name: string, context: CFunctionContext): string | null {
  const registeredClassName = context.classInstanceTypes.get(name)

  if (registeredClassName === null || typeof registeredClassName === 'undefined') {
    return null
  }

  const info = context.classInfos.get(registeredClassName)

  if (info === null || typeof info === 'undefined' || !info.native) {
    return null
  }

  return cClassValueTypeName(registeredClassName)
}

function retainConditionalBranchValueExpression(expression: string, context: CFunctionContext): string[] {
  if (isOwnedRuntimeValueName(expression, context)) {
    return [`inox_retain(${expression});`]
  }

  return []
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
    const part = expression[index]

    if (part === '(') {
      depth = depth + 1
    } else if (part === ')') {
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
