import { diagnostic } from '../../diagnostics.ts'
import { memberExpressionPath } from '../../member-paths.ts'
import type { AnyNode, Diagnostic } from '../../types.ts'
import {
  cloneCStringSet,
  emitFailureStatement,
  emitPrepareOwnedValueWrite,
  emitRuntimeTypeCheck,
  nextCName,
  registerOwnedValue
} from '../context.ts'
import { cStringLiteral, emitCIdentifier } from '../identifiers.ts'
import { emitRuntimeNullableValueCheck, runtimeObjectReadValueMismatchCondition } from '../runtime-values.ts'
import { isCoalesceExpression } from '../syntax.ts'
import type {
  CFunctionReturnMapType,
  CFunctionType,
  CObjectFieldInfo,
  CObjectIndexFieldInfo,
  CObjectShape,
  CObjectShapeField,
  CRuntimeArrayElement,
  CPreparedExpression as PreparedExpression
} from '../types.ts'
import {
  cRuntimeValueTag,
  isNullableScalarType,
  isOpaqueRuntimeValueType,
  isRuntimeNullableType
} from '../value-types.ts'
import {
  emitObjectValueReference,
  registerObjectShape,
  resolveKnownObjectIndex,
  resolveKnownObjectMember,
  resolveObjectExpressionIndex,
  resolveObjectExpressionMember
} from './objects.ts'

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
  errorChannelUsed?: boolean
  errorTargetActiveFlags?: boolean[]
  errorTargets?: string[]
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
  if (value === null || typeof value === 'undefined') {
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

function joinNullablePath(values: string[], separator: string): string {
  let result = ''

  for (let index = 0; index < values.length; index = index + 1) {
    if (index > 0) {
      result = result + separator
    }

    result = result + values[index]
  }

  return result
}

function currentNullableErrorTarget(context: NullableFunctionContext): string {
  const targets = context.errorTargets

  if (targets === null || typeof targets === 'undefined' || targets.length === 0) {
    return ''
  }

  return targets[targets.length - 1]
}

function currentNullableErrorTargetRequiresActive(context: NullableFunctionContext): boolean {
  const flags = context.errorTargetActiveFlags

  if (flags === null || typeof flags === 'undefined' || flags.length === 0) {
    return false
  }

  return flags[flags.length - 1]
}

function registerNullableErrorValue(context: NullableFunctionContext): void {
  registerOwnedValue(context, 'inox_error')
}

function registerNullableErrorChannel(context: NullableFunctionContext): void {
  context.errorChannelUsed = true
  registerNullableErrorValue(context)
}

function emitNullableThrownCheckLines(context: NullableFunctionContext): string[] {
  const target = currentNullableErrorTarget(context)

  if (target === '' && !context.throwingFunction) {
    return [`if (inox::thrown()) ${emitFailureStatement(context)}`]
  }

  const errorActiveNeeded = currentNullableErrorTargetRequiresActive(context) || (target === '' && context.throwingFunction)

  if (errorActiveNeeded) {
    registerNullableErrorChannel(context)
  } else if (target === '') {
    registerNullableErrorValue(context)
  }

  if (target !== '' && !errorActiveNeeded) {
    return [`if (inox::thrown()) goto ${target};`]
  }

  const lines: string[] = ['if (inox::thrown()) {']

  if (target === '') {
    lines.push('  inox_error = inox::take_exception();')
  }
  if (errorActiveNeeded) {
    lines.push('  inox_error_active = 1;')
  }
  if (target === '') {
    lines.push('  inox_status_result = INOX_ERR_THROW;')
    lines.push('  goto cleanup;')
  } else {
    lines.push(`  goto ${target};`)
  }

  lines.push('}')

  return lines
}

function emitNullableObjectGetValueLines(
  object: string,
  key: string,
  temp: string,
  context: NullableFunctionContext
): string[] {
  const lines = [`${temp} = inox::get(${object}, ${cStringLiteral(key)});`]

  appendLines(lines, emitNullableThrownCheckLines(context))

  return lines
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
  emitPreparedNumberExpression(expression: AnyNode, context: NullableFunctionContext): PreparedExpression
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
  return operator === '===' || operator === '!=='
}

function nullableString(value: string | null | undefined): string | null {
  if (value === null || typeof value === 'undefined') {
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
    isNullableScalarType(nullableDeps(context).inferExpressionType(expression, context)) &&
    isNullableRuntimeExpression(expression, context)
  )
}

export function resolveNullableScalarConditionNarrowing(
  expression: AnyNode,
  context: NullableFunctionContext
): NullableScalarNarrowing {
  if (expression.type === 'UnaryExpression' && expression.operator === '!') {
    const argument = resolveNullableScalarConditionNarrowing(expression.argument, context)

    return {
      trueNames: argument.falseNames,
      falseNames: argument.trueNames
    }
  }

  if (expression.type !== 'BinaryExpression') {
    return resolveNullableScalarTruthinessNarrowing(expression, context)
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

function resolveNullableScalarTruthinessNarrowing(
  expression: AnyNode,
  context: NullableFunctionContext
): NullableScalarNarrowing {
  const name = nullableScalarNarrowingKey(expression)

  if (name === null || typeof name === 'undefined') {
    return emptyNullableScalarNarrowing()
  }

  if (!isNullableScalarNarrowingExpression(expression, name, context)) {
    return emptyNullableScalarNarrowing()
  }

  return {
    trueNames: [name],
    falseNames: []
  }
}

function resolveNullableScalarNullCheckNarrowing(
  expression: AnyNode,
  context: NullableFunctionContext
): NullableScalarNarrowing {
  if (expression.type !== 'BinaryExpression' || !isEqualityOperator(expression.operator)) {
    return emptyNullableScalarNarrowing()
  }

  const typeofNarrowing = resolveNullableScalarTypeofNarrowing(expression, context)

  if (typeofNarrowing !== null) {
    return typeofNarrowing
  }

  let nullable = expression.left
  let maybeNull = expression.right

  if (expression.left !== null && typeof expression.left !== 'undefined' && expression.left.type === 'NullLiteral') {
    nullable = expression.right
    maybeNull = expression.left
  }

  if (
    maybeNull === null ||
    typeof maybeNull === 'undefined' ||
    maybeNull.type !== 'NullLiteral' ||
    nullable === null ||
    typeof nullable === 'undefined'
  ) {
    return emptyNullableScalarNarrowing()
  }

  const name = nullableScalarNarrowingKey(nullable)

  if (name === null || typeof name === 'undefined' || !isNullableScalarNarrowingExpression(nullable, name, context)) {
    return emptyNullableScalarNarrowing()
  }

  if (expression.operator === '!==') {
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

function resolveNullableScalarTypeofNarrowing(
  expression: AnyNode,
  context: NullableFunctionContext
): NullableScalarNarrowing | null {
  let typeofExpression = expression.left
  let literal = expression.right

  if (expression.right.type === 'UnaryExpression' && expression.right.operator === 'typeof') {
    typeofExpression = expression.right
    literal = expression.left
  }

  if (
    typeofExpression.type !== 'UnaryExpression' ||
    typeofExpression.operator !== 'typeof' ||
    literal.type !== 'StringLiteral' ||
    (literal.value !== 'undefined' && !isNonNullableTypeofName(literal.value))
  ) {
    return null
  }

  const argument = typeofExpression.argument
  const name = nullableScalarNarrowingKey(argument)

  if (name === null || typeof name === 'undefined') {
    return emptyNullableScalarNarrowing()
  }

  if (literal.value !== 'string' && !isNullableScalarNarrowingExpression(argument, name, context)) {
    return emptyNullableScalarNarrowing()
  }

  const narrowsWhenEqual = literal.value !== 'undefined'

  if (
    (expression.operator === '===' && narrowsWhenEqual) ||
    (expression.operator === '!==' && !narrowsWhenEqual)
  ) {
    return { trueNames: [name], falseNames: [] }
  }

  return { trueNames: [], falseNames: [name] }
}

function isNonNullableTypeofName(value: string): boolean {
  return value === 'string' || value === 'number' || value === 'boolean' || value === 'function'
}

function nullableScalarNarrowingKey(expression: AnyNode | null | undefined): string | null {
  const path = memberExpressionPath(expression)

  if (path.length === 0) {
    return null
  }

  return joinNullablePath(path, '.')
}

function isNullableScalarNarrowingExpression(
  expression: AnyNode,
  name: string,
  context: NullableFunctionContext
): boolean {
  if (
    expression.type === 'Reference' &&
    expression.path.length === 1 &&
    context.nullableVariables.has(name) &&
    isRuntimeNullableType(context.variables.get(name))
  ) {
    return true
  }

  const field = nullableScalarObjectField(expression, context)

  if (
    field !== null &&
    typeof field !== 'undefined' &&
    isNullableScalarType(field.valueType) &&
    (field.nullable === true || field.optional === true || expression.nullable === true)
  ) {
    return true
  }

  if (expression.nullable === true && isNullableScalarType(nullableDeps(context).inferExpressionType(expression, context))) {
    return true
  }

  return false
}

function nullableScalarObjectField(
  expression: AnyNode,
  context: NullableFunctionContext
): CObjectFieldInfo | null {
  if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
    const member = resolveKnownObjectMember(expression, context)

    if (member !== null && typeof member !== 'undefined') {
      return member
    }

    return resolveObjectExpressionMember(expression)
  }

  if (
    (expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression') &&
    expression.index.type === 'StringLiteral'
  ) {
    const field = resolveKnownObjectIndex(expression, context)

    if (field !== null && typeof field !== 'undefined') {
      return field
    }

    return resolveObjectExpressionIndex(expression)
  }

  return null
}

function emptyNullableScalarNarrowing(): NullableScalarNarrowing {
  return {
    trueNames: [],
    falseNames: []
  }
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
  if (!isCoalesceExpression(expression)) {
    return false
  }

  const resultType = nullableDeps(context).inferExpressionType(expression, context)

  return (
    resultType === 'unknown' ||
    resultType === 'string' ||
    isRuntimeNullableType(resultType) ||
    isOpaqueRuntimeValueType(resultType)
  )
}

export function canLowerCScalarNullishCoalescingExpression(
  expression: AnyNode,
  context: NullableFunctionContext
): boolean {
  if (!isCoalesceExpression(expression)) {
    return false
  }

  const resultType = nullableDeps(context).inferExpressionType(expression, context)

  return (
    expression.nullable !== true &&
    isNullableScalarType(resultType) &&
    (nullableDeps(context).inferExpressionType(expression.left, context) === 'null' ||
      isNullableRuntimeExpression(expression.left, context) ||
      expression.left.nullable === true)
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

  if (isMapGetCallExpression(expression, context)) {
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

    return (
      functionType !== null && typeof functionType !== 'undefined' && isRuntimeNullableType(functionType.returnType)
    )
  }

  if (isCoalesceExpression(expression)) {
    return (
      expression.nullable === true &&
      isRuntimeNullableType(nullableDeps(context).inferExpressionType(expression, context))
    )
  }

  return (
    expression.nullable === true &&
    isRuntimeNullableType(nullableDeps(context).inferExpressionType(expression, context))
  )
}

function isMapGetCallExpression(expression: AnyNode, context: NullableFunctionContext): boolean {
  if (expression.type !== 'CallExpression') {
    return false
  }

  const callee = expression.callee

  if (callee.type !== 'MemberExpression' || callee.property !== 'get') {
    return false
  }

  if (expression.collectionKind === 'map') {
    return true
  }

  return nullableDeps(context).inferExpressionType(callee.object, context) === 'map'
}

export function emitNullableRuntimeValueVariableDeclaration(
  statement: AnyNode,
  context: NullableFunctionContext
): string[] {
  let valueType: string = 'unknown'
  const statementValueType = statement.valueType

  if (statementValueType !== null && typeof statementValueType !== 'undefined') {
    valueType = statementValueType
  }

  const expectedTag = cRuntimeValueTag(valueType)

  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, valueType)
  context.nullableVariables.add(statement.name)

  if (valueType === 'object') {
    registerObjectShape(context, statement.name, statement.shape)
  } else if (valueType === 'array') {
    let arrayElementType = 'unknown'

    if (statement.arrayElementType !== null && typeof statement.arrayElementType !== 'undefined') {
      arrayElementType = statement.arrayElementType
    }

    context.runtimeArrayElementTypes.set(statement.name, arrayElementType)
  } else if (valueType === 'map') {
    let mapKeyType = 'unknown'
    let mapValueType = 'unknown'

    if (statement.mapKeyType !== null && typeof statement.mapKeyType !== 'undefined') {
      mapKeyType = statement.mapKeyType
    }

    if (statement.mapValueType !== null && typeof statement.mapValueType !== 'undefined') {
      mapValueType = statement.mapValueType
    }

    context.mapTypes.set(statement.name, {
      key: mapKeyType,
      value: mapValueType
    })
  } else if (valueType === 'set') {
    let setElementType = 'unknown'

    if (statement.setElementType !== null && typeof statement.setElementType !== 'undefined') {
      setElementType = statement.setElementType
    }

    context.setElementTypes.set(statement.name, setElementType)
  } else if (valueType === 'function') {
    context.functionTypes.set(statement.name, normalizeNullableFunctionType(statement.functionType))
    context.runtimeCallbacks.add(statement.name)
  }

  if (statement.init === null || typeof statement.init === 'undefined' || statement.init.type === 'NullLiteral') {
    const lines: string[] = []

    appendLines(lines, emitPrepareOwnedValueWrite(statement.name))
    lines.push(`${emitCIdentifier(statement.name)} = inox_null_value();`)

    return lines
  }

  const deps = nullableDeps(context)
  const value = emitNullableRuntimeValueInitializer(statement, valueType, context, deps)

  const lines: string[] = []

  appendLines(lines, value.lines)
  lines.push(`${emitCIdentifier(statement.name)} = ${value.expression};`)
  appendLines(lines, emitRuntimeNullableValueCheck(emitCIdentifier(statement.name), expectedTag, context))

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

export function emitCOptionalMemberValueExpression(
  expression: AnyNode,
  context: NullableFunctionContext
): PreparedExpression {
  let member: CObjectFieldInfo | null = resolveKnownObjectMember(expression, context)

  if (member === null || typeof member === 'undefined') {
    member = resolveObjectExpressionMember(expression)
  }

  if (member !== null && typeof member !== 'undefined' && isRuntimeNullableType(member.valueType)) {
    const objectExpression = expression.object
    const key = member.key ?? expression.property
    const access: OptionalObjectReadAccess = {
      index: member.index,
      key,
      kind: 'key',
      objectName: nullableString(member.objectName)
    }

    return emitCOptionalObjectReadValueExpression(objectExpression, member.valueType, context, access)
  }

  return emitCOptionalDynamicObjectMemberValueExpression(expression, context)
}

function emitCOptionalDynamicObjectMemberValueExpression(
  expression: AnyNode,
  context: NullableFunctionContext
): PreparedExpression {
  const object = nullableDeps(context).emitCValueExpression(expression.object, context)
  const out = nextCName(context, 'inox_optional_member')
  const lines: string[] = []

  registerOwnedValue(context, out)
  appendLines(lines, object.lines)
  appendLines(lines, emitPrepareOwnedValueWrite(out))
  lines.push(`if (${object.expression}.tag != INOX_TAG_NULL && ${object.expression}.tag != INOX_TAG_UNDEFINED) {`)
  lines.push(`  ${out} = inox::get(${object.expression}, ${cStringLiteral(expression.property)});`)
  lines.push(`  ${emitRuntimeTypeCheck('inox::thrown()', context)}`)
  lines.push('}')

  return {
    lines,
    expression: out,
    nullable: true,
    valueType: expression.valueType ?? 'unknown'
  }
}

export function emitCOptionalIndexValueExpression(
  expression: AnyNode,
  context: NullableFunctionContext
): PreparedExpression {
  let field: CObjectIndexFieldInfo | null = resolveKnownObjectIndex(expression, context)

  if (field === null || typeof field === 'undefined') {
    field = resolveObjectExpressionIndex(expression)
  }

  if (field !== null && typeof field !== 'undefined') {
    if (!isRuntimeNullableType(field.valueType)) {
      context.diagnostics.push(
        diagnostic(
          'INOX_C_OPTIONAL_CHAINING',
          'optional object index access for this field is not supported by the current C backend slice',
          expression.loc
        )
      )

      return {
        lines: [],
        expression: 'inox_undefined_value()'
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

  if (element !== null && typeof element !== 'undefined') {
    if (!isRuntimeNullableType(element.valueType)) {
      context.diagnostics.push(
        diagnostic(
          'INOX_C_OPTIONAL_CHAINING',
          'optional array index access for this element type is not supported by the current C backend slice',
          expression.loc
        )
      )

      return {
        lines: [],
        expression: 'inox_undefined_value()'
      }
    }

    return emitCOptionalArrayIndexValueExpression(expression.object, element, context)
  }

  context.diagnostics.push(
    diagnostic(
      'INOX_C_OPTIONAL_CHAINING',
      'optional index access is not supported by the current C backend slice',
      expression.loc
    )
  )

  return {
    lines: [],
    expression: 'inox_undefined_value()'
  }
}

function emitCOptionalObjectReadValueExpression(
  objectExpression: AnyNode,
  valueType: string,
  context: NullableFunctionContext,
  access: OptionalObjectReadAccess
): PreparedExpression {
  const object = nullableDeps(context).emitCValueExpression(objectExpression, context)
  const temp = nextCName(context, 'inox_optional_value')
  const expectedTag = cRuntimeValueTag(valueType)
  const typeCheck = emitRuntimeTypeCheck(runtimeObjectReadValueMismatchCondition(object.expression), context)
  const getLines = optionalObjectReadGetLines(access, object.expression, temp, context)
  const lines: string[] = []

  registerOwnedValue(context, temp)

  appendLines(lines, object.lines)
  appendLines(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(`if (${object.expression}.tag == INOX_TAG_NULL) {`)
  lines.push(`  ${temp} = inox_null_value();`)
  lines.push('} else {')
  lines.push(`  ${typeCheck}`)
  appendPrefixedLines(lines, getLines, '  ')
  appendPrefixedLines(lines, emitRuntimeNullableValueCheck(temp, expectedTag, context), '  ')
  lines.push('}')

  return {
    lines,
    expression: temp
  }
}

function optionalObjectReadGetLines(
  access: OptionalObjectReadAccess,
  objectExpression: string,
  temp: string,
  context: NullableFunctionContext
): string[] {
  let object = objectExpression

  if (access.objectName !== null && typeof access.objectName !== 'undefined') {
    object = emitObjectValueReference(access.objectName, context)
  }

  return emitNullableObjectGetValueLines(object, access.key, temp, context)
}

function emitCOptionalArrayIndexValueExpression(
  arrayExpression: AnyNode,
  element: CRuntimeArrayElement,
  context: NullableFunctionContext
): PreparedExpression {
  const array = nullableDeps(context).emitCValueExpression(arrayExpression, context)
  const temp = nextCName(context, 'inox_optional_value')
  const expectedTag = cRuntimeValueTag(element.valueType)
  const typeCheck = emitRuntimeTypeCheck(
    `${array.expression}.tag != INOX_TAG_ARRAY || ${array.expression}.as.ref == 0`,
    context
  )
  const index = emitOptionalArrayIndexExpression(element, context)
  const lines: string[] = []

  registerOwnedValue(context, temp)

  appendLines(lines, array.lines)
  appendLines(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(`if (${array.expression}.tag == INOX_TAG_NULL) {`)
  lines.push(`  ${temp} = inox_null_value();`)
  lines.push('} else {')
  lines.push(`  ${typeCheck}`)
  appendPrefixedLines(lines, index.lines, '  ')
  lines.push(`  ${temp} = ArrayClass(${array.expression}).get(${index.expression});`)
  lines.push(`  ${emitRuntimeTypeCheck('inox::thrown()', context)}`)
  appendPrefixedLines(lines, emitRuntimeNullableValueCheck(temp, expectedTag, context), '  ')
  lines.push('}')

  return {
    lines,
    expression: temp
  }
}

function emitOptionalArrayIndexExpression(
  element: CRuntimeArrayElement,
  context: NullableFunctionContext
): PreparedExpression {
  const expression = element.indexExpression

  if (expression === null || typeof expression === 'undefined') {
    return { lines: [], expression: `${element.index}` }
  }

  const index = nullableDeps(context).emitPreparedNumberExpression(expression, context)

  return {
    lines: index.lines,
    expression: `(size_t)(${index.expression})`
  }
}

function resolveNullableOptionalRuntimeArrayIndex(
  expression: AnyNode,
  context: NullableFunctionContext
): CRuntimeArrayElement | null {
  if (expression.type !== 'OptionalIndexExpression') {
    return null
  }

  const valueType = resolveNullableRuntimeArrayElementType(expression.object, context)

  if (valueType === null || typeof valueType === 'undefined') {
    return null
  }

  if (expression.index.type !== 'NumberLiteral') {
    if (nullableDeps(context).inferExpressionType(expression.index, context) !== 'number') {
      return null
    }

    return {
      index: 0,
      indexExpression: expression.index,
      valueType
    }
  }

  const index = parseNonNegativeIntegerLiteral(expression.index.value)

  if (index < 0) {
    return null
  }

  return { index, indexExpression: null, valueType }
}

function resolveNullableRuntimeArrayElementType(expression: AnyNode, context: NullableFunctionContext): string | null {
  if (expression.type === 'Reference' && expression.path.length === 1) {
    const name = nullableStringAt(expression.path, 0)
    const runtimeElementType = context.runtimeArrayElementTypes.get(name)

    if (runtimeElementType === null || typeof runtimeElementType === 'undefined') {
      return null
    }

    return runtimeElementType
  }

  if (expression.type === 'CallExpression') {
    if (expression.valueType !== 'array') {
      return null
    }

    if (expression.arrayElementType !== null && typeof expression.arrayElementType !== 'undefined') {
      return expression.arrayElementType
    }

    const functionReturn = resolveNullableFunctionReturnNameFromCall(expression)

    if (functionReturn !== null && typeof functionReturn !== 'undefined') {
      const functionElementType = context.functionReturnArrayElementTypes.get(functionReturn)

      if (functionElementType !== null && typeof functionElementType !== 'undefined') {
        return functionElementType
      }
    }

    return 'unknown'
  }

  if (expression.type === 'MemberExpression') {
    const member = resolveKnownObjectMember(expression, context)

    if (member === null || typeof member === 'undefined' || member.valueType !== 'array') {
      return null
    }

    if (member.arrayElementType !== null && typeof member.arrayElementType !== 'undefined') {
      return member.arrayElementType
    }

    return 'unknown'
  }

  if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
    const field = resolveKnownObjectIndex(expression, context)

    if (field === null || typeof field === 'undefined' || field.valueType !== 'array') {
      return null
    }

    if (field.arrayElementType !== null && typeof field.arrayElementType !== 'undefined') {
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
  if (expression.callee.type === 'Reference' && expression.callee.path.length === 1) {
    return nullableStringAt(expression.callee.path, 0)
  }

  return null
}

function normalizeNullableFunctionType(functionType: CFunctionType | null | undefined): CFunctionType {
  if (functionType !== null && typeof functionType !== 'undefined') {
    return functionType
  }

  return {
    kind: 'function',
    params: [],
    returnType: 'void'
  }
}
