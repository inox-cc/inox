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
