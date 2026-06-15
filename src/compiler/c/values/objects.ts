import { emitPrepareOwnedValueWrite, emitStatusCheck, nextCName, registerOwnedValue } from '../context.ts'
import { diagnostic } from '../../diagnostics.ts'
import { cStringLiteral } from '../identifiers.ts'

type PreparedExpression = {
  lines: string[]
  expression: string
}

export type ObjectVariableDeclarationDependencies = {
  emitCFieldFlags: (field: any) => string
  emitCValueExpression: (expression: any, context: any) => PreparedExpression
  inferExpressionType: (expression: any, context: any) => string
}

export function isMemberAccessExpression(expression) {
  return expression?.type === 'MemberExpression' || expression?.type === 'OptionalMemberExpression'
}

export function isIndexAccessExpression(expression) {
  return expression?.type === 'IndexExpression' || expression?.type === 'OptionalIndexExpression'
}

export function resolveKnownObjectMember(expression, context) {
  if (!isMemberAccessExpression(expression)) {
    return null
  }

  const objectName = resolveCObjectExpressionName(expression.object)

  if (objectName == null) {
    return null
  }

  const fields = context.objectShapes.get(objectName)

  if (fields == null) {
    return null
  }

  const index = fields.findIndex((field) => field.name === expression.property)

  if (index === -1) {
    return null
  }

  return {
    objectName,
    key: null,
    index,
    valueType: fields[index].valueType,
    arrayElementType: fields[index].arrayElementType,
    mapKeyType: fields[index].mapKeyType,
    mapValueType: fields[index].mapValueType,
    setElementType: fields[index].setElementType
  }
}

export function resolveObjectExpressionMember(expression) {
  if (!isMemberAccessExpression(expression)) {
    return null
  }

  return resolveObjectExpressionShapeField(expression.object, expression.property)
}

export function emitObjectValueReference(name, context) {
  return context.boxedVariables.has(name) && context.variables.get(name) === 'object' ? `(*${name})` : name
}

export function resolveKnownObjectIndex(expression, context) {
  if (!isIndexAccessExpression(expression) || expression.index.type !== 'StringLiteral') {
    return null
  }

  const objectName = resolveCObjectExpressionName(expression.object)

  if (objectName == null) {
    return null
  }

  const fields = context.objectShapes.get(objectName)

  if (fields == null) {
    return null
  }

  const index = fields.findIndex((field) => field.name === expression.index.value)

  if (index === -1) {
    return null
  }

  return {
    objectName,
    key: expression.index.value,
    index,
    valueType: fields[index].valueType,
    arrayElementType: fields[index].arrayElementType,
    mapKeyType: fields[index].mapKeyType,
    mapValueType: fields[index].mapValueType,
    setElementType: fields[index].setElementType
  }
}

export function resolveObjectExpressionIndex(expression) {
  if (!isIndexAccessExpression(expression) || expression.index.type !== 'StringLiteral') {
    return null
  }

  return resolveObjectExpressionShapeField(expression.object, expression.index.value)
}

function resolveObjectExpressionShapeField(objectExpression, key) {
  const fields = objectExpression?.shape?.fields

  if (fields == null) {
    return null
  }

  const index = fields.findIndex((field) => field.name === key)

  if (index === -1) {
    return null
  }

  return {
    key,
    index,
    valueType: fields[index].valueType,
    arrayElementType: fields[index].arrayElementType,
    mapKeyType: fields[index].mapKeyType,
    mapValueType: fields[index].mapValueType,
    setElementType: fields[index].setElementType
  }
}

export function resolveCObjectExpressionName(expression) {
  if (expression?.type === 'Reference' && expression.path.length === 1) {
    return expression.path[0]
  }

  if (expression?.type === 'ThisExpression') {
    return 'this'
  }

  return null
}

export function updateKnownObjectMemberValueType(member, valueType, context) {
  if (valueType === 'unknown') {
    return
  }

  const fields = context.objectShapes.get(member.objectName)

  if (fields == null || fields[member.index] == null) {
    return
  }

  fields[member.index] = {
    ...fields[member.index],
    valueType
  }
}

export function registerObjectShape(context, name, shape) {
  if (shape?.fields == null) {
    return
  }

  context.objectShapes.set(
    name,
    shape.fields.map((field) => ({
      name: field.name,
      ownership: field.ownership ?? 'strong',
      valueType: field.valueType,
      arrayElementType: field.arrayElementType,
      mapKeyType: field.mapKeyType,
      mapValueType: field.mapValueType,
      setElementType: field.setElementType
    }))
  )
}

export function emitObjectVariableDeclaration(statement, context, dependencies: ObjectVariableDeclarationDependencies) {
  const shapeName = nextCName(context, `ccjs_shape_${statement.name}`)
  const fieldsName = `${shapeName}_fields`
  const fields =
    statement.shape?.fields ??
    statement.init.properties.map((property) => ({
      name: property.key,
      readonly: false,
      valueType: dependencies.inferExpressionType(property.value, context)
    }))
  const properties = new Map<string, any>(statement.init.properties.map((property) => [property.key, property]))
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
  lines.push(...emitPrepareOwnedValueWrite(statement.name))
  lines.push(emitStatusCheck(`ccjs_object_new(&ccjs_default_allocator, &${shapeName}, &${statement.name})`, context))

  context.variables.set(statement.name, 'object')
  context.objectShapes.set(
    statement.name,
    fields.map((field) => ({
      name: field.name,
      ownership: field.ownership ?? 'strong',
      valueType: field.valueType,
      arrayElementType: field.arrayElementType,
      mapKeyType: field.mapKeyType,
      mapValueType: field.mapValueType,
      setElementType: field.setElementType
    }))
  )

  for (const [index, field] of fields.entries()) {
    const property = properties.get(field.name)

    if (property == null) {
      context.diagnostics.push(diagnostic('CCJS_MISSING_FIELD', `missing field ${field.name}`, statement.loc))
      continue
    }

    const value = dependencies.emitCValueExpression(property.value, context)
    lines.push(...value.lines)
    lines.push(emitStatusCheck(`ccjs_object_init_known(${statement.name}, ${index}, ${value.expression})`, context))
  }

  return lines
}
