import { diagnostic } from '../../diagnostics.ts'
import type { AnyNode, Diagnostic } from '../../types.ts'
import { isPlainFunctionPointerType, isRuntimeFunctionType } from '../async/callbacks.ts'
import {
  emitPrepareOwnedValueWrite,
  emitFailureStatement,
  emitRuntimeTypeCheck,
  emitStatusCheck,
  nextCName,
  registerOwnedValue
} from '../context.ts'
import { cStringLiteral, emitCIdentifier, emitCObjectFunctionFieldName, utf8ByteLength } from '../identifiers.ts'
import {
  emitRuntimeFieldValueCheck,
  runtimeObjectApiValueMismatchCondition,
  runtimeObjectLikeValueMismatchCondition
} from '../runtime-values.ts'
import { cUnsupportedExpressionCode } from '../syntax.ts'
import type {
  CFunctionType,
  CKnownObjectField,
  CKnownObjectIndexField,
  CKnownObjectMemberField,
  CObjectFieldInfo,
  CObjectIndexFieldInfo,
  CObjectShape,
  CObjectShapeField,
  CPreparedExpression as PreparedExpression,
  CPreparedStringBytesOperand as PreparedStringBytesOperand
} from '../types.ts'
import { isReadonlyCObjectShapeField } from '../types.ts'
import {
  cRuntimeValueTag,
  isManagedRuntimeReturnType,
  isNullableScalarType,
  isOpaqueRuntimeValueType
} from '../value-types.ts'
import {
  compilerAnyNodeArrayFields,
  compilerAnyNodeBooleanFields,
  compilerAnyNodeObjectFields,
  compilerAnyNodeStringFields,
  compilerAnyNodeUnknownFields
} from './any-node-fields.ts'
import { inferExpressionType } from './types.ts'
import { emitPreparedStringBytesOperand } from './strings.ts'
import { emitCValueExpression } from './expressions.ts'

type ObjectShapeContext = {
  objectAliases?: Map<string, string>
  objectDeclaredTypes?: Map<string, string | null>
  objectShapes: Map<string, CObjectShapeField[]>
}

type ObjectNameContext = {
  boxedVariables: Set<string>
  localValueNames?: Set<string>
  moduleValueNames?: Map<string, string>
  variables: Map<string, string>
}

type ObjectFunctionContext = ObjectShapeContext &
  ObjectNameContext & {
    cleanupEnabled: boolean
    diagnostics: Diagnostic[]
    errorChannelUsed?: boolean
    errorTargetActiveFlags?: boolean[]
    errorTargets?: string[]
    failureStatement?: string | null
    failureStatementUsed?: boolean
    nextId: number
    ownedValues: string[]
    returnType?: string
    statusReturn: boolean
    throwingFunction: boolean
    usedCleanupGoto: boolean
  }

type ObjectFieldNode = AnyNode
type ObjectPropertyNode = {
  key: string
  loc?: any
  spread?: boolean
  value: ObjectFieldNode
}

type PreparedObjectSpread = {
  name: string
  property: ObjectPropertyNode
}

type ObjectFunctionFieldSource = {
  expression: ObjectFieldNode | null
  loc?: any
  pathName: string | null
}

export type ObjectVariableDeclarationDependencies = {
  emitCFieldFlags(field: CObjectShapeField): string
  emitObjectFieldValueExpression(
    field: CObjectShapeField,
    value: AnyNode,
    context: ObjectFunctionContext
  ): PreparedExpression
  emitFunctionPointerVariable(
    name: string,
    init: AnyNode,
    context: ObjectFunctionContext,
    isConst: boolean,
    functionType: CFunctionType | null | undefined,
    loc: AnyNode['loc'],
    seenTypes?: string[]
  ): string
  emitFunctionPointerVariableWithCInitializer(
    name: string,
    init: string,
    context: ObjectFunctionContext,
    isConst: boolean,
    functionType: CFunctionType | null | undefined,
    loc: AnyNode['loc'],
    seenTypes?: string[]
  ): string
  emitRuntimeCallbackValueInto(
    expression: AnyNode,
    functionType: CFunctionType | null | undefined,
    out: string,
    context: ObjectFunctionContext
  ): string[]
  emitCValueExpression(expression: AnyNode, context: ObjectFunctionContext): PreparedExpression
  inferExpressionType(expression: AnyNode, context: ObjectFunctionContext): string
  resolveFunctionValueType(expression: AnyNode, context: ObjectFunctionContext): CFunctionType | null
}

export type ObjectExpressionFieldDependencies = {
  emitCValueExpression(expression: ObjectFieldNode, context: ObjectFunctionContext): PreparedExpression
  emitPreparedStringBytesOperand(
    expression: ObjectFieldNode,
    context: ObjectFunctionContext,
    tempPrefix: string
  ): PreparedStringBytesOperand
  inferExpressionType(expression: ObjectFieldNode, context: ObjectFunctionContext): string
}

type KnownObjectFieldReadAccess = {
  index: number
  key: string
  kind: string
  objectName: string
}

type CDynamicObjectFieldAccess = {
  object: ObjectFieldNode
  key: string
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

function isOptionalChainContinuationReceiver(expression: AnyNode): boolean {
  return (
    expression.optionalChainProtected === true ||
    expression.type === 'OptionalMemberExpression' ||
    expression.type === 'OptionalIndexExpression'
  )
}

function currentObjectErrorTarget(context: ObjectFunctionContext): string {
  const targets = context.errorTargets

  if (targets === null || typeof targets === 'undefined' || targets.length === 0) {
    return ''
  }

  return targets[targets.length - 1]
}

function currentObjectErrorTargetRequiresActive(context: ObjectFunctionContext): boolean {
  const flags = context.errorTargetActiveFlags

  if (flags === null || typeof flags === 'undefined' || flags.length === 0) {
    return false
  }

  return flags[flags.length - 1]
}

function registerObjectErrorValue(context: ObjectFunctionContext): void {
  registerOwnedValue(context, 'inox_error')
}

function registerObjectErrorChannel(context: ObjectFunctionContext): void {
  context.errorChannelUsed = true
  registerObjectErrorValue(context)
}

function emitObjectThrownCheckLines(context: ObjectFunctionContext): string[] {
  const target = currentObjectErrorTarget(context)

  if (target === '' && !context.throwingFunction) {
    return [`if (inox::thrown()) ${emitFailureStatement(context)}`]
  }

  const errorActiveNeeded = currentObjectErrorTargetRequiresActive(context) || (target === '' && context.throwingFunction)

  if (errorActiveNeeded) {
    registerObjectErrorChannel(context)
  } else if (target === '') {
    registerObjectErrorValue(context)
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

function findObjectShapeFieldIndex(fields: CObjectShapeField[], key: string): number {
  for (let index = 0; index < fields.length; index = index + 1) {
    const field: AnyNode = fields[index]

    if (field.name === key) {
      return index
    }
  }

  return -1
}

export function appendCompilerAnyNodeFallbackShapeFields(fields: CObjectShapeField[]): void {
  appendCompilerAnyNodeFallbackShapeFieldGroup(fields, compilerAnyNodeStringFields, 'string')
  appendCompilerAnyNodeFallbackShapeFieldGroup(fields, compilerAnyNodeBooleanFields, 'boolean')
  appendCompilerAnyNodeFallbackShapeFieldGroup(fields, compilerAnyNodeArrayFields, 'array')
  appendCompilerAnyNodeFallbackShapeFieldGroup(fields, compilerAnyNodeObjectFields, 'object', 'AnyNode', {
    builtin: 'compiler.AnyNode'
  })
  appendCompilerAnyNodeFallbackShapeFieldGroup(fields, compilerAnyNodeUnknownFields, 'unknown')
}

export function appendCompilerObjectShapeInfoFallbackShapeFields(fields: CObjectShapeField[]): void {
  appendCompilerAnyNodeFallbackShapeFieldGroup(fields, ['builtin'], 'string')
  appendCompilerAnyNodeFallbackShapeFieldGroup(fields, ['dynamicField'], 'object', 'AnyNode', {
    builtin: 'compiler.AnyNode'
  })
}

function appendCompilerAnyNodeFallbackShapeFieldGroup(
  fields: CObjectShapeField[],
  names: readonly string[],
  valueType: string,
  declaredType: string | null = null,
  shape: CObjectShape | null = null
): void {
  for (const name of names) {
    if (findObjectShapeFieldIndex(fields, name) !== -1) {
      continue
    }

    const field: CObjectShapeField = {
      name,
      optional: true,
      readonlyField: false,
      valueType
    }

    if (declaredType !== null && typeof declaredType !== 'undefined') {
      field.declaredType = declaredType
    }

    if (shape !== null && typeof shape !== 'undefined') {
      field.shape = shape
    }

    fields.push(field)
  }
}

function objectShapeFieldAt(fields: CObjectShapeField[], expectedIndex: number): CObjectShapeField | null {
  for (let index = 0; index < fields.length; index = index + 1) {
    if (index === expectedIndex) {
      return fields[index]
    }
  }

  return null
}

function findObjectProperty(properties: ObjectPropertyNode[], key: string): ObjectPropertyNode | null {
  for (const property of properties) {
    if (property.spread === true) {
      continue
    }

    const propertyKey: string = property.key

    if (propertyKey === key) {
      return property
    }
  }

  return null
}

function objectFunctionFieldSource(expression: ObjectFieldNode): ObjectFunctionFieldSource {
  return {
    expression,
    loc: expression.loc,
    pathName: resolveCObjectExpressionPathName(expression)
  }
}

function nestedObjectFunctionFieldSource(
  source: ObjectFunctionFieldSource,
  fieldName: string
): ObjectFunctionFieldSource {
  const propertyValue = objectFunctionFieldSourcePropertyValue(source, fieldName)

  if (propertyValue !== null && typeof propertyValue !== 'undefined') {
    const pathName = resolveCObjectExpressionPathName(propertyValue)

    return {
      expression: propertyValue,
      loc: propertyValue.loc ?? source.loc,
      pathName: pathName ?? nestedObjectPathName(source.pathName, fieldName)
    }
  }

  return {
    expression: null,
    loc: source.loc,
    pathName: nestedObjectPathName(source.pathName, fieldName)
  }
}

function objectFunctionFieldSourcePropertyValue(
  source: ObjectFunctionFieldSource,
  fieldName: string
): ObjectFieldNode | null {
  const expression = source.expression

  if (expression === null || typeof expression === 'undefined' || expression.type !== 'ObjectLiteral') {
    return null
  }

  const property = findObjectProperty(objectNodeProperties(expression), fieldName)

  if (property === null || typeof property === 'undefined') {
    return null
  }

  return property.value
}

function nestedObjectPathName(pathName: string | null, fieldName: string): string | null {
  if (pathName === null || typeof pathName === 'undefined') {
    return null
  }

  return `${pathName}_${fieldName}`
}

function resolveCObjectExpressionPathName(expression: AnyNode): string | null {
  if (expression.type === 'Reference' && expression.path.length === 1) {
    return expression.path[0]
  }

  if (expression.type === 'ThisExpression') {
    return 'this'
  }

  if (expression.type === 'MemberExpression') {
    const objectName = resolveCObjectExpressionPathName(expression.object)

    if (objectName !== null && typeof objectName !== 'undefined') {
      return `${objectName}_${expression.property}`
    }
  }

  if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
    const objectName = resolveCObjectExpressionPathName(expression.object)

    if (objectName !== null && typeof objectName !== 'undefined') {
      return `${objectName}_${expression.index.value}`
    }
  }

  return null
}

function objectShapeFieldOwnership(field: CObjectShapeField): string {
  const ownership = field.ownership

  if (ownership !== null && typeof ownership !== 'undefined') {
    return ownership
  }

  return 'strong'
}

function normalizedObjectShapeField(field: CObjectShapeField): CObjectShapeField {
  return {
    name: field.name,
    optional: field.optional,
    ownership: objectShapeFieldOwnership(field),
    readonly: field.readonly,
    readonlyField: isReadonlyCObjectShapeField(field),
    nullable: field.nullable,
    loc: field.loc,
    declaredType: field.declaredType,
    valueType: field.valueType,
    arrayElementType: field.arrayElementType,
    arrayElementDeclaredType: field.arrayElementDeclaredType,
    mapKeyType: field.mapKeyType,
    mapValueType: field.mapValueType,
    promiseValueType: field.promiseValueType,
    setElementType: field.setElementType,
    libraryCMember: field.libraryCMember,
    libraryCppType: field.libraryCppType,
    functionTypeOwnership: field.functionTypeOwnership,
    shape: field.shape,
    shapeOwnership: field.shapeOwnership,
    functionType: field.functionType
  }
}

function normalizeObjectShapeFields(fields: CObjectShapeField[]): CObjectShapeField[] {
  const normalized: CObjectShapeField[] = []

  for (const field of fields) {
    normalized.push(normalizedObjectShapeField(field))
  }

  return normalized
}

function registerObjectShapeFields(
  context: ObjectShapeContext,
  name: string,
  fields: CObjectShapeField[],
  seen: Set<CObjectShape>
): void {
  const normalized = normalizeObjectShapeFields(fields)

  context.objectShapes.set(name, normalized)

  for (const field of normalized) {
    const shape = field.shape
    const fieldPath = `${name}_${field.name}`

    if (
      field.declaredType !== null &&
      typeof field.declaredType !== 'undefined' &&
      context.objectDeclaredTypes !== null &&
      typeof context.objectDeclaredTypes !== 'undefined'
    ) {
      context.objectDeclaredTypes.set(fieldPath, field.declaredType)
    }

    if (
      field.valueType !== 'object' ||
      shape === null ||
      typeof shape === 'undefined' ||
      shape.builtin === 'compiler.AnyNode' ||
      shape.fields === null ||
      typeof shape.fields === 'undefined' ||
      seen.has(shape)
    ) {
      continue
    }

    seen.add(shape)
    registerObjectShapeFields(context, fieldPath, shape.fields, seen)
    seen.delete(shape)
  }
}

export function isMemberAccessExpression(expression: AnyNode): boolean {
  return expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression'
}

export function isIndexAccessExpression(expression: AnyNode): boolean {
  return expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression'
}

export function resolveKnownObjectMember(
  expression: AnyNode,
  context: ObjectFunctionContext
): CKnownObjectMemberField | null {
  const referenceField = resolveKnownObjectReferenceMember(expression, context)

  if (referenceField !== null && typeof referenceField !== 'undefined') {
    return referenceField
  }

  if (!isMemberAccessExpression(expression)) {
    return null
  }

  if (isCompilerAnyNodeExpression(expression.object)) {
    return null
  }

  const objectName = resolveCObjectExpressionName(expression.object)

  if (objectName !== null && typeof objectName !== 'undefined') {
    const fields = objectShapeFieldsForLookup(context, objectName)

    if (fields !== null && typeof fields !== 'undefined') {
      const index = findObjectShapeFieldIndex(fields, expression.property)

      if (index !== -1) {
        const field = fields[index]

        if (field !== null && typeof field !== 'undefined') {
          return knownObjectMemberField(objectName, index, field)
        }
      }
    }
  }

  return null
}

function resolveKnownObjectReferenceMember(
  expression: AnyNode,
  context: ObjectFunctionContext
): CKnownObjectMemberField | null {
  if (expression.type !== 'Reference' || expression.path.length <= 1) {
    return null
  }

  const fieldName = expression.path[expression.path.length - 1]
  const objectName = referenceObjectPathName(expression.path)
  const fields = objectShapeFieldsForLookup(context, objectName)

  if (fields === null || typeof fields === 'undefined') {
    return null
  }

  const index = findObjectShapeFieldIndex(fields, fieldName)

  if (index === -1) {
    return null
  }

  const field = fields[index]

  if (field === null || typeof field === 'undefined') {
    return null
  }

  return knownObjectMemberField(objectName, index, field)
}

function referenceObjectPathName(path: string[]): string {
  let result = path[0]

  for (let index = 1; index < path.length - 1; index = index + 1) {
    result = `${result}_${path[index]}`
  }

  return result
}

function knownObjectMemberField(objectName: string, index: number, field: CObjectShapeField): CKnownObjectMemberField {
  return {
    objectName,
    key: field.name,
    index,
    optional: field.optional,
    nullable: field.nullable,
    valueType: field.valueType,
    arrayElementType: field.arrayElementType,
    declaredType: field.declaredType,
    mapKeyType: field.mapKeyType,
    mapValueType: field.mapValueType,
    setElementType: field.setElementType,
    shape: field.shape,
    functionType: field.functionType
  }
}

export function resolveObjectExpressionMember(expression: AnyNode): CObjectFieldInfo | null {
  if (!isMemberAccessExpression(expression)) {
    return null
  }

  return resolveObjectExpressionShapeField(expression.object, expression.property)
}

export function emitObjectValueReference(name: string, context: ObjectFunctionContext): string {
  const moduleValueNames = context.moduleValueNames
  let moduleValueName: string | null = null

  if (
    moduleValueNames !== null &&
    typeof moduleValueNames !== 'undefined' &&
    (context.localValueNames === null ||
      typeof context.localValueNames === 'undefined' ||
      !context.localValueNames.has(name))
  ) {
    const value = moduleValueNames.get(name)

    if (value !== null && typeof value !== 'undefined') {
      moduleValueName = value
    }
  }

  if (moduleValueName !== null && typeof moduleValueName !== 'undefined') {
    return moduleValueName
  }

  if (context.boxedVariables.has(name) && context.variables.get(name) === 'object') {
    return `(*${emitCIdentifier(name)})`
  }

  return emitCIdentifier(name)
}

export function resolveKnownObjectIndex(
  expression: AnyNode,
  context: ObjectFunctionContext
): CKnownObjectIndexField | null {
  if (!isIndexAccessExpression(expression) || expression.index.type !== 'StringLiteral') {
    return null
  }

  if (isCompilerAnyNodeExpression(expression.object)) {
    return null
  }

  const objectName = resolveCObjectExpressionName(expression.object)

  if (objectName !== null && typeof objectName !== 'undefined') {
    const fields = objectShapeFieldsForLookup(context, objectName)

    if (fields !== null && typeof fields !== 'undefined') {
      const index = findObjectShapeFieldIndex(fields, expression.index.value)

      if (index !== -1) {
        const field = fields[index]

        if (field !== null && typeof field !== 'undefined') {
          return knownObjectIndexField(objectName, expression.index.value, index, field)
        }
      }
    }
  }

  return null
}

function isCompilerAnyNodeExpression(expression: AnyNode | null | undefined): boolean {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.shape === null ||
    typeof expression.shape === 'undefined'
  ) {
    return false
  }

  return expression.shape.builtin === 'compiler.AnyNode'
}

function objectShapeFieldsForLookup(
  context: ObjectShapeContext,
  objectName: string
): CObjectShapeField[] | null {
  const fields = context.objectShapes.get(objectName)

  if (fields !== null && typeof fields !== 'undefined') {
    return fields
  }

  const aliases = context.objectAliases

  if (aliases === null || typeof aliases === 'undefined') {
    return null
  }

  const alias = aliases.get(objectName)

  if (alias === null || typeof alias === 'undefined') {
    return null
  }

  const aliasedFields = context.objectShapes.get(alias)

  if (aliasedFields !== null && typeof aliasedFields !== 'undefined') {
    return aliasedFields
  }

  return null
}

function isCompilerAnyNodeShape(shape: CObjectShape | null | undefined): boolean {
  return shape !== null && typeof shape !== 'undefined' && shape.builtin === 'compiler.AnyNode'
}

function isEmptyObjectShape(shape: CObjectShape | null | undefined): boolean {
  return (
    shape !== null &&
    typeof shape !== 'undefined' &&
    shape.fields !== null &&
    typeof shape.fields !== 'undefined' &&
    shape.fields.length === 0
  )
}

function knownObjectIndexField(
  objectName: string,
  key: string,
  index: number,
  field: CObjectShapeField
): CKnownObjectIndexField {
  return {
    objectName,
    key,
    index,
    optional: field.optional,
    nullable: field.nullable,
    valueType: field.valueType,
    arrayElementType: field.arrayElementType,
    declaredType: field.declaredType,
    mapKeyType: field.mapKeyType,
    mapValueType: field.mapValueType,
    setElementType: field.setElementType,
    shape: field.shape,
    functionType: field.functionType
  }
}

export function resolveObjectExpressionIndex(expression: AnyNode): CObjectIndexFieldInfo | null {
  if (!isIndexAccessExpression(expression) || expression.index.type !== 'StringLiteral') {
    return null
  }

  return resolveObjectExpressionShapeField(expression.object, expression.index.value)
}

function resolveObjectExpressionShapeField(objectExpression: AnyNode, key: string): CObjectIndexFieldInfo | null {
  if (isCompilerAnyNodeExpression(objectExpression)) {
    return null
  }

  if (
    objectExpression.shape === null ||
    typeof objectExpression.shape === 'undefined' ||
    objectExpression.shape.fields === null ||
    typeof objectExpression.shape.fields === 'undefined'
  ) {
    return null
  }

  const fields = objectExpression.shape.fields

  const index = findObjectShapeFieldIndex(fields, key)

  if (index === -1) {
    return null
  }

  const field = objectShapeFieldAt(fields, index)

  if (field === null || typeof field === 'undefined') {
    return null
  }

  return {
    key,
    index,
    optional: field.optional,
    nullable: field.nullable,
    valueType: field.valueType,
    arrayElementType: field.arrayElementType,
    declaredType: field.declaredType,
    mapKeyType: field.mapKeyType,
    mapValueType: field.mapValueType,
    setElementType: field.setElementType,
    shape: field.shape,
    functionType: field.functionType
  }
}

export function resolveCObjectExpressionName(expression: AnyNode): string | null {
  if (expression.type === 'Reference' && expression.path.length === 1) {
    return expression.path[0]
  }

  if (expression.type === 'ThisExpression') {
    return 'this'
  }

  return null
}

export function updateKnownObjectMemberValueType(
  member: CKnownObjectField,
  valueType: string,
  context: ObjectFunctionContext
): void {
  if (valueType === 'unknown') {
    return
  }

  const objectName = member.objectName
  const fields = context.objectShapes.get(objectName)

  if (fields !== null && typeof fields !== 'undefined') {
    const field = objectShapeFieldAt(fields, member.index)

    if (field !== null && typeof field !== 'undefined') {
      field.valueType = valueType
    }
  }
}

export function emitPreparedKnownObjectMemberValueExpression(
  expression: AnyNode,
  context: ObjectFunctionContext
): PreparedExpression | null {
  const member = resolveKnownObjectMember(expression, context)

  if (member !== null && typeof member !== 'undefined') {
    const access: KnownObjectFieldReadAccess = {
      index: member.index,
      key: member.key ?? expression.property,
      kind: 'key',
      objectName: member.objectName
    }

    return emitPreparedKnownObjectFieldValueExpression(member, expression, context, access)
  }

  return null
}

export function emitPreparedKnownObjectIndexValueExpression(
  expression: AnyNode,
  context: ObjectFunctionContext
): PreparedExpression | null {
  const field = resolveKnownObjectIndex(expression, context)

  if (field !== null && typeof field !== 'undefined') {
    const access: KnownObjectFieldReadAccess = {
      index: field.index,
      key: field.key,
      kind: 'key',
      objectName: field.objectName
    }

    return emitPreparedKnownObjectFieldValueExpression(field, expression, context, access)
  }

  return null
}

export function emitPreparedObjectExpressionMemberValueExpression(
  expression: AnyNode,
  context: ObjectFunctionContext,
  dependencies: ObjectExpressionFieldDependencies
): PreparedExpression | null {
  const member = resolveObjectExpressionMember(expression)

  if (member !== null && typeof member !== 'undefined') {
    return emitPreparedObjectExpressionFieldValueExpression(
      member,
      expression,
      expression.object,
      context,
      dependencies
    )
  }

  return null
}

export function emitPreparedObjectExpressionScalarMemberValueExpression(
  expression: AnyNode,
  context: ObjectFunctionContext,
  dependencies: ObjectExpressionFieldDependencies
): PreparedExpression | null {
  const member = resolveObjectExpressionMember(expression)

  if (member !== null && typeof member !== 'undefined' && isScalarObjectFieldValueType(member.valueType)) {
    return emitPreparedObjectExpressionFieldValueExpression(
      member,
      expression,
      expression.object,
      context,
      dependencies
    )
  }

  return null
}

export function emitPreparedObjectExpressionIndexValueExpression(
  expression: AnyNode,
  context: ObjectFunctionContext,
  dependencies: ObjectExpressionFieldDependencies
): PreparedExpression | null {
  const field = resolveObjectExpressionIndex(expression)

  if (field !== null && typeof field !== 'undefined') {
    return emitPreparedObjectExpressionFieldValueExpression(field, expression, expression.object, context, dependencies)
  }

  return null
}

export function emitPreparedDynamicObjectMemberValueExpression(
  expression: ObjectFieldNode,
  context: ObjectFunctionContext,
  dependencies: ObjectExpressionFieldDependencies
): PreparedExpression | null {
  if (!isMemberAccessExpression(expression)) {
    return null
  }

  return emitPreparedDynamicObjectFieldValueExpression(
    expression,
    expression.object,
    expression.property,
    context,
    dependencies
  )
}

export function emitPreparedDynamicObjectIndexValueExpression(
  expression: ObjectFieldNode,
  context: ObjectFunctionContext,
  dependencies: ObjectExpressionFieldDependencies
): PreparedExpression | null {
  if (!isIndexAccessExpression(expression)) {
    return null
  }

  if (expression.index.type !== 'StringLiteral') {
    return emitPreparedDynamicObjectIndexExpressionValueExpression(expression, context, dependencies)
  }

  return emitPreparedDynamicObjectFieldValueExpression(
    expression,
    expression.object,
    expression.index.value,
    context,
    dependencies
  )
}

function emitPreparedDynamicObjectIndexExpressionValueExpression(
  expression: ObjectFieldNode,
  context: ObjectFunctionContext,
  dependencies: ObjectExpressionFieldDependencies
): PreparedExpression | null {
  if (dependencies.inferExpressionType(expression.object, context) !== 'object') {
    return null
  }

  if (dependencies.inferExpressionType(expression.index, context) !== 'string') {
    return null
  }

  const object = dependencies.emitCValueExpression(expression.object, context)
  const key = dependencies.emitPreparedStringBytesOperand(expression.index, context, 'inox_object_key')
  const temp = nextCName(context, 'inox_value')
  const tag = cRuntimeValueTag(expression.valueType)
  const lines: string[] = []

  appendLines(lines, object.lines)
  appendLines(lines, key.lines)
  lines.push(`auto ${temp} = inox::get(${object.expression}, inox::StringView(${key.bytes}, ${key.length}));`)
  appendLines(lines, emitObjectThrownCheckLines(context))
  appendLines(lines, emitRuntimeOptionalObjectFieldValueCheck(temp, tag, context))

  return {
    lines,
    expression: temp,
    cppType: 'inox::Value',
    valueType: expression.valueType
  }
}

export function emitDynamicObjectFieldAssignment(
  expression: ObjectFieldNode,
  context: ObjectFunctionContext,
  dependencies: ObjectExpressionFieldDependencies
): string[] | null {
  if (expression.type !== 'AssignmentExpression') {
    return null
  }

  const target = expression.target

  if (target.type === 'MemberExpression') {
    const assignment = emitDynamicObjectFieldAssignmentLines(
      expression,
      target.object,
      target.property,
      context,
      dependencies
    )

    if (assignment !== null && typeof assignment !== 'undefined') {
      return assignment
    }

    return emitDynamicRuntimeObjectFieldAssignmentLines(
      expression,
      target.object,
      target.property,
      context,
      dependencies
    )
  }

  if (target.type === 'IndexExpression' && target.index.type === 'StringLiteral') {
    const assignment = emitDynamicObjectFieldAssignmentLines(
      expression,
      target.object,
      target.index.value,
      context,
      dependencies
    )

    if (assignment !== null && typeof assignment !== 'undefined') {
      return assignment
    }

    return emitDynamicRuntimeObjectFieldAssignmentLines(
      expression,
      target.object,
      target.index.value,
      context,
      dependencies
    )
  }

  if (target.type === 'IndexExpression') {
    return emitDynamicObjectIndexAssignmentLines(
      expression,
      target.object,
      target.index,
      context,
      dependencies
    )
  }

  return null
}

function emitDynamicObjectIndexAssignmentLines(
  expression: ObjectFieldNode,
  objectExpression: ObjectFieldNode,
  keyExpression: ObjectFieldNode,
  context: ObjectFunctionContext,
  dependencies: ObjectExpressionFieldDependencies
): string[] | null {
  if (
    dependencies.inferExpressionType(objectExpression, context) !== 'object' ||
    dependencies.inferExpressionType(keyExpression, context) !== 'string'
  ) {
    return null
  }

  const object = dependencies.emitCValueExpression(objectExpression, context)
  const key = dependencies.emitPreparedStringBytesOperand(keyExpression, context, 'inox_object_key')
  const value = dependencies.emitCValueExpression(expression.value, context)
  const lines: string[] = []

  appendLines(lines, object.lines)
  appendLines(lines, key.lines)
  appendLines(lines, value.lines)
  lines.push(
    emitStatusCheck(
      `inox_object_set(${object.expression}, ${key.bytes}, ${key.length}, ${value.expression})`,
      context
    )
  )

  return lines
}

export function emitPreparedObjectExpressionScalarIndexValueExpression(
  expression: AnyNode,
  context: ObjectFunctionContext,
  dependencies: ObjectExpressionFieldDependencies
): PreparedExpression | null {
  const field = resolveObjectExpressionIndex(expression)

  if (field !== null && typeof field !== 'undefined' && isScalarObjectFieldValueType(field.valueType)) {
    return emitPreparedObjectExpressionFieldValueExpression(field, expression, expression.object, context, dependencies)
  }

  return null
}

function emitPreparedKnownObjectFieldValueExpression(
  field: CKnownObjectField,
  expression: AnyNode,
  context: ObjectFunctionContext,
  access: KnownObjectFieldReadAccess
): PreparedExpression | null {
  if (!isManagedObjectFieldValueType(field.valueType)) {
    return null
  }

  const temp = nextCName(context, 'inox_value')
  const tag = cRuntimeValueTag(field.valueType)
  const object = emitObjectValueReference(access.objectName, context)
  const lines: string[] = []

  lines.push(`auto ${temp} = inox::get(${object}, ${cStringLiteral(access.key)});`)
  appendLines(lines, emitObjectThrownCheckLines(context))
  appendLines(lines, emitKnownObjectFieldValueCheck(temp, tag, field, expression, context))

  return {
    lines,
    expression: temp,
    cppType: 'inox::Value'
  }
}

function emitPreparedObjectExpressionFieldValueExpression(
  field: CObjectFieldInfo,
  expression: AnyNode,
  objectExpression: AnyNode,
  context: ObjectFunctionContext,
  dependencies: ObjectExpressionFieldDependencies
): PreparedExpression | null {
  if (!isManagedObjectFieldValueType(field.valueType)) {
    return null
  }

  if (field.key === null || typeof field.key === 'undefined') {
    return null
  }

  const object = dependencies.emitCValueExpression(objectExpression, context)
  const temp = nextCName(context, 'inox_value')
  const tag = cRuntimeValueTag(field.valueType)
  const lines: string[] = []

  if (isOptionalChainContinuationReceiver(objectExpression)) {
    registerOwnedValue(context, temp)
    appendLines(lines, object.lines)
    appendLines(lines, emitPrepareOwnedValueWrite(temp))
    lines.push(`if (${object.expression}.tag == INOX_TAG_NULL || ${object.expression}.tag == INOX_TAG_UNDEFINED) {`)
    lines.push(`  ${temp} = inox_null_value();`)
    lines.push('} else {')
    lines.push(`  ${emitRuntimeTypeCheck(runtimeObjectLikeValueMismatchCondition(object.expression), context)}`)
    lines.push(`  ${temp} = inox::get(${object.expression}, ${cStringLiteral(field.key)});`)
    appendPrefixedLines(lines, emitObjectThrownCheckLines(context), '  ')
    appendPrefixedLines(lines, emitRuntimeOptionalObjectFieldValueCheck(temp, tag, context), '  ')
    lines.push('}')

    return {
      lines,
      expression: temp,
      cppType: 'inox::Value',
      valueType: field.valueType
    }
  }

  appendLines(lines, object.lines)
  lines.push(`auto ${temp} = inox::get(${object.expression}, ${cStringLiteral(field.key)});`)
  appendLines(lines, emitObjectThrownCheckLines(context))
  if (objectFieldValueMayBeNullish(field)) {
    appendLines(lines, emitRuntimeOptionalObjectFieldValueCheck(temp, tag, context))
  } else {
    appendLines(lines, emitRuntimeFieldValueCheck(temp, tag, expression, context))
  }

  return {
    lines,
    expression: temp,
    cppType: 'inox::Value',
    valueType: field.valueType
  }
}

function emitPreparedDynamicObjectFieldValueExpression(
  expression: ObjectFieldNode,
  objectExpression: ObjectFieldNode,
  key: string,
  context: ObjectFunctionContext,
  dependencies: ObjectExpressionFieldDependencies
): PreparedExpression | null {
  if (dependencies.inferExpressionType(objectExpression, context) !== 'object') {
    return null
  }

  const object = dependencies.emitCValueExpression(objectExpression, context)
  const temp = nextCName(context, 'inox_value')
  const tag = cRuntimeValueTag(expression.valueType)
  const lines: string[] = []

  if (isOptionalChainContinuationReceiver(objectExpression)) {
    registerOwnedValue(context, temp)
    appendLines(lines, object.lines)
    appendLines(lines, emitPrepareOwnedValueWrite(temp))
    lines.push(`if (${object.expression}.tag == INOX_TAG_NULL || ${object.expression}.tag == INOX_TAG_UNDEFINED) {`)
    lines.push(`  ${temp} = inox_null_value();`)
    lines.push('} else {')
    lines.push(`  ${emitRuntimeTypeCheck(runtimeObjectLikeValueMismatchCondition(object.expression), context)}`)
    lines.push(`  ${temp} = inox::get(${object.expression}, ${cStringLiteral(key)});`)
    appendPrefixedLines(lines, emitObjectThrownCheckLines(context), '  ')
    appendPrefixedLines(lines, emitRuntimeOptionalObjectFieldValueCheck(temp, tag, context), '  ')
    lines.push('}')

    return {
      lines,
      expression: temp,
      cppType: 'inox::Value',
      valueType: expression.valueType
    }
  }

  appendLines(lines, object.lines)
  lines.push(`auto ${temp} = inox::get(${object.expression}, ${cStringLiteral(key)});`)
  appendLines(lines, emitObjectThrownCheckLines(context))
  appendLines(lines, emitRuntimeOptionalObjectFieldValueCheck(temp, tag, context))

  return {
    lines,
    expression: temp,
    cppType: 'inox::Value',
    valueType: expression.valueType
  }
}

function emitDynamicObjectFieldAssignmentLines(
  expression: ObjectFieldNode,
  objectExpression: ObjectFieldNode,
  key: string,
  context: ObjectFunctionContext,
  dependencies: ObjectExpressionFieldDependencies
): string[] | null {
  if (dependencies.inferExpressionType(objectExpression, context) !== 'object') {
    return null
  }

  const object = dependencies.emitCValueExpression(objectExpression, context)
  const value = dependencies.emitCValueExpression(expression.value, context)
  const lines: string[] = []

  appendLines(lines, object.lines)
  appendLines(lines, value.lines)
  lines.push(
    emitStatusCheck(
      `inox_object_set(${object.expression}, ${cStringLiteral(key)}, ${utf8ByteLength(key)}, ${value.expression})`,
      context
    )
  )

  return lines
}

function emitDynamicRuntimeObjectFieldAssignmentLines(
  expression: ObjectFieldNode,
  objectExpression: ObjectFieldNode,
  key: string,
  context: ObjectFunctionContext,
  dependencies: ObjectExpressionFieldDependencies
): string[] | null {
  if (!isDynamicRuntimeObjectValueExpression(objectExpression, context, dependencies)) {
    return null
  }

  const object = dependencies.emitCValueExpression(objectExpression, context)
  const value = dependencies.emitCValueExpression(expression.value, context)
  const lines: string[] = []

  appendLines(lines, object.lines)
  lines.push(emitRuntimeTypeCheck(runtimeObjectApiValueMismatchCondition(object.expression), context))
  appendLines(lines, value.lines)
  lines.push(
    emitStatusCheck(
      `inox_object_set(${object.expression}, ${cStringLiteral(key)}, ${utf8ByteLength(key)}, ${value.expression})`,
      context
    )
  )

  return lines
}

function isDynamicRuntimeObjectValueExpression(
  expression: ObjectFieldNode,
  context: ObjectFunctionContext,
  dependencies: ObjectExpressionFieldDependencies
): boolean {
  if (isRuntimeValueReferenceExpression(expression, context)) {
    return true
  }

  if (isDynamicObjectFieldValueExpression(expression, context, dependencies)) {
    return true
  }

  return isDynamicRuntimeObjectFieldValueExpression(expression, context, dependencies)
}

function isRuntimeValueReferenceExpression(expression: ObjectFieldNode, context: ObjectFunctionContext): boolean {
  if (expression.type !== 'Reference' || expression.path.length !== 1) {
    return false
  }

  const path: string[] = expression.path
  const name: string = path[0]
  const valueType = context.variables.get(name) ?? ''

  if (valueType !== 'unknown' && valueType !== 'object' && !isOpaqueRuntimeValueType(valueType)) {
    return false
  }

  if (valueType === 'unknown' || isOpaqueRuntimeValueType(valueType)) {
    return true
  }

  for (const value of context.ownedValues) {
    if (value === name) {
      return true
    }
  }

  return false
}

function isDynamicObjectFieldValueExpression(
  expression: ObjectFieldNode,
  context: ObjectFunctionContext,
  dependencies: ObjectExpressionFieldDependencies
): boolean {
  if (expression.type === 'MemberExpression') {
    return dependencies.inferExpressionType(expression.object, context) === 'object'
  }

  if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
    return dependencies.inferExpressionType(expression.object, context) === 'object'
  }

  return false
}

function isDynamicRuntimeObjectFieldValueExpression(
  expression: ObjectFieldNode,
  context: ObjectFunctionContext,
  dependencies: ObjectExpressionFieldDependencies
): boolean {
  const access = dynamicRuntimeObjectFieldAccess(expression)

  if (access === null || typeof access === 'undefined') {
    return false
  }

  return isDynamicRuntimeObjectValueExpression(access.object, context, dependencies)
}

function dynamicRuntimeObjectFieldAccess(expression: ObjectFieldNode): CDynamicObjectFieldAccess | null {
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

function isScalarObjectFieldValueType(valueType: string): boolean {
  return valueType === 'number' || valueType === 'boolean'
}

function isManagedObjectFieldValueType(valueType: string): boolean {
  return (
    valueType === 'number' ||
    valueType === 'boolean' ||
    valueType === 'bytes' ||
    valueType === 'array' ||
    valueType === 'map' ||
    valueType === 'set' ||
    valueType === 'object' ||
    valueType === 'string'
  )
}

function isSupportedObjectFieldStorageType(valueType: string): boolean {
  return (
    valueType === 'unknown' ||
    isManagedRuntimeReturnType(valueType) ||
    isNullableScalarType(valueType) ||
    isOpaqueRuntimeValueType(valueType)
  )
}

function unsupportedObjectFieldStorageMessage(valueType: string): string {
  if (valueType === 'function') {
    return 'stored callback object fields need delayed closure lifetime support and are not supported by the current C backend slice'
  }

  return 'this object field type is not supported by the current C backend slice'
}

function unsupportedObjectFieldValueExpression(
  valueType: string,
  loc: AnyNode['loc'],
  context: ObjectFunctionContext
): PreparedExpression {
  context.diagnostics.push(
    diagnostic(cUnsupportedExpressionCode(valueType), unsupportedObjectFieldStorageMessage(valueType), loc)
  )

  return {
    lines: [],
    expression: 'inox_undefined_value()'
  }
}

function emitObjectFieldInitializerValue(
  field: CObjectShapeField,
  property: ObjectPropertyNode,
  context: ObjectFunctionContext,
  dependencies: ObjectVariableDeclarationDependencies
): PreparedExpression {
  if (field.valueType === 'function') {
    return {
      lines: [],
      expression: 'inox_undefined_value()'
    }
  }

  if (!isSupportedObjectFieldStorageType(field.valueType)) {
    return unsupportedObjectFieldValueExpression(field.valueType, property.value.loc, context)
  }

  return dependencies.emitObjectFieldValueExpression(field, property.value, context)
}

function emitObjectFunctionFieldVariableDeclaration(
  objectName: string,
  field: CObjectShapeField,
  property: ObjectPropertyNode,
  context: ObjectFunctionContext,
  dependencies: ObjectVariableDeclarationDependencies,
  seenTypes: string[]
): string[] {
  const name = emitCObjectFunctionFieldName(objectName, field.name)

  if (isRuntimeObjectFunctionField(field)) {
    registerOwnedValue(context, name)
    return dependencies.emitRuntimeCallbackValueInto(property.value, field.functionType, name, context)
  }

  return [
    `${dependencies.emitFunctionPointerVariable(
      name,
      property.value,
      context,
      true,
      field.functionType,
      property.value.loc,
      seenTypes
    )};`
  ]
}

function emitNestedObjectFunctionFieldVariableDeclarations(
  objectName: string,
  field: CObjectShapeField,
  property: ObjectPropertyNode,
  context: ObjectFunctionContext,
  dependencies: ObjectVariableDeclarationDependencies,
  seenTypes: string[]
): string[] {
  if (field.valueType !== 'object') {
    return []
  }

  if (
    field.declaredType !== null &&
    typeof field.declaredType !== 'undefined' &&
    seenTypes.includes(field.declaredType)
  ) {
    return []
  }

  const nestedSeenTypes: string[] = []

  for (const seenType of seenTypes) {
    nestedSeenTypes.push(seenType)
  }

  if (
    field.declaredType !== null &&
    typeof field.declaredType !== 'undefined' &&
    !nestedSeenTypes.includes(field.declaredType)
  ) {
    nestedSeenTypes.push(field.declaredType)
  }

  return emitObjectShapeFunctionFieldVariableDeclarations(
    `${objectName}_${field.name}`,
    field.shape,
    objectFunctionFieldSource(property.value),
    context,
    dependencies,
    nestedSeenTypes
  )
}

function emitObjectShapeFunctionFieldVariableDeclarations(
  objectName: string,
  shape: CObjectShape | null | undefined,
  source: ObjectFunctionFieldSource,
  context: ObjectFunctionContext,
  dependencies: ObjectVariableDeclarationDependencies,
  seenTypes: string[]
): string[] {
  const lines: string[] = []

  if (shape === null || typeof shape === 'undefined' || shape.fields === null || typeof shape.fields === 'undefined') {
    return lines
  }

  const fields = shape.fields

  for (const field of fields) {
    if (field.valueType === 'function') {
      if (isSupportedObjectFunctionField(field)) {
        appendLines(
          lines,
          emitObjectShapeFunctionFieldVariableDeclaration(objectName, field, source, context, dependencies, seenTypes)
        )
      }
    } else if (field.valueType === 'object') {
      if (
        field.declaredType !== null &&
        typeof field.declaredType !== 'undefined' &&
        seenTypes.includes(field.declaredType)
      ) {
        continue
      }

      let pushedType = false

      if (field.declaredType !== null && typeof field.declaredType !== 'undefined') {
        seenTypes.push(field.declaredType)
        pushedType = true
      }

      appendLines(
        lines,
        emitObjectShapeFunctionFieldVariableDeclarations(
          `${objectName}_${field.name}`,
          field.shape,
          nestedObjectFunctionFieldSource(source, field.name),
          context,
          dependencies,
          seenTypes
        )
      )

      if (pushedType) {
        seenTypes.pop()
      }
    }
  }

  return lines
}

function emitObjectShapeFunctionFieldVariableDeclaration(
  objectName: string,
  field: CObjectShapeField,
  source: ObjectFunctionFieldSource,
  context: ObjectFunctionContext,
  dependencies: ObjectVariableDeclarationDependencies,
  seenTypes: string[]
): string[] {
  const value = objectFunctionFieldSourcePropertyValue(source, field.name)
  const name = emitCObjectFunctionFieldName(objectName, field.name)

  if (isRuntimeObjectFunctionField(field)) {
    return emitRuntimeObjectShapeFunctionFieldVariableDeclaration(name, field, source, value, context, dependencies)
  }

  if (value !== null && typeof value !== 'undefined') {
    return [
      `${dependencies.emitFunctionPointerVariable(
        name,
        value,
        context,
        true,
        field.functionType,
        value.loc,
        seenTypes
      )};`
    ]
  }

  if (source.pathName !== null && typeof source.pathName !== 'undefined') {
    return [
      `${dependencies.emitFunctionPointerVariableWithCInitializer(
        name,
        emitCObjectFunctionFieldName(source.pathName, field.name),
        context,
        true,
        field.functionType,
        field.loc ?? source.loc,
        seenTypes
      )};`
    ]
  }

  if (field.optional === true) {
    return [
      `${dependencies.emitFunctionPointerVariableWithCInitializer(
        name,
        '0',
        context,
        true,
        field.functionType,
        field.loc ?? source.loc,
        seenTypes
      )};`
    ]
  }

  context.diagnostics.push(diagnostic('INOX_MISSING_FIELD', `missing field ${field.name}`, source.loc))

  return [
    `${dependencies.emitFunctionPointerVariableWithCInitializer(
      name,
      '0',
      context,
      true,
      field.functionType,
      field.loc ?? source.loc,
      seenTypes
    )};`
  ]
}

function emitRuntimeObjectShapeFunctionFieldVariableDeclaration(
  name: string,
  field: CObjectShapeField,
  source: ObjectFunctionFieldSource,
  value: ObjectFieldNode | null,
  context: ObjectFunctionContext,
  dependencies: ObjectVariableDeclarationDependencies
): string[] {
  registerOwnedValue(context, name)

  if (value !== null && typeof value !== 'undefined') {
    return dependencies.emitRuntimeCallbackValueInto(value, field.functionType, name, context)
  }

  if (source.pathName !== null && typeof source.pathName !== 'undefined') {
    const sourceName = emitCObjectFunctionFieldName(source.pathName, field.name)
    const lines: string[] = []

    lines.push(`${name} = ${sourceName};`)

    return lines
  }

  if (field.optional === true) {
    const lines: string[] = []

    appendLines(lines, emitPrepareOwnedValueWrite(name))
    lines.push(`${name} = inox_null_value();`)

    return lines
  }

  context.diagnostics.push(diagnostic('INOX_MISSING_FIELD', `missing field ${field.name}`, source.loc))

  const lines: string[] = []

  appendLines(lines, emitPrepareOwnedValueWrite(name))
  lines.push(`${name} = inox_undefined_value();`)

  return lines
}

function emitKnownObjectFieldValueCheck(
  value: string,
  expectedTag: string | null,
  field: CKnownObjectField,
  expression: AnyNode,
  context: ObjectFunctionContext
): string[] {
  if (objectFieldValueMayBeNullish(field)) {
    return emitRuntimeOptionalObjectFieldValueCheck(value, expectedTag, context)
  }

  return emitRuntimeFieldValueCheck(value, expectedTag, expression, context)
}

function objectFieldValueMayBeNullish(field: CObjectFieldInfo): boolean {
  return field.optional === true || field.nullable === true
}

function emitRuntimeOptionalObjectFieldValueCheck(
  value: string,
  expectedTag: string | null,
  context: ObjectFunctionContext
): string[] {
  if (expectedTag === null || typeof expectedTag === 'undefined') {
    return []
  }

  if (expectedTag === 'INOX_TAG_BOOL' || expectedTag === 'INOX_TAG_NUMBER') {
    return [
      emitRuntimeTypeCheck(
        `${value}.tag != INOX_TAG_UNDEFINED && ${value}.tag != INOX_TAG_NULL && ${value}.tag != ${expectedTag}`,
        context
      )
    ]
  }

  if (expectedTag === 'INOX_TAG_OBJECT') {
    return [
      emitRuntimeTypeCheck(
        `${value}.tag != INOX_TAG_UNDEFINED && ${value}.tag != INOX_TAG_NULL && ` +
          `(${runtimeObjectLikeValueMismatchCondition(value)})`,
        context
      )
    ]
  }

  return [
    emitRuntimeTypeCheck(
      `${value}.tag != INOX_TAG_UNDEFINED && ${value}.tag != INOX_TAG_NULL && (${value}.tag != ${expectedTag} || ${value}.as.ref == 0)`,
      context
    )
  ]
}

export function registerObjectShape(
  context: ObjectShapeContext,
  name: string,
  shape: CObjectShape | null | undefined
): void {
  if (shape === null || typeof shape === 'undefined') {
    return
  }

  if (shape.builtin === 'compiler.AnyNode') {
    const fields: CObjectShapeField[] = []

    appendCompilerAnyNodeFallbackShapeFields(fields)
    const seen: Set<CObjectShape> = new Set()

    seen.add(shape)
    registerObjectShapeFields(context, name, fields, seen)
    return
  }

  const fields = shape.fields

  if (fields === null || typeof fields === 'undefined') {
    return
  }

  const seen: Set<CObjectShape> = new Set()

  seen.add(shape)
  registerObjectShapeFields(context, name, fields, seen)
}

export function emitObjectVariableDeclaration(
  statement: AnyNode,
  context: ObjectFunctionContext,
  dependencies: ObjectVariableDeclarationDependencies
): string[] {
  const reference = emitCIdentifier(statement.name)
  const shapeName = nextCName(context, `inox_shape_${reference}`)
  const fieldsName = `${shapeName}_fields`
  const fields = objectVariableShapeFields(statement, context, dependencies)
  const properties = statement.init.properties
  const lines = [`static const inox_field_info ${fieldsName}[] = {`]

  for (const field of fields) {
    lines.push(`  { ${cStringLiteral(field.name)}, ${dependencies.emitCFieldFlags(field)} },`)
  }

  lines.push('};')
  lines.push(`static const inox_shape ${shapeName} = {`)
  lines.push(`  ${fields.length},`)
  lines.push(`  ${fieldsName}`)
  lines.push('};')
  lines.push(`auto ${reference} = inox::ObjectValue::create(&${shapeName});`)
  lines.push(emitRuntimeTypeCheck('inox::thrown()', context))
  const spreads = prepareObjectVariableSpreads(properties, context, dependencies, lines)

  context.variables.set(statement.name, 'object')
  registerObjectShapeFields(context, statement.name, fields, new Set())
  const seenTypes = objectVariableDeclaredTypes(statement)

  for (let index = 0; index < fields.length; index = index + 1) {
    const field = fields[index]
    const property = findObjectProperty(properties, field.name)

    if (property !== null && typeof property !== 'undefined') {
      if (field.valueType === 'function') {
        if (isSupportedObjectFunctionField(field)) {
          appendLines(
            lines,
            emitObjectFunctionFieldVariableDeclaration(
              statement.name,
              field,
              property,
              context,
              dependencies,
              seenTypes
            )
          )
        }

        continue
      }

      const value = emitObjectFieldInitializerValue(field, property, context, dependencies)
      appendLines(lines, value.lines)
      lines.push(`${reference}.init(${index}, ${value.expression});`)
      lines.push(emitRuntimeTypeCheck('inox::thrown()', context))
      appendLines(
        lines,
        emitNestedObjectFunctionFieldVariableDeclarations(
          statement.name,
          field,
          property,
          context,
          dependencies,
          seenTypes
        )
      )
    } else {
      const spread = preparedObjectVariableSpreadForField(spreads, field.name)

      if (spread !== null && typeof spread !== 'undefined') {
        const spreadValue = nextCName(context, 'inox_spread_value')

        lines.push(`auto ${spreadValue} = inox::get(${spread.name}, ${cStringLiteral(field.name)});`)
        lines.push(emitRuntimeTypeCheck('inox::thrown()', context))
        lines.push(`${reference}.init(${index}, ${spreadValue});`)
        lines.push(emitRuntimeTypeCheck('inox::thrown()', context))
        continue
      }

      if (field.optional !== true) {
        context.diagnostics.push(diagnostic('INOX_MISSING_FIELD', `missing field ${field.name}`, statement.loc))
      }
    }
  }

  return lines
}

function prepareObjectVariableSpreads(
  properties: ObjectPropertyNode[],
  context: ObjectFunctionContext,
  dependencies: ObjectVariableDeclarationDependencies,
  lines: string[]
): PreparedObjectSpread[] {
  const spreads: PreparedObjectSpread[] = []

  for (const property of properties) {
    if (property.spread !== true) {
      continue
    }

    const prepared = dependencies.emitCValueExpression(property.value, context)
    const name = nextCName(context, 'inox_object_spread')

    appendLines(lines, prepared.lines)
    lines.push(`auto ${name} = ${prepared.expression};`)
    lines.push(emitRuntimeTypeCheck('inox::thrown()', context))
    spreads.push({ name, property })
  }

  return spreads
}

function preparedObjectVariableSpreadForField(
  spreads: PreparedObjectSpread[],
  fieldName: string
): PreparedObjectSpread | null {
  for (let index = spreads.length - 1; index >= 0; index = index - 1) {
    const spread = spreads[index]
    const shape = spread.property.value.shape

    if (shape === null || typeof shape === 'undefined' || shape.dynamic === true) {
      continue
    }

    for (const field of shape.fields) {
      if (field.name === fieldName) {
        return spread
      }
    }
  }

  return null
}

function isSupportedObjectFunctionField(field: CObjectShapeField): boolean {
  return isPlainFunctionPointerType(field.functionType) || isRuntimeFunctionType(field.functionType)
}

function isRuntimeObjectFunctionField(field: CObjectShapeField): boolean {
  return !isPlainFunctionPointerType(field.functionType) && isRuntimeFunctionType(field.functionType)
}

function objectVariableDeclaredTypes(statement: AnyNode): string[] {
  const seenTypes: string[] = []

  if (statement.declaredType !== null && typeof statement.declaredType !== 'undefined') {
    seenTypes.push(statement.declaredType)
  }

  return seenTypes
}

function objectPropertyValueType(
  property: ObjectPropertyNode,
  context: ObjectFunctionContext,
  dependencies: ObjectVariableDeclarationDependencies
): string {
  const value = property.value

  if (value.type === 'NumberLiteral') {
    return 'number'
  }

  if (value.type === 'StringLiteral' || value.type === 'TemplateLiteral') {
    return 'string'
  }

  if (value.type === 'BooleanLiteral') {
    return 'boolean'
  }

  if (value.type === 'NullLiteral') {
    return 'null'
  }

  return dependencies.inferExpressionType(value, context)
}

function shouldUseObjectPropertyStringMetadata(
  target: string | null | undefined,
  source: string | null | undefined
): boolean {
  if (source === null || typeof source === 'undefined' || source === 'unknown') {
    return false
  }

  return target === null || typeof target === 'undefined' || target === 'unknown'
}

function objectPropertyDeclaredType(value: ObjectFieldNode): string | null | undefined {
  const arrayElementDeclaredType = value.arrayElementDeclaredType

  if (arrayElementDeclaredType !== null && typeof arrayElementDeclaredType !== 'undefined') {
    return arrayElementDeclaredType
  }

  return value.declaredType
}

function objectShapeFieldWithPropertyMetadata(
  field: CObjectShapeField,
  property: ObjectPropertyNode,
  context: ObjectFunctionContext,
  dependencies: ObjectVariableDeclarationDependencies
): CObjectShapeField {
  const value = property.value
  const declaredType = objectPropertyDeclaredType(value)
  const next: CObjectShapeField = {
    name: field.name,
    optional: field.optional,
    ownership: field.ownership,
    readonly: field.readonly,
    readonlyField: field.readonlyField,
    declaredType: field.declaredType,
    nullable: field.nullable,
    valueType: field.valueType,
    arrayElementType: field.arrayElementType,
    mapKeyType: field.mapKeyType,
    mapValueType: field.mapValueType,
    setElementType: field.setElementType,
    shapeOwnership: field.shapeOwnership,
    shape: field.shape,
    functionTypeOwnership: field.functionTypeOwnership,
    functionType: field.functionType,
    loc: field.loc
  }

  if (next.valueType === 'unknown') {
    next.valueType = objectPropertyValueType(property, context, dependencies)
  }

  if (shouldUseObjectPropertyStringMetadata(next.declaredType, declaredType)) {
    next.declaredType = declaredType
  }

  if (shouldUseObjectPropertyStringMetadata(next.arrayElementType, value.arrayElementType)) {
    next.arrayElementType = value.arrayElementType
  }

  if (shouldUseObjectPropertyStringMetadata(next.mapKeyType, value.mapKeyType)) {
    next.mapKeyType = value.mapKeyType
  }

  if (shouldUseObjectPropertyStringMetadata(next.mapValueType, value.mapValueType)) {
    next.mapValueType = value.mapValueType
  }

  if (shouldUseObjectPropertyStringMetadata(next.setElementType, value.setElementType)) {
    next.setElementType = value.setElementType
  }

  if (next.shape === null || typeof next.shape === 'undefined') {
    next.shape = value.shape
  }

  if (next.functionType === null || typeof next.functionType === 'undefined') {
    next.functionType = dependencies.resolveFunctionValueType(value, context)
  }

  return next
}

function objectShapeFieldFromProperty(
  property: ObjectPropertyNode,
  valueType: string,
  shape: CObjectShape | null | undefined,
  functionType: CFunctionType | null
): CObjectShapeField {
  return {
    name: property.key,
    readonly: property.value.readonly,
    readonlyField: false,
    declaredType: objectPropertyDeclaredType(property.value),
    valueType,
    arrayElementType: property.value.arrayElementType,
    mapKeyType: property.value.mapKeyType,
    mapValueType: property.value.mapValueType,
    setElementType: property.value.setElementType,
    shape,
    functionType
  }
}

function objectVariableShapeFields(
  statement: AnyNode,
  context: ObjectFunctionContext,
  dependencies: ObjectVariableDeclarationDependencies
): CObjectShapeField[] {
  const fields: CObjectShapeField[] = []
  const initProperties = objectNodeProperties(statement.init)
  const shouldAppendAnyNodeFallback =
    isCompilerAnyNodeShape(statement.shape) ||
    isEmptyObjectShape(statement.shape) ||
    isCompilerAnyNodeLikeObjectLiteral(statement.init)
  const shouldAppendObjectShapeInfoFallback = isCompilerObjectShapeInfoShape(statement.shape)
  const shouldAppendObjectFieldInfoFallback = isCompilerObjectFieldInfoShape(statement.shape)

  if (
    statement.shape !== null &&
    typeof statement.shape !== 'undefined' &&
    statement.shape.fields !== null &&
    typeof statement.shape.fields !== 'undefined'
  ) {
    const shapeFields = statement.shape.fields

    for (const field of shapeFields) {
      const fieldNode: AnyNode = field

      const property = findObjectProperty(initProperties, fieldNode.name)

      if (property !== null && typeof property !== 'undefined') {
        fields.push(objectShapeFieldWithPropertyMetadata(field, property, context, dependencies))
      } else {
        fields.push(field)
      }
    }

    if (statement.shape.dynamic !== true) {
      if (shouldAppendAnyNodeFallback) {
        appendCompilerAnyNodeFallbackShapeFields(fields)
      } else if (shouldAppendObjectShapeInfoFallback) {
        appendCompilerObjectShapeInfoFallbackShapeFields(fields)
      } else if (shouldAppendObjectFieldInfoFallback) {
        appendCompilerAnyNodeFallbackShapeFields(fields)
      }

      return fields
    }
  }

  for (const property of initProperties) {
    if (property.spread === true) {
      continue
    }

    if (findObjectShapeFieldIndex(fields, property.key) !== -1) {
      continue
    }

    let valueType = objectPropertyValueType(property, context, dependencies)
    let shape = property.value.shape
    let functionType = dependencies.resolveFunctionValueType(property.value, context)

    if (
      statement.shape !== null &&
      typeof statement.shape !== 'undefined' &&
      statement.shape.dynamicField !== null &&
      typeof statement.shape.dynamicField !== 'undefined'
    ) {
      const dynamicField = statement.shape.dynamicField

      if (dynamicField.valueType !== null && typeof dynamicField.valueType !== 'undefined') {
        valueType = dynamicField.valueType
      }

      if (dynamicField.shape !== null && typeof dynamicField.shape !== 'undefined') {
        shape = dynamicField.shape
      }

      if (dynamicField.functionType !== null && typeof dynamicField.functionType !== 'undefined') {
        functionType = dynamicField.functionType
      }
    }

    fields.push(objectShapeFieldFromProperty(property, valueType, shape, functionType))
  }

  if (shouldAppendAnyNodeFallback) {
    appendCompilerAnyNodeFallbackShapeFields(fields)
  } else if (shouldAppendObjectShapeInfoFallback) {
    appendCompilerObjectShapeInfoFallbackShapeFields(fields)
  } else if (shouldAppendObjectFieldInfoFallback) {
    appendCompilerAnyNodeFallbackShapeFields(fields)
  }

  return fields
}

function isCompilerAnyNodeLikeObjectLiteral(expression: AnyNode | null | undefined): boolean {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'ObjectLiteral') {
    return false
  }

  const properties = objectNodeProperties(expression)
  let hasName = false
  let hasValueType = false

  for (const property of properties) {
    if (property.key === 'type' && property.value.type === 'StringLiteral') {
      return true
    }

    if (property.key === 'name') {
      hasName = true
    } else if (property.key === 'valueType') {
      hasValueType = true
    }
  }

  return hasName && hasValueType
}

export function isCompilerObjectShapeInfoShape(shape: CObjectShape | null | undefined): boolean {
  if (
    shape === null ||
    typeof shape === 'undefined' ||
    shape.fields === null ||
    typeof shape.fields === 'undefined'
  ) {
    return false
  }

  return (
    findObjectShapeFieldIndex(shape.fields, 'kind') !== -1 &&
    findObjectShapeFieldIndex(shape.fields, 'fields') !== -1 &&
    findObjectShapeFieldIndex(shape.fields, 'builtin') === -1
  )
}

function isCompilerObjectFieldInfoShape(shape: CObjectShape | null | undefined): boolean {
  if (
    shape === null ||
    typeof shape === 'undefined' ||
    shape.fields === null ||
    typeof shape.fields === 'undefined'
  ) {
    return false
  }

  return findObjectShapeFieldIndex(shape.fields, 'name') !== -1 && findObjectShapeFieldIndex(shape.fields, 'valueType') !== -1
}

function objectNodeProperties(node: ObjectFieldNode): ObjectPropertyNode[] {
  return node.properties
}
