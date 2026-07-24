import { diagnostic } from '../../../diagnostics.ts'
import type { AnyNode, Diagnostic, SourceLocation } from '../../../types.ts'
import {
  collectFunctionPointerReturnCompanionInfos,
  emitFunctionPointerParams,
  emitFunctionPointerReturnType,
  isPlainObjectFunctionField,
  isPlainFunctionPointerType,
  isRuntimeFunctionType
} from '../async/callbacks.ts'
import type { AsyncTaskLoweringDependencies } from '../async/tasks.ts'
import type { CEmitContextWithDependencies, CFunctionContextWithDependencies } from '../context.ts'
import {
  cloneCStringSet,
  emitFailureStatement,
  emitPrepareOwnedValueWrite,
  emitRuntimeTypeCheck,
  emitStatusCheck,
  nextCName,
  registerEventLoop,
  registerOwnedValue
} from '../context.ts'
import { reportCJsGlobalDiagnostic } from '../diagnostics.ts'
import { isCJsGlobalRoot, usesCJsGlobal } from '../globals.ts'
import { cStringLiteral, emitCIdentifier, emitCObjectFunctionFieldName, utf8ByteLength } from '../identifiers.ts'
import {
  emitPreparedCompilerLibraryNativeFieldExpression,
  isCompilerLibraryNativeFieldExpression
} from '../library-operations.ts'
import {
  emitRuntimeNullableValueCheck,
  emitRuntimeValueCheck
} from '../runtime-values.ts'
import { runtimeTypeAlternativeValidExpressions } from '../runtime-type-alternatives.ts'
import {
  cUnsupportedExpressionCode,
  emitCOperator,
  isCoalesceExpression,
  isOptionalChainExpression
} from '../syntax.ts'
import type {
  CFunctionParam,
  CFunctionType,
  CKnownObjectField,
  CKnownObjectIndexField,
  CObjectAccessorReturnPath,
  CObjectShape,
  CObjectShapeField,
  CPreparedCallArgs as PreparedCallArgs,
  CPreparedCallOptions as PreparedCallOptions,
  CPreparedFunctionCompanion,
  CPreparedExpression as PreparedExpression,
  CPreparedStringBytesOperand as PreparedStringBytesOperand,
  CRuntimeTypeAlternative
} from '../types.ts'
import { cFunctionTypeValue } from '../types.ts'
import {
  applyLibraryNativeValueAdapter,
  cRuntimeValueTag,
  compilerLibraryNativeRuntimeValueExpressionForTypeRef,
  compilerLibraryNativeRuntimeValueValidExpressionForTypeRef,
  isManagedRuntimeReturnType,
  isBoxedScalarParam,
  isNullableScalarType,
  isOpaqueRuntimeValueType,
  isRuntimeNullableType,
  libraryNativeBoundaryCppType,
  libraryNativeCppType,
  libraryNativeValueAdapter
} from '../value-types.ts'
import {
  cClassValueTypeName,
  emitPreparedClassInstanceRefValueExpression,
  emitPreparedNativeClassFieldScalarExpression,
  emitPreparedNativeClassFieldValueExpression
} from './classes.ts'
import type { ClassLoweringDependencies } from './classes.ts'
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

type CObjectAccessorReturnPathMap = Map<string, CObjectAccessorReturnPath>
type CStringMap = Map<string, string>
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
  companionPath: string[]
  expression: CValueNode | null
  functionCompanions: CPreparedFunctionCompanion[]
  loc?: SourceLocation
  pathName: string | null
  shape: CObjectShape | null
  shapeKnown: boolean
}

type RuntimeObjectFunctionCallee = {
  fieldIndex: number
  functionType: CFunctionType
  name: string
  objectName: string
}

type ObjectFunctionFieldResolution = {
  field: CObjectShapeField
  fieldName: string
  objectName: string
}

type CDynamicObjectValueDependencies = {
  emitCValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  inferExpressionType(expression: CValueNode, context: CFunctionContext): string
}

type CDynamicObjectFieldAccessDependencies = {
  inferExpressionType(expression: CValueNode, context: CFunctionContext): string
}

type CDynamicObjectFieldAccess = {
  object: CValueNode
  key: string
}

type CEmitContext = CEmitContextWithDependencies<
  AsyncTaskLoweringDependencies,
  ClassLoweringDependencies,
  NullableLoweringDependencies,
  StatementLoweringDependencies,
  StringLoweringDependencies
>
type CFunctionContext = CFunctionContextWithDependencies<
  AsyncTaskLoweringDependencies,
  ClassLoweringDependencies,
  NullableLoweringDependencies,
  StatementLoweringDependencies,
  StringLoweringDependencies
>

function cBooleanValueIsTrue(value: boolean | null | undefined): boolean {
  if (value === null || typeof value === 'undefined') {
    return false
  }

  if (value) {
    return true
  }

  return false
}

function cValueChild(value: CValueNode | null | undefined): CValueNode | null {
  if (value === null || typeof value === 'undefined') {
    return null
  }

  return value
}

type NullableScalarNarrowingSnapshot = {
  active: boolean
  narrowedNullableScalars: CStringSet
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
  return isEqualityOperator(operator) || operator === '<' || operator === '<=' || operator === '>' || operator === '>='
}

function isPositiveEqualityOperator(operator: string): boolean {
  return operator === '==='
}

function isTypedStringValueExpression(expression: CValueNode): boolean {
  if (expression.valueType !== 'string') {
    return false
  }

  if (expression.type === 'Reference' || expression.type === 'StringLiteral' || expression.type === 'TemplateLiteral') {
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

function isRuntimeReferenceEqualityType(valueType: string): boolean {
  return (
    valueType === 'object' ||
    valueType === 'bytes'
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
  return valueType === 'function'
}

function typeofRuntimeValueTagCheck(value: string, typeName: string): string | null {
  if (typeName === 'undefined') {
    return `${value}.tag == INOX_TAG_UNDEFINED`
  }

  if (typeName === 'object') {
    return (
      `(${value}.tag == INOX_TAG_NULL || ` +
      `(inox_is_ref_value(${value}) && ${value}.tag != INOX_TAG_STRING && ${value}.tag != INOX_TAG_FUNCTION))`
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

    if (
      context.runtimeValueStorageNames.has(name) ||
      context.boxedVariables.has(name) ||
      context.nullableVariables.has(name)
    ) {
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

function objectFunctionArgumentSource(
  expression: CValueNode,
  context: CFunctionContext,
  functionCompanions: CPreparedFunctionCompanion[] = []
): ObjectFunctionArgumentSource {
  const pathName = objectExpressionPathName(expression, context)

  return {
    companionPath: [],
    expression,
    functionCompanions,
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
      companionPath: objectFunctionCompanionPath(source.companionPath, fieldName),
      expression,
      functionCompanions: source.functionCompanions,
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
    companionPath: objectFunctionCompanionPath(source.companionPath, fieldName),
    expression: null,
    functionCompanions: source.functionCompanions,
    loc: source.loc,
    pathName: nestedObjectPathName(source.pathName, fieldName),
    shape,
    shapeKnown
  }
}

function objectFunctionCompanionPath(path: string[], fieldName: string): string[] {
  const result: string[] = []

  for (const segment of path) {
    result.push(segment)
  }

  result.push(fieldName)
  return result
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
    const moduleFields = context.moduleObjectShapes.get(pathName)

    if (moduleFields !== null && typeof moduleFields !== 'undefined') {
      return { fields: moduleFields }
    }

    const fields = context.objectShapes.get(pathName)

    if (fields !== null && typeof fields !== 'undefined') {
      return { fields }
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

function appendDefaultObjectFunctionFieldArgument(
  args: string[],
  field: CObjectShapeField,
  seenTypes: string[]
): void {
  if (isRuntimeObjectFunctionField(field, seenTypes)) {
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

  const companion = objectFunctionCompanionAt(
    source.functionCompanions,
    objectFunctionCompanionPath(source.companionPath, field.name)
  )

  if (companion !== null && !isRuntimeObjectFunctionField(field, seenTypes)) {
    return {
      lines: [],
      expression: emitAdaptedFunctionPointerExpression(
        companion.expression,
        cFunctionTypeValue(companion.functionType),
        field.functionType,
        context,
        deps,
        seenTypes,
        companion.seenTypes
      )
    }
  }

  if (isRuntimeObjectFunctionField(field, seenTypes)) {
    if (literalValue !== null && typeof literalValue !== 'undefined') {
      return deps.emitRuntimeCallbackValue(literalValue, field.functionType, context)
    }

    const objectName = source.pathName

    if (objectName !== null && typeof objectName !== 'undefined') {
      const target = emitObjectFunctionFieldArgumentName(objectName, field.name, context)

      if (
        sourceField !== null &&
        typeof sourceField !== 'undefined' &&
        isPlainObjectFunctionField(sourceField) &&
        sourceField.functionType !== null &&
        typeof sourceField.functionType !== 'undefined' &&
        field.functionType !== null &&
        typeof field.functionType !== 'undefined'
      ) {
        const sourceSeenTypes = objectFunctionArgumentSourceSeenTypes(source, context, seenTypes)
        const bridgeFunctionType = runtimeCallbackBridgeFunctionType(field.functionType)
        const adaptedTarget = emitAdaptedFunctionPointerExpression(
          target,
          sourceField.functionType,
          bridgeFunctionType,
          context,
          deps,
          [],
          sourceSeenTypes
        )

        return deps.emitFunctionPointerRuntimeCallbackValue(
          adaptedTarget,
          bridgeFunctionType,
          [],
          context,
          source.loc
        )
      }

      return {
        lines: [],
        expression: target
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

function objectFunctionCompanionAt(
  companions: CPreparedFunctionCompanion[],
  path: string[]
): CPreparedFunctionCompanion | null {
  for (const companion of companions) {
    if (functionCompanionPathEquals(companion.path, path)) {
      return companion
    }
  }

  return null
}

function functionCompanionPathEquals(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false
  }

  for (let index = 0; index < left.length; index = index + 1) {
    if (left[index] !== right[index]) {
      return false
    }
  }

  return true
}

function runtimeCallbackBridgeFunctionType(functionType: CFunctionType): CFunctionType {
  const params: CFunctionParam[] = []

  for (const param of functionType.params) {
    params.push({
      className: param.className,
      declaredType: param.declaredType,
      defaultValue: param.defaultValue,
      functionTypeOwnership: param.functionTypeOwnership,
      functionType: param.functionType,
      loc: param.loc,
      name: param.name,
      nullable: param.nullable,
      optional: param.optional,
      ownership: param.ownership,
      asyncResultValueType: param.asyncResultValueType,
      rest: param.rest,
      shape: param.valueType === 'object' ? null : param.shape,
      typeRef: param.typeRef,
      valueType: param.valueType
    })
  }

  return {
    declaredReturnType: functionType.declaredReturnType,
    kind: functionType.kind,
    params,
    returnTypeRef: functionType.returnTypeRef,
    returnNullable: functionType.returnNullable,
    returnAsyncResultValueType: functionType.returnAsyncResultValueType,
    returnShape: functionType.returnShape,
    returnType: functionType.returnType
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
  calleeSeenTypes: string[],
  functionCompanions: CPreparedFunctionCompanion[] = []
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
    objectFunctionArgumentSource(expression, context, functionCompanions),
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
      if (!isSupportedObjectFunctionField(field, seenTypes)) {
        continue
      }

      if (source.shapeKnown && !objectFunctionFieldAt(source.shape?.fields, field.name)) {
        appendDefaultObjectFunctionFieldArgument(args, field, seenTypes)
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

export function emitObjectFunctionCompanionReference(
  rootName: string,
  path: string[],
  context: CFunctionContext
): string | null {
  if (path.length === 0) {
    return null
  }

  let objectName = context.objectAliases.get(rootName) ?? rootName

  for (let index = 0; index + 1 < path.length; index = index + 1) {
    objectName = `${objectName}_${path[index]}`
  }

  return emitObjectFunctionFieldArgumentName(objectName, path[path.length - 1], context)
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
      if (!isSupportedObjectFunctionField(field, seenTypes)) {
        continue
      }

      if (isRuntimeObjectFunctionField(field, seenTypes)) {
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

function isSupportedObjectFunctionField(field: CObjectShapeField, seenTypes: string[] = []): boolean {
  return isPlainObjectFunctionField(field, seenTypes) || isRuntimeFunctionType(field.functionType)
}

function isRuntimeObjectFunctionField(field: CObjectShapeField, seenTypes: string[] = []): boolean {
  return !isPlainObjectFunctionField(field, seenTypes) && isRuntimeFunctionType(field.functionType)
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

  const fieldIndex = runtimeClassFunctionFieldIndex(resolved, context)
  const seenTypes = objectFunctionCalleeArgumentSeenTypes(callee, context)

  if (fieldIndex === -1 && !isRuntimeObjectFunctionField(resolved.field, seenTypes)) {
    return null
  }

  if (fieldIndex !== -1 && !isRuntimeFunctionType(resolved.field.functionType)) {
    return null
  }

  return {
    fieldIndex,
    functionType: resolved.field.functionType,
    name: fieldIndex === -1 ? emitCObjectFunctionFieldName(resolved.objectName, resolved.fieldName) : '',
    objectName: fieldIndex === -1 ? '' : resolved.objectName
  }
}

function runtimeClassFunctionFieldIndex(resolved: ObjectFunctionFieldResolution, context: CFunctionContext): number {
  const className = context.classInstanceTypes.get(resolved.objectName)

  if (className === null || typeof className === 'undefined') {
    return -1
  }

  const info = context.classInfos.get(className)

  if (info === null || typeof info === 'undefined' || info.native) {
    return -1
  }

  for (let index = 0; index < info.fields.length; index = index + 1) {
    if (info.fields[index].name === resolved.fieldName) {
      return index
    }
  }

  return -1
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
    if (context.moduleObjectShapes.has(objectName)) {
      pushSeenDeclaredType(seenTypes, 'CFunctionContext')
    }

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
    value === 'CEmitContext' ||
    value === 'CFunctionContext' ||
    value === 'CDeclarationFunctionContext' ||
    value === 'CallbackEmitContext' ||
    value === 'CallbackFunctionContext' ||
    value === 'ClassFunctionContext' ||
    value === 'NullableFunctionContext' ||
    value === 'AsyncResultEmitContext' ||
    value === 'AsyncResultFunctionContext' ||
    value === 'StringCContext' ||
    value === 'AsyncTaskEmitContext' ||
    value === 'AsyncTaskFunctionContext' ||
    value === 'AsyncTaskPlannerContext'
  )
}

function isDependencyCarrierDeclaredType(value: string): boolean {
  return (
    value === 'CModuleEmissionDependencies' ||
    value === 'CDeclarationEmissionDependencies' ||
    value === 'AsyncTaskLoweringDependencies' ||
    value === 'CallbackLoweringDependencies' ||
    value === 'ClassLoweringDependencies' ||
    value === 'NullableLoweringDependencies' ||
    value === 'AsyncResultChainLoweringDependencies' ||
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
  let calleeName = callee.name

  if (callee.fieldIndex !== -1) {
    calleeName = nextCName(context, 'inox_callback')
    registerOwnedValue(context, calleeName)
    appendLines(lines, emitPrepareOwnedValueWrite(calleeName))
    lines.push(
      emitStatusCheck(
        `inox_object_get_known(${deps.emitObjectValueReference(callee.objectName, context)}, ${callee.fieldIndex}, &${calleeName})`,
        context
      )
    )
  }

  for (const arg of expression.args) {
    const value = deps.emitCValueExpression(arg, context)

    appendLines(lines, value.lines)
    args.push(value.expression)
  }

  const out = nextCName(context, 'inox_callback_out')
  registerOwnedValue(context, out)
  appendLines(lines, emitPrepareOwnedValueWrite(out))

  if (args.length === 0) {
    lines.push(emitStatusCheck(`inox_callback_call(${calleeName}, 0, 0, &${out})`, context))
  } else {
    const argArray = nextCName(context, 'inox_callback_args')

    lines.push(`inox_value ${argArray}[] = { ${joinStrings(args, ', ')} };`)
    lines.push(emitStatusCheck(`inox_callback_call(${calleeName}, ${argArray}, ${args.length}, &${out})`, context))
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
  emitCAwaitValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitCValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitObjectValueReference(name: string, context: CFunctionContext): string
  emitPreparedCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitPreparedClassMethodCallExpression(
    expression: CValueNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ): PreparedExpression | null
  emitNullableScalarValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
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
  emitPreparedCompilerLibraryCallExpression(
    expression: CValueNode,
    context: CFunctionContext
  ): PreparedExpression | null
  emitPreparedCompilerLibraryExpression(expression: CValueNode): PreparedExpression | null
  emitPreparedNumberExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
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
  emitReference(expression: CValueNode, context: CFunctionContext): string
  emitStringExpression(expression: CValueNode, context: CFunctionContext): string
  inferExpressionType(expression: CValueNode, context: CFunctionContext): string
  isIndexAccessExpression(expression: CValueNode): boolean
  isMemberAccessExpression(expression: CValueNode): boolean
  isNullableRuntimeExpression(expression: CValueNode, context: CFunctionContext): boolean
  isNullableScalarRuntimeExpression(expression: CValueNode, context: CFunctionContext): boolean
  reportCJsGlobalDiagnostic(diagnostics: Diagnostic[], loc: SourceLocation | undefined): void
  resolveKnownObjectIndex(expression: CValueNode, context: CFunctionContext): CKnownObjectIndexField | null
  resolveKnownObjectMember(expression: CValueNode, context: CFunctionContext): CKnownObjectField | null
}

export type CCallExpressionDependencies = {
  currentErrorTarget(errorTargets: string[]): string
  emitCExpression(expression: CValueNode, context: CFunctionContext): string
  emitCObjectLiteralValueExpression(
    expression: CValueNode,
    context: CFunctionContext,
    shape?: CObjectShape | null
  ): PreparedExpression
  emitCValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitObjectValueReference(name: string, context: CFunctionContext): string
  emitFunctionValueExpression(expression: CValueNode, context: CFunctionContext): string
  emitFunctionPointerAdapter(
    target: string,
    targetFunctionType: CFunctionType,
    functionType: CFunctionType,
    context: CFunctionContext,
    seenTypes: string[],
    targetSeenTypes: string[]
  ): string
  emitFunctionPointerRuntimeCallbackValue(
    target: string,
    functionType: CFunctionType,
    seenTypes: string[],
    context: CFunctionContext,
    loc: SourceLocation | null | undefined
  ): PreparedExpression
  emitNullableFunctionValueExpression(
    expression: CValueNode,
    functionType: CFunctionType | null | undefined,
    context: CFunctionContext
  ): PreparedExpression
  emitNullableScalarValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitPreparedCompilerLibraryCallExpression(
    expression: CValueNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ): PreparedExpression | null
  emitPreparedClassMethodCallExpression(
    expression: CValueNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ): PreparedExpression | null
  emitPreparedNumberExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitPreparedAsyncResultChainExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedAsyncResultStaticExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
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
  isAsyncResultReturningFunctionCallee(callee: CValueNode, context: CFunctionContext): boolean
  registerErrorChannel(context: CFunctionContext): void
  registerErrorValue(context: CFunctionContext): void
  resolveFunctionValueType(expression: CValueNode, context: CFunctionContext): CFunctionType | null
  resolveFunctionParams(callee: CValueNode, context: CFunctionContext): CFunctionParam[] | null
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
  const libraryCall = deps.emitPreparedCompilerLibraryCallExpression(expression, context)

  if (libraryCall !== null) {
    return libraryCall
  }

  const classMethodCall = deps.emitPreparedClassMethodCallExpression(expression, context, {})

  if (classMethodCall !== null && typeof classMethodCall !== 'undefined') {
    return classMethodCall
  }

  const asyncResult = deps.emitPreparedAsyncResultStaticExpression(expression, context)

  if (asyncResult !== null && typeof asyncResult !== 'undefined') {
    return asyncResult
  }

  const asyncResultMethod = deps.emitPreparedAsyncResultChainExpression(expression, context)

  if (asyncResultMethod !== null && typeof asyncResultMethod !== 'undefined') {
    return asyncResultMethod
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
  const returnFunctionCompanions = prepareCallReturnFunctionCompanions(expression, lines, context)

  if (isThrowingFunctionCallee(expression.callee, context)) {
    return withFunctionCallReturnMetadata(
      expression,
      emitPreparedThrowingCallExpression(
        expression,
        args,
        lines,
        returnFunctionCompanions,
        context,
        deps
      ),
      context
    )
  }

  appendCallReturnFunctionCompanionArgs(args, returnFunctionCompanions)

  if (deps.isAsyncResultReturningFunctionCallee(expression.callee, context)) {
    registerEventLoop(context)

    return withFunctionCallReturnMetadata(
      expression,
      {
        lines,
        expression: `${emitCallee(expression.callee, context)}(${joinStrings(args, ', ')})`,
        functionCompanions: returnFunctionCompanions
      },
      context
    )
  }

  if (deps.isExternalEventLoopFunctionCallee(expression.callee, context)) {
    registerEventLoop(context)

    return withFunctionCallReturnMetadata(
      expression,
      {
        lines,
        expression: `${emitCallee(expression.callee, context)}(${joinStrings(args, ', ')})`,
        functionCompanions: returnFunctionCompanions
      },
      context
    )
  }

  return withFunctionCallReturnMetadata(
    expression,
    {
      lines,
      expression: `${emitCallee(expression.callee, context)}(${joinStrings(args, ', ')})`,
      functionCompanions: returnFunctionCompanions
    },
    context
  )
}

function prepareCallReturnFunctionCompanions(
  expression: CValueNode,
  lines: string[],
  context: CFunctionContext
): CPreparedFunctionCompanion[] {
  const companions: CPreparedFunctionCompanion[] = []

  if (expression.callee.type !== 'Reference' || expression.callee.path.length !== 1) {
    return companions
  }

  const name = expression.callee.path[0]
  const returnType = context.functionReturnTypes.get(name)

  if (returnType === null || typeof returnType === 'undefined') {
    return companions
  }

  const infos = collectFunctionPointerReturnCompanionInfos({
    declaredReturnType: context.functionReturnDeclaredTypes.get(name) ?? null,
    kind: 'function',
    params: [],
    returnShape: context.functionReturnShapes.get(name),
    returnType
  })

  for (const info of infos) {
    if (info.runtimeFunction || info.functionType === null) {
      continue
    }

    const name = nextCName(context, 'inox_call_function')

    lines.push(
      `${emitFunctionPointerReturnType(info.functionType)} (*${name})(${emitFunctionPointerParams(
        info.functionType,
        [],
        info.seenTypes
      )}) = 0;`
    )
    companions.push({
      path: info.path,
      expression: name,
      functionType: info.functionType,
      seenTypes: info.seenTypes
    })
  }

  return companions
}

function appendCallReturnFunctionCompanionArgs(
  args: string[],
  companions: CPreparedFunctionCompanion[]
): void {
  for (const companion of companions) {
    args.push(`&${companion.expression}`)
  }
}

function withFunctionCallReturnMetadata(
  expression: CValueNode,
  value: PreparedExpression,
  context: CFunctionContext
): PreparedExpression {
  let shape: CObjectShape | null | undefined = null
  let returnType: string | null | undefined = null
  let returnNullable = false

  if (expression.callee.type === 'Reference' && expression.callee.path.length === 1) {
    const name = expression.callee.path[0]

    shape = context.functionReturnShapes.get(name)
    returnType = context.functionReturnTypes.get(name)
    returnNullable = context.functionReturnNullables.get(name) === true
  } else {
    const resolved = resolveObjectFunctionField(expression.callee, context)
    const functionType = resolved?.field.functionType

    if (functionType === null || typeof functionType === 'undefined') {
      return value
    }

    shape = functionType.returnShape
    returnType = functionType.returnType
    returnNullable = functionType.returnNullable === true
  }

  const cppType = libraryNativeBoundaryCppType(returnType, returnNullable, false, shape)

  if (cppType === null) {
    return value
  }

  value.cppType = cppType
  value.valueType = 'object'
  return value
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
        if (param.valueType === 'number') {
          args.push(emitDefaultOptionalArg(param))
        } else {
          appendPreparedCallArg(
            lines,
            args,
            expression,
            param.defaultValue,
            param,
            index,
            context,
            deps,
            calleeSeenTypes
          )
        }
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

  if (isBoxedScalarParam(param)) {
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
  } else if (
    libraryNativeBoundaryCppType(paramValueType, param.nullable === true, param.optional === true, param.shape) !== null
  ) {
    const value = deps.emitCValueExpression(arg, context)
    const cppType = libraryNativeCppType(param.shape)

    appendLines(lines, value.lines)

    if (value.cppType === cppType) {
      args.push(value.expression)
    } else {
      const adapter = libraryNativeValueAdapter(param.shape)

      if (adapter === null) {
        context.diagnostics.push(
          diagnostic(
            'INOX_C_LIBRARY_NATIVE_VALUE_ADAPTER',
            'runtime-backed native function argument requires a package C++ value adapter',
            arg.loc
          )
        )
      }

      args.push(applyLibraryNativeValueAdapter(value.expression, adapter))
    }
  } else if (paramValueType === 'object') {
    let value = deps.emitCValueExpression(arg, context)

    if (arg.type === 'ObjectLiteral') {
      value = deps.emitCObjectLiteralValueExpression(arg, context, param.shape)
    }

    appendLines(lines, value.lines)
    const runtimeValueExpression = compilerLibraryNativeRuntimeValueExpressionForTypeRef(
      context.libraries,
      param.typeRef
    )

    if (
      runtimeValueExpression !== null &&
      value.cppType !== null &&
      typeof value.cppType !== 'undefined' &&
      value.cppType !== 'inox::Value' &&
      value.cppType !== 'inox_value'
    ) {
      args.push(runtimeValueExpression.split('$value').join(value.expression))
      return
    }

    const objectValue = emitPreparedObjectCallArgumentExpression(value, context)
    appendLines(lines, objectValue.lines)
    args.push(objectValue.expression)
    appendObjectFunctionFieldArguments(
      lines,
      args,
      arg,
      param,
      context,
      deps,
      calleeSeenTypes,
      value.functionCompanions
    )
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
    classInstance.functionCompanions = value.functionCompanions
    return classInstance
  }

  return {
    lines: [],
    expression: value.expression,
    functionCompanions: value.functionCompanions,
    valueType: value.valueType
  }
}

function nativeClassParamName(param: CFunctionParam, context: CFunctionContext): string | null {
  const className = param.className

  if (
    className === null ||
    typeof className === 'undefined' ||
    param.nullable === true ||
    param.ownership === 'weak'
  ) {
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
  if (isBoxedScalarParam(param)) {
    return 'inox_undefined_value()'
  }

  if (param.nullable === true && isRuntimeNullableType(param.valueType)) {
    return 'inox_undefined_value()'
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
  returnFunctionCompanions: CPreparedFunctionCompanion[],
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
        'uncaught throwing function calls must be inside try/catch in the current C++ backend slice',
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
    const returnCppType = libraryNativeBoundaryCppType(
      returnType,
      returnNullable,
      false,
      context.functionReturnShapes.get(name)
    )

    if (
      (returnCppType === null && returnType === 'unknown') ||
      (returnCppType === null && isManagedRuntimeReturnType(returnType)) ||
      (returnCppType === null && isOpaqueRuntimeValueType(returnType)) ||
      (returnCppType === null && returnNullable && isNullableScalarType(returnType))
    ) {
      result = nextCName(context, 'inox_call_result')
      lines.push(`inox_value ${result} = inox_undefined_value();`)
    } else if (returnCppType !== null) {
      result = nextCName(context, 'inox_call_result')
      lines.push(`${returnCppType} ${result}{};`)
    } else {
      result = nextCName(context, 'inox_call_result')
      lines.push(`double ${result} = 0;`)
    }

    if (returnCppType !== null) {
      callArgs.push(`std::addressof(${result})`)
    } else {
      callArgs.push(`&${result}`)
    }
  }

  appendCallReturnFunctionCompanionArgs(callArgs, returnFunctionCompanions)

  callArgs.push('&inox_error')

  const status = nextCName(context, 'inox_call_status')

  lines.push(`inox_status ${status} = ${emitCallee(expression.callee, context)}(${joinStrings(callArgs, ', ')});`)
  appendLines(lines, emitThrowingCallStatusCheck(status, target, context))

  return {
    lines,
    expression: result,
    functionCompanions: returnFunctionCompanions
  }
}

function resolveCFunctionCallReturnInfo(name: string, context: CFunctionContext): CFunctionCallReturnInfo {
  const configuredReturnType = context.functionReturnTypes.get(name)
  let returnType = 'void'

  if (configuredReturnType !== null && typeof configuredReturnType !== 'undefined') {
    returnType = configuredReturnType
  }

  if (cBooleanValueIsTrue(context.functionAsyncFlags.get(name)) && returnType === 'async-result') {
    const asyncResultValueType = context.functionReturnAsyncResultValueTypes.get(name)
    let asyncReturnType = 'void'

    if (asyncResultValueType !== null && typeof asyncResultValueType !== 'undefined') {
      asyncReturnType = asyncResultValueType
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

function emitThrowingCallStatusCheck(status: string, target: string, context: CFunctionContext): string[] {
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
    diagnostic('INOX_C_CALL_EXPR', 'this call expression is not supported by the current C++ backend slice', callee.loc)
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
      diagnostic('INOX_C_NULLISH', 'nullish coalescing is not supported by the current C++ backend slice', expression.loc)
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
        'function values are not supported by the current C++ backend slice',
        expressionLocation(expression)
      )
    )
    return '0'
  }

  if (valueType === 'optional') {
    context.diagnostics.push(
      diagnostic(
        'INOX_C_OPTIONAL_CHAINING',
        'optional chaining is not supported by the current C++ backend slice',
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
  const libraryCall = deps.emitPreparedCompilerLibraryCallExpression(expression, context)

  if (libraryCall !== null && libraryCall.expression !== '') {
    if (
      expression.nullable === true &&
      deps.inferExpressionType(expression, context) === 'number' &&
      (libraryCall.cppType === 'inox::Value' || libraryCall.cppType === 'inox_value')
    ) {
      const value = nextCName(context, 'inox_nullable_scalar')
      const lines: string[] = []

      appendLines(lines, libraryCall.lines)
      lines.push(`auto ${value} = ${libraryCall.expression};`)

      return {
        lines,
        expression: `inox_nullable_number_value(${libraryCall.cppType === 'inox::Value' ? `${value}.raw()` : value})`,
        scalarType: 'double',
        valueType: 'number'
      }
    }

    return libraryCall
  }

  const libraryExpression = deps.emitPreparedCompilerLibraryExpression(expression)

  if (libraryExpression !== null) {
    return libraryExpression
  }

  const classMethodCall = deps.emitPreparedClassMethodCallExpression(expression, context, {})

  if (classMethodCall !== null && typeof classMethodCall !== 'undefined' && classMethodCall.expression !== '') {
    return classMethodCall
  }

  if (expression.type === 'NumberLiteral') {
    return {
      lines: [],
      expression: expression.value
    }
  }

  if (expression.type === 'TypeAssertionExpression') {
    return emitPreparedScalarTypeAssertionExpression(expression, context, deps)
  }

  if (isNarrowedNullableScalarReference(expression, context)) {
    const name = stringValueAt(expression.path, 0)
    const resolvedType = context.variables.get(name)
    let valueType = 'number'

    if (resolvedType !== null && typeof resolvedType !== 'undefined') {
      valueType = resolvedType
    }

    const value = deps.emitReference(expression, context)

    return {
      lines: [],
      expression: scalarRuntimeValueExpression(value, valueType)
    }
  }

  if (isNullableScalarRuntimeExpression(expression, context)) {
    context.diagnostics.push(
      diagnostic(
        'INOX_C_NULLISH',
        'nullable scalar values must be narrowed with ?? before scalar use in the current C++ backend slice',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: '0'
    }
  }

  if (expression.type === 'Reference') {
    const valueType = deps.inferExpressionType(expression, context)

    if ((valueType === 'number' || valueType === 'boolean') && isRuntimeValueReferenceExpression(expression, context)) {
      const value = deps.emitReference(expression, context)
      const check = emitRuntimeValueCheck(value, cRuntimeValueTag(valueType), context)
      const lines: string[] = []

      if (check !== '') {
        lines.push(check)
      }

      return {
        lines,
        expression: scalarRuntimeValueExpression(value, valueType)
      }
    }

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
          'nullish coalescing is not supported by the current C++ backend slice',
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

    const nullableScalarCompare = emitPreparedNullableScalarCompareExpression(expression, context, deps)

    if (nullableScalarCompare !== null && typeof nullableScalarCompare !== 'undefined') {
      return nullableScalarCompare
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

    const dynamicRuntimeValueCompare = emitPreparedDynamicRuntimeValueCompareExpression(expression, context, deps)

    if (dynamicRuntimeValueCompare !== null && typeof dynamicRuntimeValueCompare !== 'undefined') {
      return dynamicRuntimeValueCompare
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

    const nullableRuntimeStringLiteralCompare = emitPreparedNullableRuntimeStringLiteralCompareExpression(
      expression,
      context,
      deps
    )

    if (
      nullableRuntimeStringLiteralCompare !== null &&
      typeof nullableRuntimeStringLiteralCompare !== 'undefined'
    ) {
      return nullableRuntimeStringLiteralCompare
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
          'string binary expressions are not supported by the current C++ backend slice',
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

    if (expression.operator === '%') {
      return {
        lines,
        expression: `fmod(${left.expression}, ${right.expression})`
      }
    }

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
    return deps.emitPreparedCallExpression(expression, context)
  }

  if (expression.type === 'OptionalCallExpression') {
    const optionalPlainCall = emitPreparedOptionalPlainFunctionPointerCallExpression(expression, context, deps)

    if (optionalPlainCall !== null && typeof optionalPlainCall !== 'undefined') {
      return optionalPlainCall
    }
  }

  if (deps.isMemberAccessExpression(expression)) {
    let libraryNativeField: PreparedExpression | null = null

    if (isCompilerLibraryNativeFieldExpression(expression, context)) {
      const preparedObject =
        expression.object.type === 'Reference' ? null : deps.emitCValueExpression(expression.object, context)

      libraryNativeField = emitPreparedCompilerLibraryNativeFieldExpression(expression, context, preparedObject)
    }

    if (libraryNativeField !== null) {
      return libraryNativeField
    }

    const nativeClassField = emitPreparedNativeClassFieldScalarExpression(expression, context)

    if (nativeClassField !== null && typeof nativeClassField !== 'undefined') {
      return nativeClassField
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
      const valueType = objectMember.valueType ?? 'number'
      let scalarExpression = scalarRuntimeValueExpression(objectMember.expression, valueType)

      if (isOptionalChainExpression(expression)) {
        if (valueType !== 'boolean') {
          scalarExpression = ''
        } else {
          scalarExpression = `(${objectMember.expression}.tag == INOX_TAG_BOOLEAN && ${scalarExpression})`
        }
      }

      if (scalarExpression !== '') {
        return {
          lines: objectMember.lines,
          expression: scalarExpression
        }
      }
    }

  }

  if (deps.isIndexAccessExpression(expression)) {
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
        'optional chaining is not supported by the current C++ backend slice',
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
      'this number expression is not supported by the current C++ backend slice',
      expressionLocation(expression)
    )
  )

  return {
    lines: [],
    expression: '0'
  }
}

function emitPreparedScalarTypeAssertionExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CScalarExpressionDependencies
): PreparedExpression {
  const operand = expression.expression
  const valueType = expression.valueType

  if (
    (valueType === 'number' || valueType === 'boolean') &&
    isRuntimeScalarTypeAssertionOperand(operand, context, deps)
  ) {
    const value = deps.emitCValueExpression(operand, context)
    let runtimeValueExpression = value.expression

    if (value.cppType === 'inox::Value') {
      runtimeValueExpression = `${value.expression}.raw()`
    }

    const check = emitRuntimeValueCheck(runtimeValueExpression, cRuntimeValueTag(valueType), context)
    const lines: string[] = []

    appendLines(lines, value.lines)

    if (check !== '') {
      lines.push(check)
    }

    return {
      lines,
      expression: scalarRuntimeValueExpression(runtimeValueExpression, valueType)
    }
  }

  return emitPreparedNumberExpression(operand, context, deps)
}

function isRuntimeScalarTypeAssertionOperand(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CScalarExpressionDependencies
): boolean {
  if (expression.type === 'Reference' && isRuntimeValueReferenceExpression(expression, context)) {
    return true
  }

  const valueType = deps.inferExpressionType(expression, context)

  return (
    valueType === 'unknown' ||
    isOpaqueRuntimeValueType(valueType) ||
    deps.isNullableScalarRuntimeExpression(expression, context)
  )
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
    let value = deps.emitCValueExpression(expression, context)

    if (isNullableScalarType(deps.inferExpressionType(expression, context))) {
      value = deps.emitNullableScalarValueExpression(expression, context)
    }

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

      if (
        nativeClassField !== null &&
        typeof nativeClassField !== 'undefined' &&
        nativeClassField.valueType === 'string'
      ) {
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

      if (
        nativeClassField !== null &&
        typeof nativeClassField !== 'undefined' &&
        nativeClassField.valueType === 'string'
      ) {
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

function emitPreparedNullableRuntimeStringLiteralCompareExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CScalarExpressionDependencies
): PreparedExpression | null {
  if (!isEqualityOperator(expression.operator)) {
    return null
  }

  const leftLiteral = stringLiteralValue(expression.left)

  if (
    leftLiteral !== null &&
    typeof leftLiteral !== 'undefined' &&
    (deps.isNullableRuntimeExpression(expression.right, context) ||
      isDynamicRuntimeValueExpression(expression.right, context, deps))
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
    (deps.isNullableRuntimeExpression(expression.left, context) ||
      isDynamicRuntimeValueExpression(expression.left, context, deps))
  ) {
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

function runtimeValuesStrictEqualExpression(left: string, right: string): string {
  const stringsEqual = runtimeStringValuesEqualExpression(left, right)

  return (
    `(${left}.tag == ${right}.tag && (` +
    `${left}.tag == INOX_TAG_UNDEFINED || ${left}.tag == INOX_TAG_NULL || ` +
    `(${left}.tag == INOX_TAG_BOOL && ${left}.as.boolean == ${right}.as.boolean) || ` +
    `(${left}.tag == INOX_TAG_NUMBER && ${left}.as.number == ${right}.as.number) || ` +
    `${stringsEqual} || ` +
    `(${left}.tag != INOX_TAG_STRING && inox_is_ref_value(${left}) && ${left}.as.ref == ${right}.as.ref)` +
    '))'
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
  const runtimeStringValue = emitPreparedRuntimeStringReferenceValue(valueExpression, context)

  if (runtimeStringValue !== null && typeof runtimeStringValue !== 'undefined') {
    return emitPreparedRuntimePreparedValueStringLiteralCompare(runtimeStringValue, literal, operator, context)
  }

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

export function emitPreparedRuntimeStringReferenceValue(
  expression: CValueNode,
  context: CFunctionContext
): PreparedExpression | null {
  if (expression.type !== 'Reference' || expression.path.length !== 1) {
    return null
  }

  const value = context.runtimeStringValues.get(expression.path[0])

  if (value === null || typeof value === 'undefined') {
    return null
  }

  return {
    lines: [],
    expression: value,
    valueType: 'string'
  }
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
  const testExpression = cValueChild(expression.test)
  const consequentExpression = cValueChild(expression.consequent)
  const alternateExpression = cValueChild(expression.alternate)

  if (testExpression === null || consequentExpression === null || alternateExpression === null) {
    return {
      lines: [],
      expression: '0'
    }
  }

  const test = emitPreparedBooleanOperandExpression(testExpression, context, deps)
  const narrowing = resolveNullableScalarConditionNarrowing(testExpression, context)
  const consequentSnapshot = pushNullableScalarNarrowing(context, narrowing.trueNames)
  const consequent = emitPreparedNumberExpression(consequentExpression, context, deps)

  restoreNullableScalarNarrowing(context, consequentSnapshot)

  const alternateSnapshot = pushNullableScalarNarrowing(context, narrowing.falseNames)
  const alternate = emitPreparedNumberExpression(alternateExpression, context, deps)

  restoreNullableScalarNarrowing(context, alternateSnapshot)

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

function plainOptionalCallFunctionType(expression: CValueNode, context: CFunctionContext): CFunctionType | null {
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
    typeRef: expression.typeRef,
    nullable: expression.nullable === true,
    asyncResultValueType: expression.asyncResultValueType,
    functionType: expression.functionType,
    shape: expression.shape,
    className: expression.className,
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

  if (isNullishLiteralExpression(expression.left)) {
    nullable = expression.right
    maybeNull = expression.left
  }

  if (!isNullishLiteralExpression(maybeNull) || !isNullableRuntimeExpression(nullable, context)) {
    return null
  }

  const value = deps.emitCValueExpression(nullable, context)
  let expectedTag = 'INOX_TAG_NULL'

  if (maybeNull.type === 'Reference') {
    expectedTag = 'INOX_TAG_UNDEFINED'
  }

  const equals = `(${value.expression}.tag == ${expectedTag})`
  let result = `(!${equals})`

  if (isPositiveEqualityOperator(expression.operator)) {
    result = equals
  }

  return {
    lines: value.lines,
    expression: result
  }
}

function isNullishLiteralExpression(expression: CValueNode): boolean {
  return (
    expression.type === 'NullLiteral' ||
    (expression.type === 'Reference' && expression.path.length === 1 && expression.path[0] === 'undefined')
  )
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

  const value = deps.emitNullableScalarValueExpression(nullable, context)
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

function emitPreparedNullableScalarCompareExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CScalarExpressionDependencies
): PreparedExpression | null {
  if (
    !isEqualityOperator(expression.operator) ||
    !deps.isNullableScalarRuntimeExpression(expression.left, context) ||
    !deps.isNullableScalarRuntimeExpression(expression.right, context)
  ) {
    return null
  }

  const left = deps.emitNullableScalarValueExpression(expression.left, context)
  const right = deps.emitNullableScalarValueExpression(expression.right, context)
  const leftName = nextCName(context, 'inox_nullable_left')
  const rightName = nextCName(context, 'inox_nullable_right')
  const lines: string[] = []

  appendLines(lines, left.lines)
  lines.push(`inox_value ${leftName} = ${left.expression};`)
  appendLines(lines, right.lines)
  lines.push(`inox_value ${rightName} = ${right.expression};`)

  const equals = runtimeValuesStrictEqualExpression(leftName, rightName)

  if (isPositiveEqualityOperator(expression.operator)) {
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

function emitPreparedDynamicRuntimeValueCompareExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CScalarExpressionDependencies
): PreparedExpression | null {
  if (!isEqualityOperator(expression.operator)) {
    return null
  }

  const leftType = deps.inferExpressionType(expression.left, context)
  const rightType = deps.inferExpressionType(expression.right, context)

  if (isScalarValueType(leftType) && isScalarValueType(rightType)) {
    return null
  }

  const left = emitPreparedDynamicRuntimeValueExpression(expression.left, context, deps)
  const right = emitPreparedDynamicRuntimeValueExpression(expression.right, context, deps)

  if (left === null || typeof left === 'undefined' || right === null || typeof right === 'undefined') {
    return null
  }

  const leftName = nextCName(context, 'inox_strict_left')
  const rightName = nextCName(context, 'inox_strict_right')
  const lines: string[] = []

  appendLines(lines, left.lines)
  lines.push(`inox_value ${leftName} = ${left.expression};`)
  appendLines(lines, right.lines)
  lines.push(`inox_value ${rightName} = ${right.expression};`)

  const equals = runtimeValuesStrictEqualExpression(leftName, rightName)
  let result = `(!${equals})`

  if (isPositiveEqualityOperator(expression.operator)) {
    result = equals
  }

  return {
    lines,
    expression: result
  }
}

function isScalarValueType(valueType: string): boolean {
  return isNumberOrBooleanValueType(valueType) || valueType === 'string'
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

  let value = emitPreparedDynamicRuntimeValueExpression(valueExpression, context, deps)

  if (value === null || typeof value === 'undefined') {
    const prepared = deps.emitCValueExpression(valueExpression, context)

    if (prepared.cppType !== 'inox::Value' && prepared.cppType !== 'inox_value') {
      return null
    }

    value = prepared
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
  deps: CDynamicObjectValueDependencies
): PreparedExpression | null {
  if (!isNumberOrBooleanValueType(valueType)) {
    return null
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
  deps: CDynamicObjectValueDependencies
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

  return isDynamicRuntimeObjectFieldValueExpression(expression, context, deps)
}

function emitPreparedDynamicRuntimeValueExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CDynamicObjectValueDependencies
): PreparedExpression | null {
  const runtimeReference = emitPreparedRuntimeValueReferenceExpression(expression, context)

  if (runtimeReference !== null && typeof runtimeReference !== 'undefined') {
    return runtimeReference
  }

  if (isDynamicObjectFieldValueExpression(expression, context, deps)) {
    return deps.emitCValueExpression(expression, context)
  }

  return emitPreparedDynamicRuntimeObjectFieldValueExpression(expression, context, deps)
}

function isDynamicRuntimeObjectFieldValueExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CDynamicObjectValueDependencies
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
  deps: CDynamicObjectValueDependencies
): boolean {
  if (isRuntimeValueReferenceExpression(expression, context)) {
    return true
  }

  if (isDynamicObjectFieldValueExpression(expression, context, deps)) {
    return true
  }

  return isDynamicRuntimeObjectFieldValueExpression(expression, context, deps)
}

function emitPreparedDynamicRuntimeObjectFieldValueExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CDynamicObjectValueDependencies
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
  lines.push(`${value} = inox::get(${object.expression}, ${cStringLiteral(access.key)});`)
  appendLines(lines, emitRuntimeThrownCheckLines(context))

  return {
    lines,
    expression: value,
    cppType: 'inox::Value',
    owned: false
  }
}

function emitPreparedDynamicRuntimeObjectValueExpression(
  expression: CValueNode,
  context: CFunctionContext,
  deps: CDynamicObjectValueDependencies
): PreparedExpression | null {
  const runtimeReference = emitPreparedRuntimeValueReferenceExpression(expression, context)

  if (runtimeReference !== null && typeof runtimeReference !== 'undefined') {
    return runtimeReference
  }

  if (isDynamicObjectFieldValueExpression(expression, context, deps)) {
    return deps.emitCValueExpression(expression, context)
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

function isRuntimeValueReferenceExpression(expression: CValueNode, context: CFunctionContext): boolean {
  return !!runtimeValueReferenceName(expression, context)
}

function runtimeValueReferenceName(expression: CValueNode, context: CFunctionContext): string | null {
  if (expression.type !== 'Reference' || expression.path.length !== 1) {
    return null
  }

  const name = stringValueAt(expression.path, 0)
  const valueType = context.variables.get(name)

  if (context.runtimeValueStorageNames.has(name)) {
    return emitCIdentifier(name)
  }

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
  emitCNullishCoalescingValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitCObjectLiteralValueExpression(
    expression: CValueNode,
    context: CFunctionContext,
    shape?: CObjectShape | null
  ): PreparedExpression
  emitCValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitCOptionalIndexValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitCOptionalMemberValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitCStringConcatValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitCTemplateLiteralValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitOptionalRuntimeCallbackCallValueExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitPreparedCallExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitPreparedClassMethodCallExpression(
    expression: CValueNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ): PreparedExpression | null
  emitPreparedKnownObjectIndexValueExpression(
    expression: CValueNode,
    context: CFunctionContext
  ): PreparedExpression | null
  emitPreparedKnownObjectMemberValueExpression(
    expression: CValueNode,
    context: CFunctionContext
  ): PreparedExpression | null
  emitPreparedNullableScalarRuntimeValueExpression(
    expression: CValueNode,
    context: CFunctionContext
  ): PreparedExpression
  emitPreparedDynamicObjectIndexValueExpression(
    expression: CValueNode,
    context: CFunctionContext
  ): PreparedExpression | null
  emitPreparedDynamicObjectMemberValueExpression(
    expression: CValueNode,
    context: CFunctionContext
  ): PreparedExpression | null
  emitPreparedNumberExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression
  emitPreparedRuntimeTruthinessExpression(expression: CValueNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedObjectExpressionIndexValueExpression(
    expression: CValueNode,
    context: CFunctionContext
  ): PreparedExpression | null
  emitPreparedObjectExpressionMemberValueExpression(
    expression: CValueNode,
    context: CFunctionContext
  ): PreparedExpression | null
  emitPreparedCompilerLibraryExpression(expression: CValueNode): PreparedExpression | null
  emitPreparedCompilerLibraryCallExpression(
    expression: CValueNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ): PreparedExpression | null
  inferExpressionType(expression: CValueNode, context: CFunctionContext): string
  isBoxedRuntimeValueName(name: string, context: CFunctionContext): boolean
  isClassConstructorExpression(expression: CValueNode, context: CFunctionContext): boolean
  isIndexAccessExpression(expression: CValueNode): boolean
  isMemberAccessExpression(expression: CValueNode): boolean
  isNullableRuntimeExpression(expression: CValueNode, context: CFunctionContext): boolean
  isNullableScalarRuntimeExpression(expression: CValueNode, context: CFunctionContext): boolean
  isStringConcatExpression(expression: CValueNode, context: CFunctionContext): boolean
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

  const libraryCall = deps.emitPreparedCompilerLibraryCallExpression(expression, context)

  if (libraryCall !== null) {
    return boxPreparedRuntimeScalarValue(libraryCall)
  }

  const libraryExpression = deps.emitPreparedCompilerLibraryExpression(expression)

  if (libraryExpression !== null) {
    return boxPreparedRuntimeScalarValue(libraryExpression)
  }

  if (deps.isClassConstructorExpression(expression, context)) {
    return deps.emitCClassObjectValueExpression(expression, context)
  }

  if (expression.type === 'OptionalCallExpression' && deps.isNullableRuntimeExpression(expression, context)) {
    return deps.emitOptionalRuntimeCallbackCallValueExpression(expression, context)
  }

  if (deps.isNullableScalarRuntimeExpression(expression, context)) {
    return deps.emitPreparedNullableScalarRuntimeValueExpression(expression, context)
  }

  if (deps.isStringConcatExpression(expression, context)) {
    return deps.emitCStringConcatValueExpression(expression, context)
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

    if (
      expression.path.length === 1 &&
      expression.path[0] === 'undefined' &&
      !context.localValueNames.has(name) &&
      !context.moduleValueNames.has(name)
    ) {
      return {
        lines: [],
        expression: 'inox_undefined_value()',
        nullable: true,
        valueType: 'unknown'
      }
    }

    if (!(expression.path.length === 1 && context.localValueNames.has(name))) {
      const resolvedModuleValueName = context.moduleValueNames.get(name)

      if (resolvedModuleValueName !== null && typeof resolvedModuleValueName !== 'undefined') {
        moduleValueName = resolvedModuleValueName
      }
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
      const moduleCppType = context.cppValueTypes.get(name)

      if (moduleCppType !== null && typeof moduleCppType !== 'undefined') {
        return {
          lines: [],
          expression: moduleValueName,
          cppType: moduleCppType,
          valueType: moduleValueType ?? valueType
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

    if (valueType === 'string') {
      return {
        lines: [],
        expression: `inox::String(${reference})`,
        cppType: 'inox::String',
        runtimeTypeChecked: true,
        valueType: 'string'
      }
    }

    if (valueType === 'bytes' || valueType === 'object') {
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
    let libraryNativeField: PreparedExpression | null = null

    if (isCompilerLibraryNativeFieldExpression(expression, context)) {
      const preparedObject =
        expression.object.type === 'Reference' ? null : deps.emitCValueExpression(expression.object, context)

      libraryNativeField = emitPreparedCompilerLibraryNativeFieldExpression(expression, context, preparedObject)
    }

    if (libraryNativeField !== null) {
      return libraryNativeField
    }

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
    const valueType = deps.inferExpressionType(expression, context)

    if (
      valueType !== 'unknown' &&
      valueType !== 'async-result' &&
      !isManagedRuntimeReturnType(valueType) &&
      !isOpaqueRuntimeValueType(valueType)
    ) {
      return emitUnsupportedCValueExpression(expression, context, deps)
    }

    const classMethodCall = deps.emitPreparedClassMethodCallExpression(expression, context, {})

    if (classMethodCall !== null && typeof classMethodCall !== 'undefined') {
      return classMethodCall
    }

    const temp = nextCName(context, 'inox_value')
    const tag = cRuntimeValueTag(valueType)
    const nativeValidExpression = compilerLibraryNativeRuntimeValueValidExpressionForTypeRef(
      context.libraries,
      expression.typeRef
    )
    const returnRuntimeTypeAlternatives = callExpressionReturnRuntimeTypeAlternatives(expression, context)
    const call = deps.emitPreparedCallExpression(expression, context)

    if (call.cppType !== null && typeof call.cppType !== 'undefined') {
      return call
    }

    registerOwnedValue(context, temp)
    const lines: string[] = []

    appendLines(lines, call.lines)
    appendLines(lines, emitPrepareOwnedValueWrite(temp))
    lines.push(`${temp} = ${call.expression};`)

    if (isOwnedRuntimeValueName(call.expression, context)) {
      lines.push(`inox_retain(${temp});`)
    }

    if (nativeValidExpression !== null) {
      const valid = nativeValidExpression.split('$value').join(temp)
      const mismatch =
        callExpressionReturnsNullableRuntimeValue(expression, valueType, context)
          ? `${temp}.tag != INOX_TAG_UNDEFINED && ${temp}.tag != INOX_TAG_NULL && !(${valid})`
          : `!(${valid})`

      lines.push(emitRuntimeTypeCheck(mismatch, context))
    } else if (returnRuntimeTypeAlternatives !== null && typeof returnRuntimeTypeAlternatives !== 'undefined') {
      const validExpressions = runtimeTypeAlternativeValidExpressions(
        returnRuntimeTypeAlternatives,
        temp,
        context.libraries
      )

      if (validExpressions !== null && validExpressions.length > 0) {
        const valid = validExpressions.join(' || ')
        const mismatch = callExpressionReturnsNullableRuntimeValue(expression, valueType, context)
          ? `${temp}.tag != INOX_TAG_UNDEFINED && ${temp}.tag != INOX_TAG_NULL && !(${valid})`
          : `!(${valid})`

        lines.push(emitRuntimeTypeCheck(mismatch, context))
      }
    } else if (callExpressionReturnsNullableRuntimeValue(expression, valueType, context)) {
      appendLines(lines, emitRuntimeNullableValueCheck(temp, tag, context))
    } else {
      lines.push(emitRuntimeValueCheck(temp, tag, context))
    }

    return {
      lines,
      expression: temp,
      functionCompanions: call.functionCompanions
    }
  }

  return emitUnsupportedCValueExpression(expression, context, deps)
}

function callExpressionReturnRuntimeTypeAlternatives(
  expression: CValueNode,
  context: CFunctionContext
): CRuntimeTypeAlternative[] | null | undefined {
  if (expression.callee.type === 'Reference' && expression.callee.path.length === 1) {
    return context.functionReturnRuntimeTypeAlternatives.get(expression.callee.path[0])
  }

  const resolved = resolveObjectFunctionField(expression.callee, context)
  return resolved?.field.functionType?.returnRuntimeTypeAlternatives
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
  let unsupportedMessage = 'this object field expression is not supported by the current C++ backend slice'

  if (unsupportedType === 'function') {
    unsupportedMessage =
      'stored callback values need delayed closure lifetime support and are not supported by the current C++ backend slice'
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
  const testExpression = cValueChild(expression.test)
  const consequentExpression = cValueChild(expression.consequent)
  const alternateExpression = cValueChild(expression.alternate)

  if (testExpression === null || consequentExpression === null || alternateExpression === null) {
    return emitUnsupportedCValueExpression(expression, context, deps)
  }

  let test = deps.emitPreparedRuntimeTruthinessExpression(testExpression, context)

  if (test === null || typeof test === 'undefined') {
    test = deps.emitPreparedNumberExpression(testExpression, context)
  }
  const narrowing = resolveNullableScalarConditionNarrowing(testExpression, context)
  const consequentSnapshot = pushNullableScalarNarrowing(context, narrowing.trueNames)
  const consequent = emitCConditionalBranchValueExpression(consequentExpression, expression, context, deps)

  restoreNullableScalarNarrowing(context, consequentSnapshot)

  const alternateSnapshot = pushNullableScalarNarrowing(context, narrowing.falseNames)
  const alternate = emitCConditionalBranchValueExpression(alternateExpression, expression, context, deps)

  restoreNullableScalarNarrowing(context, alternateSnapshot)

  const temp = nextCName(context, 'inox_conditional_value')
  const valueType = deps.inferExpressionType(expression, context)
  const tag = cRuntimeValueTag(valueType)
  const nativeValidExpression = compilerLibraryNativeRuntimeValueValidExpressionForTypeRef(
    context.libraries,
    expression.typeRef
  )
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

  if (nativeValidExpression !== null) {
    const valid = nativeValidExpression.split('$value').join(temp)
    const mismatch =
      expression.nullable === true
        ? `${temp}.tag != INOX_TAG_UNDEFINED && ${temp}.tag != INOX_TAG_NULL && !(${valid})`
        : `!(${valid})`

    lines.push(emitRuntimeTypeCheck(mismatch, context))
  } else if (expression.nullable === true) {
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

function boxPreparedRuntimeScalarValue(value: PreparedExpression): PreparedExpression {
  const valueType = value.valueType

  if (value.cppType === 'inox::Value' || (valueType !== 'number' && valueType !== 'boolean')) {
    return value
  }

  return {
    lines: value.lines,
    expression: boxedScalarRuntimeValueExpression(value.expression, valueType),
    cppType: 'inox::Value',
    runtimeTypeChecked: true,
    valueType
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
