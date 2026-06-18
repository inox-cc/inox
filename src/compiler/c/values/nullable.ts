import {
  cloneCStringSet,
  emitPrepareOwnedValueWrite,
  emitRuntimeTypeCheck,
  emitStatusCheck,
  nextCName,
  registerOwnedValue
} from '../context.ts'
import { diagnostic } from '../../diagnostics.ts'
import { cStringLiteral, utf8ByteLength } from '../identifiers.ts'
import { emitRuntimeNullableValueCheck } from '../runtime-values.ts'
import { isNullishCoalescingExpression } from '../syntax.ts'
import { cRuntimeValueTag, isNullableScalarType, isRuntimeNullableType } from '../value-types.ts'
import {
  emitObjectValueReference,
  registerObjectShape,
  resolveKnownObjectIndex,
  resolveKnownObjectMember,
  resolveObjectExpressionIndex,
  resolveObjectExpressionMember
} from './objects.ts'
import type { AnyNode, Diagnostic } from '../../types.ts'
import type {
  CFunctionReturnMapType,
  CFunctionType,
  CObjectFieldInfo,
  CObjectIndexFieldInfo,
  CObjectShapeField,
  CObjectShape,
  CPreparedExpression as PreparedExpression,
  CRuntimeArrayElement
} from '../types.ts'

type CBooleanMap = Map<string, boolean>
type CFunctionReturnMapTypeMap = Map<string, CFunctionReturnMapType>
type CFunctionTypeMap = Map<string, CFunctionType>
type CObjectShapeFieldMap = Map<string, CObjectShapeField[]>
type CStringMap = Map<string, string>
type CStringNullableMap = Map<string, string | null>
type CStringSet = Set<string>

type NullableFunctionContext = {
  boxedVariables: CStringSet
  cleanupEnabled: boolean
  diagnostics: Diagnostic[]
  failureStatement?: string | null
  failureStatementUsed?: boolean
  functionReturnArrayElementTypes: CStringNullableMap
  functionReturnNullables: CBooleanMap
  functionTypes: CFunctionTypeMap
  mapTypes: CFunctionReturnMapTypeMap
  narrowedNullableScalars: CStringSet
  nextId: number
  nullableLoweringDependencies: NullableLoweringDependencies
  nullableVariables: CStringSet
  objectShapes: CObjectShapeFieldMap
  ownedValues: string[]
  returnType?: string
  runtimeArrayElementTypes: CStringMap
  runtimeCallbacks: CStringSet
  setElementTypes: CStringMap
  statusReturn: boolean
  throwingFunction: boolean
  usedCleanupGoto: boolean
  variables: CStringMap
}

function nullableBooleanValueIsTrue(value: boolean | null | undefined): boolean {
  if (value == null) {
    return false
  }

  if (value) {
    return true
  }

  return false
}

function nullableStringAt(values: string[], index: number): string {
  return values[index]
}

export type NullableLoweringDependencies = {
  emitCObjectLiteralValueExpression(
    expression: AnyNode,
    context: NullableFunctionContext,
    shape: CObjectShape | null | undefined
  ): PreparedExpression
  emitCValueExpression(expression: AnyNode, context: NullableFunctionContext): PreparedExpression
  emitNullableFunctionValueExpression(
    expression: AnyNode,
    functionType: CFunctionType | null | undefined,
    context: NullableFunctionContext
  ): PreparedExpression
  emitNullableScalarValueExpression(expression: AnyNode, context: NullableFunctionContext): PreparedExpression
  inferExpressionType(expression: AnyNode, context: NullableFunctionContext): string
  isNumberConversionCall(expression: AnyNode, context: NullableFunctionContext): boolean
  resolveRuntimeCallbackCalleeType(callee: AnyNode, context: NullableFunctionContext): CFunctionType | null
}

type NullableScalarNarrowing = {
  trueNames: string[]
  falseNames: string[]
}

type NullableScalarNarrowingSnapshot = {
  active: boolean
  narrowedNullableScalars: CStringSet
}

type OptionalObjectReadAccess = {
  index: number
  key: string
  kind: string
  objectName: string | null
}

type ObjectIndexKeyField = {
  key: string
}

function nullableDeps(context: NullableFunctionContext): NullableLoweringDependencies {
  return context.nullableLoweringDependencies
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

function pushUniqueName(names: string[], name: string): void {
  if (!hasName(names, name)) {
    names.push(name)
  }
}

function hasName(names: string[], expected: string): boolean {
  for (const name of names) {
    if (name === expected) {
      return true
    }
  }

  return false
}

function appendUniqueNames(out: string[], names: string[]): void {
  for (const name of names) {
    pushUniqueName(out, name)
  }
}

function isEqualityOperator(operator: string): boolean {
  return operator === '===' || operator === '!==' || operator === '==' || operator === '!='
}

function nullableString(value: string | null | undefined): string | null {
  if (value == null) {
    return null
  }

  return value
}

function objectIndexKey(field: ObjectIndexKeyField): string {
  return field.key
}

function pushNullableScalarNarrowing(
  context: NullableFunctionContext,
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
  context: NullableFunctionContext,
  snapshot: NullableScalarNarrowingSnapshot
): void {
  if (snapshot.active) {
    context.narrowedNullableScalars = snapshot.narrowedNullableScalars
  }
}

export function isNullableScalarRuntimeExpression(expression: AnyNode, context: NullableFunctionContext): boolean {
  return (
    isNullableScalarType(nullableDeps(context).inferExpressionType(expression, context)) && isNullableRuntimeExpression(expression, context)
  )
}

export function resolveNullableScalarConditionNarrowing(
  expression: AnyNode,
  context: NullableFunctionContext
): NullableScalarNarrowing {
  if (expression.type !== 'BinaryExpression') {
    return emptyNullableScalarNarrowing()
  }

  if (expression.operator === '&&') {
    const left = resolveNullableScalarConditionNarrowing(expression.left, context)
    const snapshot = pushNullableScalarNarrowing(context, left.trueNames)
    const right = resolveNullableScalarConditionNarrowing(expression.right, context)

    restoreNullableScalarNarrowing(context, snapshot)

    return {
      trueNames: mergeNames(left.trueNames, right.trueNames),
      falseNames: intersectNames(left.falseNames, mergeNames(left.trueNames, right.falseNames))
    }
  }

  if (expression.operator === '||') {
    const left = resolveNullableScalarConditionNarrowing(expression.left, context)
    const snapshot = pushNullableScalarNarrowing(context, left.falseNames)
    const right = resolveNullableScalarConditionNarrowing(expression.right, context)

    restoreNullableScalarNarrowing(context, snapshot)

    return {
      trueNames: intersectNames(left.trueNames, mergeNames(left.falseNames, right.trueNames)),
      falseNames: mergeNames(left.falseNames, right.falseNames)
    }
  }

  return resolveNullableScalarNullCheckNarrowing(expression, context)
}

function resolveNullableScalarNullCheckNarrowing(
  expression: AnyNode,
  context: NullableFunctionContext
): NullableScalarNarrowing {
  if (expression.type !== 'BinaryExpression' || !isEqualityOperator(expression.operator)) {
    return emptyNullableScalarNarrowing()
  }

  let nullable = expression.left
  let maybeNull = expression.right

  if (expression.left != null && expression.left.type === 'NullLiteral') {
    nullable = expression.right
    maybeNull = expression.left
  }

  if (
    maybeNull == null ||
    maybeNull.type !== 'NullLiteral' ||
    nullable == null ||
    nullable.type !== 'Reference' ||
    nullable.path.length !== 1
  ) {
    return emptyNullableScalarNarrowing()
  }

  const name = nullableStringAt(nullable.path, 0)

  if (!context.nullableVariables.has(name) || !isRuntimeNullableType(context.variables.get(name))) {
    return emptyNullableScalarNarrowing()
  }

  if (expression.operator === '!==' || expression.operator === '!=') {
    return {
      trueNames: [name],
      falseNames: []
    }
  }

  return {
    trueNames: [],
    falseNames: [name]
  }
}

function emptyNullableScalarNarrowing(): NullableScalarNarrowing {
  return {
    trueNames: [],
    falseNames: []
  }
}

function uniqueNames(names: string[]): string[] {
  const unique: string[] = []

  appendUniqueNames(unique, names)

  return unique
}

function mergeNames(left: string[], right: string[]): string[] {
  const merged: string[] = []

  appendUniqueNames(merged, left)
  appendUniqueNames(merged, right)

  return merged
}

function intersectNames(left: string[], right: string[]): string[] {
  const names: string[] = []

  for (const name of left) {
    if (hasName(right, name)) {
      pushUniqueName(names, name)
    }
  }

  return names
}

export function isNarrowedNullableScalarReference(expression: AnyNode, context: NullableFunctionContext): boolean {
  if (expression.type !== 'Reference' || expression.path.length !== 1) {
    return false
  }

  const name = nullableStringAt(expression.path, 0)

  return (
    context.narrowedNullableScalars.has(name) &&
    context.nullableVariables.has(name) &&
    isNullableScalarType(context.variables.get(name))
  )
}

export function clearNullableScalarNarrowing(name: string, context: NullableFunctionContext): string[] {
  context.narrowedNullableScalars.delete(name)

  return []
}

export function canLowerCNullishCoalescingExpression(expression: AnyNode, context: NullableFunctionContext): boolean {
  if (!isNullishCoalescingExpression(expression)) {
    return false
  }

  const resultType = nullableDeps(context).inferExpressionType(expression, context)

  return (
    isRuntimeNullableType(resultType) &&
    (nullableDeps(context).inferExpressionType(expression.left, context) === 'null' || isNullableRuntimeExpression(expression.left, context))
  )
}

export function canLowerCScalarNullishCoalescingExpression(expression: AnyNode, context: NullableFunctionContext): boolean {
  if (!isNullishCoalescingExpression(expression)) {
    return false
  }

  const resultType = nullableDeps(context).inferExpressionType(expression, context)

  return (
    isNullableScalarType(resultType) &&
    (nullableDeps(context).inferExpressionType(expression.left, context) === 'null' || isNullableRuntimeExpression(expression.left, context))
  )
}

export function isNullableRuntimeExpression(expression: AnyNode, context: NullableFunctionContext): boolean {
  if (expression.type === 'Reference' && expression.path.length === 1) {
    const name = nullableStringAt(expression.path, 0)

    return context.nullableVariables.has(name)
  }

  if (nullableDeps(context).isNumberConversionCall(expression, context)) {
    return true
  }

  if (
    expression.type === 'CallExpression' &&
    expression.callee.type === 'Reference' &&
    expression.callee.path.length === 1
  ) {
    const name = nullableStringAt(expression.callee.path, 0)

    return nullableBooleanValueIsTrue(context.functionReturnNullables.get(name))
  }

  if (expression.type === 'OptionalCallExpression') {
    const functionType = nullableDeps(context).resolveRuntimeCallbackCalleeType(expression.callee, context)

    return functionType != null && isRuntimeNullableType(functionType.returnType)
  }

  if (isNullishCoalescingExpression(expression)) {
    return false
  }

  return expression.nullable === true && isRuntimeNullableType(nullableDeps(context).inferExpressionType(expression, context))
}

export function emitNullableRuntimeValueVariableDeclaration(statement: AnyNode, context: NullableFunctionContext): string[] {
  const valueType = statement.valueType
  const expectedTag = cRuntimeValueTag(valueType)

  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, valueType)
  context.nullableVariables.add(statement.name)

  if (valueType === 'object') {
    registerObjectShape(context, statement.name, statement.shape)
  } else if (valueType === 'array') {
    let arrayElementType = 'unknown'

    if (statement.arrayElementType != null) {
      arrayElementType = statement.arrayElementType
    }

    context.runtimeArrayElementTypes.set(statement.name, arrayElementType)
  } else if (valueType === 'map') {
    let mapKeyType = 'unknown'
    let mapValueType = 'unknown'

    if (statement.mapKeyType != null) {
      mapKeyType = statement.mapKeyType
    }

    if (statement.mapValueType != null) {
      mapValueType = statement.mapValueType
    }

    context.mapTypes.set(statement.name, {
      key: mapKeyType,
      value: mapValueType
    })
  } else if (valueType === 'set') {
    let setElementType = 'unknown'

    if (statement.setElementType != null) {
      setElementType = statement.setElementType
    }

    context.setElementTypes.set(statement.name, setElementType)
  } else if (valueType === 'function') {
    context.functionTypes.set(statement.name, normalizeNullableFunctionType(statement.functionType))
    context.runtimeCallbacks.add(statement.name)
  }

  if (statement.init == null || statement.init.type === 'NullLiteral') {
    const lines: string[] = []

    appendLines(lines, emitPrepareOwnedValueWrite(statement.name))
    lines.push(`${statement.name} = ccjs_null_value();`)

    return lines
  }

  const deps = nullableDeps(context)
  const value = emitNullableRuntimeValueInitializer(statement, valueType, context, deps)

  const lines: string[] = []

  appendLines(lines, value.lines)
  appendLines(lines, emitPrepareOwnedValueWrite(statement.name))
  lines.push(`${statement.name} = ${value.expression};`)
  appendLines(lines, emitRuntimeNullableValueCheck(statement.name, expectedTag, context))
  lines.push(`ccjs_retain(${statement.name});`)

  return lines
}

function emitNullableRuntimeValueInitializer(
  statement: AnyNode,
  valueType: string,
  context: NullableFunctionContext,
  deps: NullableLoweringDependencies
): PreparedExpression {
  if (isNullableScalarType(valueType)) {
    return deps.emitNullableScalarValueExpression(statement.init, context)
  }

  if (valueType === 'function') {
    return deps.emitNullableFunctionValueExpression(statement.init, statement.functionType, context)
  }

  if (statement.init.type === 'ObjectLiteral') {
    return deps.emitCObjectLiteralValueExpression(statement.init, context, statement.shape)
  }

  return deps.emitCValueExpression(statement.init, context)
}

export function emitCOptionalMemberValueExpression(expression: AnyNode, context: NullableFunctionContext): PreparedExpression {
  let member: CObjectFieldInfo | null = resolveKnownObjectMember(expression, context)

  if (member == null) {
    member = resolveObjectExpressionMember(expression)
  }

  if (member != null && isRuntimeNullableType(member.valueType)) {
    const objectExpression = expression.object
    const access: OptionalObjectReadAccess = {
      index: member.index,
      key: '',
      kind: 'known',
      objectName: nullableString(member.objectName)
    }

    return emitCOptionalObjectReadValueExpression(objectExpression, member.valueType, context, access)
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_C_OPTIONAL_CHAINING',
      'optional member access for this field is not supported by the current C backend slice',
      expression.loc
    )
  )

  return {
    lines: [],
    expression: 'ccjs_undefined_value()'
  }
}

export function emitCOptionalIndexValueExpression(expression: AnyNode, context: NullableFunctionContext): PreparedExpression {
  let field: CObjectIndexFieldInfo | null = resolveKnownObjectIndex(expression, context)

  if (field == null) {
    field = resolveObjectExpressionIndex(expression)
  }

  if (field != null) {
    if (!isRuntimeNullableType(field.valueType)) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_OPTIONAL_CHAINING',
          'optional object index access for this field is not supported by the current C backend slice',
          expression.loc
        )
      )

      return {
        lines: [],
        expression: 'ccjs_undefined_value()'
      }
    }

    const objectExpression = expression.object
    const access: OptionalObjectReadAccess = {
      index: 0,
      key: objectIndexKey(field),
      kind: 'key',
      objectName: nullableString(field.objectName)
    }

    return emitCOptionalObjectReadValueExpression(objectExpression, field.valueType, context, access)
  }

  const element = resolveNullableOptionalRuntimeArrayIndex(expression, context)

  if (element != null) {
    if (!isRuntimeNullableType(element.valueType)) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_OPTIONAL_CHAINING',
          'optional array index access for this element type is not supported by the current C backend slice',
          expression.loc
        )
      )

      return {
        lines: [],
        expression: 'ccjs_undefined_value()'
      }
    }

    return emitCOptionalArrayIndexValueExpression(expression.object, element, context)
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_C_OPTIONAL_CHAINING',
      'optional index access is not supported by the current C backend slice',
      expression.loc
    )
  )

  return {
    lines: [],
    expression: 'ccjs_undefined_value()'
  }
}

function emitCOptionalObjectReadValueExpression(
  objectExpression: AnyNode,
  valueType: string,
  context: NullableFunctionContext,
  access: OptionalObjectReadAccess
): PreparedExpression {
  const object = nullableDeps(context).emitCValueExpression(objectExpression, context)
  const temp = nextCName(context, 'ccjs_optional_value')
  const expectedTag = cRuntimeValueTag(valueType)
  const typeCheck = emitRuntimeTypeCheck(
    `${object.expression}.tag != CCJS_TAG_OBJECT || ${object.expression}.as.ref == 0`,
    context
  )
  const getCall = optionalObjectReadGetCall(access, object.expression, temp, context)
  const statusCheck = emitStatusCheck(getCall, context)
  const lines: string[] = []

  registerOwnedValue(context, temp)

  appendLines(lines, object.lines)
  appendLines(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(`if (${object.expression}.tag == CCJS_TAG_NULL) {`)
  lines.push(`  ${temp} = ccjs_null_value();`)
  lines.push('} else {')
  lines.push(`  ${typeCheck}`)
  lines.push(`  ${statusCheck}`)
  appendPrefixedLines(lines, emitRuntimeNullableValueCheck(temp, expectedTag, context), '  ')
  lines.push('}')

  return {
    lines,
    expression: temp
  }
}

function optionalObjectReadGetCall(
  access: OptionalObjectReadAccess,
  objectExpression: string,
  temp: string,
  context: NullableFunctionContext
): string {
  let object = objectExpression

  if (access.objectName != null) {
    object = emitObjectValueReference(access.objectName, context)
  }

  if (access.kind === 'known') {
    return `ccjs_object_get_known(${object}, ${access.index}, &${temp})`
  }

  return `ccjs_object_get(${object}, ${cStringLiteral(access.key)}, ${utf8ByteLength(access.key)}, &${temp})`
}

function emitCOptionalArrayIndexValueExpression(
  arrayExpression: AnyNode,
  element: CRuntimeArrayElement,
  context: NullableFunctionContext
): PreparedExpression {
  const array = nullableDeps(context).emitCValueExpression(arrayExpression, context)
  const temp = nextCName(context, 'ccjs_optional_value')
  const expectedTag = cRuntimeValueTag(element.valueType)
  const typeCheck = emitRuntimeTypeCheck(
    `${array.expression}.tag != CCJS_TAG_ARRAY || ${array.expression}.as.ref == 0`,
    context
  )
  const statusCheck = emitStatusCheck(`ccjs_array_get(${array.expression}, ${element.index}, &${temp})`, context)
  const lines: string[] = []

  registerOwnedValue(context, temp)

  appendLines(lines, array.lines)
  appendLines(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(`if (${array.expression}.tag == CCJS_TAG_NULL) {`)
  lines.push(`  ${temp} = ccjs_null_value();`)
  lines.push('} else {')
  lines.push(`  ${typeCheck}`)
  lines.push(`  ${statusCheck}`)
  appendPrefixedLines(lines, emitRuntimeNullableValueCheck(temp, expectedTag, context), '  ')
  lines.push('}')

  return {
    lines,
    expression: temp
  }
}

function resolveNullableOptionalRuntimeArrayIndex(
  expression: AnyNode,
  context: NullableFunctionContext
): CRuntimeArrayElement | null {
  if (expression.type !== 'OptionalIndexExpression' || expression.index.type !== 'NumberLiteral') {
    return null
  }

  const index = parseNonNegativeIntegerLiteral(expression.index.value)

  if (index < 0) {
    return null
  }

  const valueType = resolveNullableRuntimeArrayElementType(expression.object, context)

  if (valueType == null) {
    return null
  }

  return {
    index,
    valueType
  }
}

function resolveNullableRuntimeArrayElementType(expression: AnyNode, context: NullableFunctionContext): string | null {
  if (expression.type === 'Reference' && expression.path.length === 1) {
    const name = nullableStringAt(expression.path, 0)
    const runtimeElementType = context.runtimeArrayElementTypes.get(name)

    if (runtimeElementType == null) {
      return null
    }

    return runtimeElementType
  }

  if (expression.type === 'CallExpression') {
    if (expression.valueType !== 'array') {
      return null
    }

    if (expression.arrayElementType != null) {
      return expression.arrayElementType
    }

    const functionReturn = resolveNullableFunctionReturnNameFromCall(expression)

    if (functionReturn != null) {
      const functionElementType = context.functionReturnArrayElementTypes.get(functionReturn)

      if (functionElementType != null) {
        return functionElementType
      }
    }

    return 'unknown'
  }

  if (expression.type === 'MemberExpression') {
    const member = resolveKnownObjectMember(expression, context)

    if (member == null || member.valueType !== 'array') {
      return null
    }

    if (member.arrayElementType != null) {
      return member.arrayElementType
    }

    return 'unknown'
  }

  if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
    const field = resolveKnownObjectIndex(expression, context)

    if (field == null || field.valueType !== 'array') {
      return null
    }

    if (field.arrayElementType != null) {
      return field.arrayElementType
    }

    return 'unknown'
  }

  return null
}

function parseNonNegativeIntegerLiteral(value: string): number {
  if (value.length === 0) {
    return -1
  }

  let result = 0

  for (let index = 0; index < value.length; index = index + 1) {
    const code = value.charCodeAt(index)

    if (code < 48 || code > 57) {
      return -1
    }

    result = result * 10 + code - 48
  }

  return result
}

function resolveNullableFunctionReturnNameFromCall(expression: AnyNode): string | null {
  if (
    expression.callee.type === 'Reference' &&
    expression.callee.path.length === 1
  ) {
    return nullableStringAt(expression.callee.path, 0)
  }

  return null
}

function normalizeNullableFunctionType(functionType: CFunctionType | null | undefined): CFunctionType {
  if (functionType != null) {
    return functionType
  }

  return {
    kind: 'function',
    params: [],
    returnType: 'void'
  }
}
