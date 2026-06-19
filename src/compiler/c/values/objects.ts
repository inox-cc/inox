import {
  emitPrepareOwnedValueWrite,
  emitRuntimeTypeCheck,
  emitStatusCheck,
  nextCName,
  registerOwnedValue
} from '../context.ts'
import { diagnostic } from '../../diagnostics.ts'
import { cStringLiteral, emitCObjectFunctionFieldName, utf8ByteLength } from '../identifiers.ts'
import { emitRuntimeFieldValueCheck } from '../runtime-values.ts'
import { cUnsupportedExpressionCode } from '../syntax.ts'
import { isPlainFunctionPointerType, isRuntimeFunctionType } from '../async/callbacks.ts'
import { isReadonlyCObjectShapeField } from '../types.ts'
import {
  cRuntimeValueTag,
  isManagedRuntimeReturnType,
  isNullableScalarType,
  isOpaqueRuntimeValueType
} from '../value-types.ts'
import type { AnyNode, Diagnostic } from '../../types.ts'
import type {
  CKnownObjectField,
  CKnownObjectIndexField,
  CKnownObjectMemberField,
  CObjectFieldInfo,
  CFunctionType,
  CObjectShape,
  CObjectIndexFieldInfo,
  CObjectShapeField,
  CPreparedExpression as PreparedExpression,
  CPreparedStringBytesOperand as PreparedStringBytesOperand
} from '../types.ts'

type ObjectShapeContext = {
  objectShapes: Map<string, CObjectShapeField[]>
}

type ObjectNameContext = {
  boxedVariables: Set<string>
  moduleValueNames?: Map<string, string>
  variables: Map<string, string>
}

type ObjectFunctionContext = ObjectShapeContext & ObjectNameContext & {
  cleanupEnabled: boolean
  diagnostics: Diagnostic[]
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
  value: ObjectFieldNode
}

type ObjectFunctionFieldSource = {
  expression: ObjectFieldNode | null
  loc?: any
  pathName: string | null
}

export type ObjectVariableDeclarationDependencies = {
  emitCFieldFlags(field: CObjectShapeField): string
  emitFunctionPointerVariable(
    name: string,
    init: AnyNode,
    context: ObjectFunctionContext,
    isConst: boolean,
    functionType: CFunctionType | null | undefined,
    loc: AnyNode['loc']
  ): string
  emitFunctionPointerVariableWithCInitializer(
    name: string,
    init: string,
    context: ObjectFunctionContext,
    isConst: boolean,
    functionType: CFunctionType | null | undefined,
    loc: AnyNode['loc']
  ): string
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

type KnownObjectNameField = {
  objectName: string
}

type KnownObjectIndexKeyField = {
  key: string
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

function findObjectShapeFieldIndex(fields: CObjectShapeField[], key: string): number {
  for (let index = 0; index < fields.length; index = index + 1) {
    if (fields[index].name === key) {
      return index
    }
  }

  return -1
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

  if (propertyValue != null) {
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

  if (expression == null || expression.type !== 'ObjectLiteral') {
    return null
  }

  const property = findObjectProperty(objectNodeProperties(expression), fieldName)

  if (property == null) {
    return null
  }

  return property.value
}

function nestedObjectPathName(pathName: string | null, fieldName: string): string | null {
  if (pathName == null) {
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

    if (objectName != null) {
      return `${objectName}_${expression.property}`
    }
  }

  if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
    const objectName = resolveCObjectExpressionPathName(expression.object)

    if (objectName != null) {
      return `${objectName}_${expression.index.value}`
    }
  }

  return null
}

function objectShapeFieldOwnership(field: CObjectShapeField): string {
  const ownership = field.ownership

  if (ownership != null) {
    return ownership
  }

  return 'strong'
}

function normalizedObjectShapeField(field: CObjectShapeField): CObjectShapeField {
  return {
    name: field.name,
    optional: field.optional,
    ownership: objectShapeFieldOwnership(field),
    readonlyField: isReadonlyCObjectShapeField(field),
    declaredType: field.declaredType,
    valueType: field.valueType,
    arrayElementType: field.arrayElementType,
    mapKeyType: field.mapKeyType,
    mapValueType: field.mapValueType,
    setElementType: field.setElementType,
    shape: field.shape,
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

    if (field.valueType !== 'object' || shape == null || shape.fields == null || seen.has(shape)) {
      continue
    }

    seen.add(shape)
    registerObjectShapeFields(context, `${name}_${field.name}`, shape.fields, seen)
    seen.delete(shape)
  }
}

export function isMemberAccessExpression(expression: AnyNode): boolean {
  return expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression'
}

export function isIndexAccessExpression(expression: AnyNode): boolean {
  return expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression'
}

export function resolveKnownObjectMember(expression: AnyNode, context: ObjectFunctionContext): CKnownObjectMemberField | null {
  if (!isMemberAccessExpression(expression)) {
    return null
  }

  const objectName = resolveCObjectExpressionName(expression.object)

  if (objectName != null) {
    const fields = context.objectShapes.get(objectName)

    if (fields != null) {
      const index = findObjectShapeFieldIndex(fields, expression.property)

      if (index !== -1) {
        const field = fields[index]

        if (field != null) {
          return knownObjectMemberField(objectName, index, field)
        }
      }
    }
  }

  return null
}

function knownObjectMemberField(
  objectName: string,
  index: number,
  field: CObjectShapeField
): CKnownObjectMemberField {
  return {
    objectName,
    key: null,
    index,
    valueType: field.valueType,
    arrayElementType: field.arrayElementType,
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

  if (moduleValueNames != null) {
    const value = moduleValueNames.get(name)

    if (value != null) {
      moduleValueName = value
    }
  }

  if (moduleValueName != null) {
    return moduleValueName
  }

  if (context.boxedVariables.has(name) && context.variables.get(name) === 'object') {
    return `(*${name})`
  }

  return name
}

export function resolveKnownObjectIndex(expression: AnyNode, context: ObjectFunctionContext): CKnownObjectIndexField | null {
  if (!isIndexAccessExpression(expression) || expression.index.type !== 'StringLiteral') {
    return null
  }

  const objectName = resolveCObjectExpressionName(expression.object)

  if (objectName != null) {
    const fields = context.objectShapes.get(objectName)

    if (fields != null) {
      const index = findObjectShapeFieldIndex(fields, expression.index.value)

      if (index !== -1) {
        const field = fields[index]

        if (field != null) {
          return knownObjectIndexField(objectName, expression.index.value, index, field)
        }
      }
    }
  }

  return null
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
    valueType: field.valueType,
    arrayElementType: field.arrayElementType,
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
  if (objectExpression.shape == null || objectExpression.shape.fields == null) {
    return null
  }

  const fields = objectExpression.shape.fields

  const index = findObjectShapeFieldIndex(fields, key)

  if (index === -1) {
    return null
  }

  const field = objectShapeFieldAt(fields, index)

  if (field == null) {
    return null
  }

  return {
    key,
    index,
    valueType: field.valueType,
    arrayElementType: field.arrayElementType,
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

  if (fields != null) {
    const field = objectShapeFieldAt(fields, member.index)

    if (field != null) {
      field.valueType = valueType
    }
  }
}

export function emitPreparedKnownObjectMemberValueExpression(
  expression: AnyNode,
  context: ObjectFunctionContext
): PreparedExpression | null {
  const member = resolveKnownObjectMember(expression, context)

  if (member != null) {
    const access: KnownObjectFieldReadAccess = {
      index: member.index,
      key: '',
      kind: 'known',
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

  if (field != null) {
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

  if (member != null) {
    return emitPreparedObjectExpressionFieldValueExpression(member, expression, expression.object, context, dependencies)
  }

  return null
}

export function emitPreparedObjectExpressionScalarMemberValueExpression(
  expression: AnyNode,
  context: ObjectFunctionContext,
  dependencies: ObjectExpressionFieldDependencies
): PreparedExpression | null {
  const member = resolveObjectExpressionMember(expression)

  if (member != null && isScalarObjectFieldValueType(member.valueType)) {
    return emitPreparedObjectExpressionFieldValueExpression(member, expression, expression.object, context, dependencies)
  }

  return null
}

export function emitPreparedObjectExpressionIndexValueExpression(
  expression: AnyNode,
  context: ObjectFunctionContext,
  dependencies: ObjectExpressionFieldDependencies
): PreparedExpression | null {
  const field = resolveObjectExpressionIndex(expression)

  if (field != null) {
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
  const key = dependencies.emitPreparedStringBytesOperand(expression.index, context, 'ccjs_object_key')
  const temp = nextCName(context, 'ccjs_value')
  const tag = cRuntimeValueTag(expression.valueType)
  const lines: string[] = []

  registerOwnedValue(context, temp)

  appendLines(lines, object.lines)
  appendLines(lines, key.lines)
  appendLines(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(emitStatusCheck(`ccjs_object_get(${object.expression}, ${key.bytes}, ${key.length}, &${temp})`, context))
  appendLines(lines, emitRuntimeFieldValueCheck(temp, tag, expression, context))

  return {
    lines,
    expression: temp,
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

    if (assignment != null) {
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

    if (assignment != null) {
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

  return null
}

export function emitPreparedObjectExpressionScalarIndexValueExpression(
  expression: AnyNode,
  context: ObjectFunctionContext,
  dependencies: ObjectExpressionFieldDependencies
): PreparedExpression | null {
  const field = resolveObjectExpressionIndex(expression)

  if (field != null && isScalarObjectFieldValueType(field.valueType)) {
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

  const temp = nextCName(context, 'ccjs_value')
  const tag = cRuntimeValueTag(field.valueType)
  const lines: string[] = []

  registerOwnedValue(context, temp)

  appendLines(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(emitStatusCheck(knownObjectFieldReadCall(access, temp, context), context))
  appendLines(lines, emitRuntimeFieldValueCheck(temp, tag, expression, context))

  return {
    lines,
    expression: temp
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

  const object = dependencies.emitCValueExpression(objectExpression, context)
  const temp = nextCName(context, 'ccjs_value')
  const tag = cRuntimeValueTag(field.valueType)
  const lines: string[] = []

  registerOwnedValue(context, temp)

  appendLines(lines, object.lines)
  appendLines(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(emitStatusCheck(`ccjs_object_get_known(${object.expression}, ${field.index}, &${temp})`, context))
  appendLines(lines, emitRuntimeFieldValueCheck(temp, tag, expression, context))

  return {
    lines,
    expression: temp,
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
  const temp = nextCName(context, 'ccjs_value')
  const tag = cRuntimeValueTag(expression.valueType)
  const lines: string[] = []

  registerOwnedValue(context, temp)

  appendLines(lines, object.lines)
  appendLines(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(emitStatusCheck(`ccjs_object_get(${object.expression}, ${cStringLiteral(key)}, ${utf8ByteLength(key)}, &${temp})`, context))
  appendLines(lines, emitRuntimeFieldValueCheck(temp, tag, expression, context))

  return {
    lines,
    expression: temp,
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
      `ccjs_object_set(${object.expression}, ${cStringLiteral(key)}, ${utf8ByteLength(key)}, ${value.expression})`,
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
  lines.push(emitRuntimeTypeCheck(`${object.expression}.tag != CCJS_TAG_OBJECT || ${object.expression}.as.ref == 0`, context))
  appendLines(lines, value.lines)
  lines.push(
    emitStatusCheck(
      `ccjs_object_set(${object.expression}, ${cStringLiteral(key)}, ${utf8ByteLength(key)}, ${value.expression})`,
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

  if (
    valueType !== 'unknown' &&
    valueType !== 'object' &&
    !isOpaqueRuntimeValueType(valueType)
  ) {
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

  if (access == null) {
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
    expression: 'ccjs_undefined_value()'
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
      expression: 'ccjs_undefined_value()'
    }
  }

  if (!isSupportedObjectFieldStorageType(field.valueType)) {
    return unsupportedObjectFieldValueExpression(field.valueType, property.value.loc, context)
  }

  return dependencies.emitCValueExpression(property.value, context)
}

function emitObjectFunctionFieldVariableDeclaration(
  objectName: string,
  field: CObjectShapeField,
  property: ObjectPropertyNode,
  context: ObjectFunctionContext,
  dependencies: ObjectVariableDeclarationDependencies
): string {
  return `${dependencies.emitFunctionPointerVariable(
    emitCObjectFunctionFieldName(objectName, field.name),
    property.value,
    context,
    true,
    field.functionType,
    property.value.loc
  )};`
}

function emitNestedObjectFunctionFieldVariableDeclarations(
  objectName: string,
  field: CObjectShapeField,
  property: ObjectPropertyNode,
  context: ObjectFunctionContext,
  dependencies: ObjectVariableDeclarationDependencies
): string[] {
  if (field.valueType !== 'object') {
    return []
  }

  return emitObjectShapeFunctionFieldVariableDeclarations(
    `${objectName}_${field.name}`,
    field.shape,
    objectFunctionFieldSource(property.value),
    context,
    dependencies
  )
}

function emitObjectShapeFunctionFieldVariableDeclarations(
  objectName: string,
  shape: CObjectShape | null | undefined,
  source: ObjectFunctionFieldSource,
  context: ObjectFunctionContext,
  dependencies: ObjectVariableDeclarationDependencies
): string[] {
  const fields = shape?.fields
  const lines: string[] = []

  if (fields == null) {
    return lines
  }

  for (const field of fields) {
    if (field.valueType === 'function') {
      if (isSupportedObjectFunctionField(field)) {
        lines.push(emitObjectShapeFunctionFieldVariableDeclaration(objectName, field, source, context, dependencies))
      }
    } else if (field.valueType === 'object') {
      appendLines(lines,
        emitObjectShapeFunctionFieldVariableDeclarations(
          `${objectName}_${field.name}`,
          field.shape,
          nestedObjectFunctionFieldSource(source, field.name),
          context,
          dependencies
        )
      )
    }
  }

  return lines
}

function emitObjectShapeFunctionFieldVariableDeclaration(
  objectName: string,
  field: CObjectShapeField,
  source: ObjectFunctionFieldSource,
  context: ObjectFunctionContext,
  dependencies: ObjectVariableDeclarationDependencies
): string {
  const value = objectFunctionFieldSourcePropertyValue(source, field.name)
  const name = emitCObjectFunctionFieldName(objectName, field.name)

  if (value != null) {
    return `${dependencies.emitFunctionPointerVariable(
      name,
      value,
      context,
      true,
      field.functionType,
      value.loc
    )};`
  }

  if (source.pathName != null) {
    return `${dependencies.emitFunctionPointerVariableWithCInitializer(
      name,
      emitCObjectFunctionFieldName(source.pathName, field.name),
      context,
      true,
      field.functionType,
      field.loc ?? source.loc
    )};`
  }

  if (field.optional === true) {
    return `${dependencies.emitFunctionPointerVariableWithCInitializer(
      name,
      '0',
      context,
      true,
      field.functionType,
      field.loc ?? source.loc
    )};`
  }

  context.diagnostics.push(diagnostic('CCJS_MISSING_FIELD', `missing field ${field.name}`, source.loc))

  return `${dependencies.emitFunctionPointerVariableWithCInitializer(
    name,
    '0',
    context,
    true,
    field.functionType,
    field.loc ?? source.loc
  )};`
}

function knownObjectFieldReadCall(
  access: KnownObjectFieldReadAccess,
  temp: string,
  context: ObjectFunctionContext
): string {
  const object = emitObjectValueReference(access.objectName, context)

  if (access.kind === 'known') {
    return `ccjs_object_get_known(${object}, ${access.index}, &${temp})`
  }

  return `ccjs_object_get(${object}, ${cStringLiteral(access.key)}, ${utf8ByteLength(access.key)}, &${temp})`
}

export function registerObjectShape(
  context: ObjectShapeContext,
  name: string,
  shape: CObjectShape | null | undefined
): void {
  if (shape == null) {
    return
  }

  const fields = shape.fields

  if (fields == null) {
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
  const shapeName = nextCName(context, `ccjs_shape_${statement.name}`)
  const fieldsName = `${shapeName}_fields`
  const fields = objectVariableShapeFields(statement, context, dependencies)
  const properties = statement.init.properties
  const lines = [`static const ccjs_field_info ${fieldsName}[] = {`]

  for (const field of fields) {
    lines.push(`  { ${cStringLiteral(field.name)}, ${dependencies.emitCFieldFlags(field)} },`)
  }

  lines.push('};')
  lines.push(`static const ccjs_shape ${shapeName} = {`)
  lines.push(`  ${fields.length},`)
  lines.push(`  ${fieldsName}`)
  lines.push('};')
  registerOwnedValue(context, statement.name)
  appendLines(lines, emitPrepareOwnedValueWrite(statement.name))
  lines.push(emitStatusCheck(`ccjs_object_new(&ccjs_default_allocator, &${shapeName}, &${statement.name})`, context))

  context.variables.set(statement.name, 'object')
  registerObjectShapeFields(context, statement.name, fields, new Set())

  for (let index = 0; index < fields.length; index = index + 1) {
    const field = fields[index]
    const property = findObjectProperty(properties, field.name)

    if (property != null) {
      if (field.valueType === 'function') {
        if (isSupportedObjectFunctionField(field)) {
          lines.push(emitObjectFunctionFieldVariableDeclaration(statement.name, field, property, context, dependencies))
        }

        continue
      }

      const value = emitObjectFieldInitializerValue(field, property, context, dependencies)
      appendLines(lines, value.lines)
      lines.push(emitStatusCheck(`ccjs_object_init_known(${statement.name}, ${index}, ${value.expression})`, context))
      appendLines(lines, emitNestedObjectFunctionFieldVariableDeclarations(statement.name, field, property, context, dependencies))
    } else {
      if (field.optional !== true) {
        context.diagnostics.push(diagnostic('CCJS_MISSING_FIELD', `missing field ${field.name}`, statement.loc))
      }
    }
  }

  return lines
}

function isSupportedObjectFunctionField(field: CObjectShapeField): boolean {
  return isPlainFunctionPointerType(field.functionType) || isRuntimeFunctionType(field.functionType)
}

function objectVariableShapeFields(
  statement: AnyNode,
  context: ObjectFunctionContext,
  dependencies: ObjectVariableDeclarationDependencies
): CObjectShapeField[] {
  const fields: CObjectShapeField[] = []

  if (statement.shape != null && statement.shape.fields != null) {
    const shapeFields: CObjectShapeField[] = statement.shape.fields

    for (const field of shapeFields) {
      fields.push(field)
    }

    if (statement.shape.dynamic !== true) {
      return fields
    }
  }

  const initProperties = objectNodeProperties(statement.init)

  for (const property of initProperties) {
    if (findObjectShapeFieldIndex(fields, property.key) !== -1) {
      continue
    }

    let valueType = dependencies.inferExpressionType(property.value, context)
    let shape = property.value.shape
    let functionType = dependencies.resolveFunctionValueType(property.value, context)

    if (statement.shape != null && statement.shape.dynamicField != null) {
      const dynamicField = statement.shape.dynamicField

      if (dynamicField.valueType != null) {
        valueType = dynamicField.valueType
      }

      if (dynamicField.shape != null) {
        shape = dynamicField.shape
      }

      if (dynamicField.functionType != null) {
        functionType = dynamicField.functionType
      }
    }

    fields.push({
      name: property.key,
      readonlyField: false,
      valueType,
      shape,
      functionType
    })
  }

  return fields
}

function objectNodeProperties(node: ObjectFieldNode): ObjectPropertyNode[] {
  return node.properties
}
