import {
  emitPrepareOwnedValueWrite,
  emitStatusCheck,
  nextCName,
  registerOwnedValue
} from '../context.ts'
import { diagnostic } from '../../diagnostics.ts'
import { cStringLiteral, utf8ByteLength } from '../identifiers.ts'
import { emitRuntimeFieldValueCheck } from '../runtime-values.ts'
import { isReadonlyCObjectShapeField } from '../types.ts'
import { cRuntimeValueTag } from '../value-types.ts'
import type { AnyNode, Diagnostic } from '../../types.ts'
import type {
  CKnownObjectField,
  CKnownObjectIndexField,
  CKnownObjectMemberField,
  CObjectFieldInfo,
  CObjectShape,
  CObjectIndexFieldInfo,
  CObjectShapeField,
  CPreparedExpression as PreparedExpression
} from '../types.ts'

type ObjectShapeContext = {
  objectShapes: Map<string, CObjectShapeField[]>
}

type ObjectNameContext = {
  boxedVariables: Set<string>
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

export type ObjectVariableDeclarationDependencies = {
  emitCFieldFlags(field: CObjectShapeField): string
  emitCValueExpression(expression: AnyNode, context: ObjectFunctionContext): PreparedExpression
  inferExpressionType(expression: AnyNode, context: ObjectFunctionContext): string
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

function findObjectProperty(properties: AnyNode[], key: string): AnyNode | null {
  for (const property of properties) {
    if (property.key === key) {
      return property
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

function knownObjectName(field: KnownObjectNameField): string {
  return field.objectName
}

function knownObjectIndexKey(field: KnownObjectIndexKeyField): string {
  return field.key
}

function normalizedObjectShapeField(field: CObjectShapeField): CObjectShapeField {
  return {
    name: field.name,
    optional: field.optional,
    ownership: objectShapeFieldOwnership(field),
    readonlyField: isReadonlyCObjectShapeField(field),
    valueType: field.valueType,
    arrayElementType: field.arrayElementType,
    mapKeyType: field.mapKeyType,
    mapValueType: field.mapValueType,
    setElementType: field.setElementType
  }
}

function normalizeObjectShapeFields(fields: CObjectShapeField[]): CObjectShapeField[] {
  const normalized: CObjectShapeField[] = []

  for (const field of fields) {
    normalized.push(normalizedObjectShapeField(field))
  }

  return normalized
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
    setElementType: field.setElementType
  }
}

export function resolveObjectExpressionMember(expression: AnyNode): CObjectFieldInfo | null {
  if (!isMemberAccessExpression(expression)) {
    return null
  }

  return resolveObjectExpressionShapeField(expression.object, expression.property)
}

export function emitObjectValueReference(name: string, context: ObjectFunctionContext): string {
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
    setElementType: field.setElementType
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

  const field = fields[index]

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
    setElementType: field.setElementType
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

  const objectName = knownObjectName(member)
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
      objectName: knownObjectName(member)
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
      key: knownObjectIndexKey(field),
      kind: 'key',
      objectName: knownObjectName(field)
    }

    return emitPreparedKnownObjectFieldValueExpression(field, expression, context, access)
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

  context.objectShapes.set(name, normalizeObjectShapeFields(fields))
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
  context.objectShapes.set(statement.name, normalizeObjectShapeFields(fields))

  for (let index = 0; index < fields.length; index = index + 1) {
    const field = fields[index]
    const property = findObjectProperty(properties, field.name)

    if (property != null) {
      const value = dependencies.emitCValueExpression(property.value, context)
      appendLines(lines, value.lines)
      lines.push(emitStatusCheck(`ccjs_object_init_known(${statement.name}, ${index}, ${value.expression})`, context))
    } else {
      if (field.optional !== true) {
        context.diagnostics.push(diagnostic('CCJS_MISSING_FIELD', `missing field ${field.name}`, statement.loc))
      }
    }
  }

  return lines
}

function objectVariableShapeFields(
  statement: AnyNode,
  context: ObjectFunctionContext,
  dependencies: ObjectVariableDeclarationDependencies
): CObjectShapeField[] {
  if (statement.shape != null && statement.shape.fields != null) {
    return statement.shape.fields
  }

  const fields: CObjectShapeField[] = []

  for (const property of statement.init.properties) {
    fields.push({
      name: property.key,
      readonlyField: false,
      valueType: dependencies.inferExpressionType(property.value, context)
    })
  }

  return fields
}
