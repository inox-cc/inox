import { emitStatusCheck, nextCName } from '../context.ts'

type PreparedExpression = {
  lines: string[]
  expression: string
}

type PreparedCollectionCall = PreparedExpression

export type CollectionLoweringDependencies = {
  emitCValueExpression: (expression: any, context: any) => PreparedExpression
  emitPreparedCollectionCallExpression: (expression: any, context: any) => PreparedCollectionCall | null
  inferExpressionType: (expression: any, context: any) => string
  isIndexAccessExpression: (expression: any) => boolean
  isMemberAccessExpression: (expression: any) => boolean
  resolveKnownObjectIndex: (expression: any, context: any) => any | null
  resolveKnownObjectMember: (expression: any, context: any) => any | null
}

function collectionDeps(context: any): CollectionLoweringDependencies {
  return context.collectionLoweringDependencies
}

export function emitPreparedCollectionReceiver(expression, context) {
  if (expression?.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]
    const type = context.variables.get(name)

    return type === 'map' || type === 'set'
      ? {
          type,
          lines: [],
          expression: name
        }
      : null
  }

  if (expression?.type === 'CallExpression') {
    const valueType = collectionDeps(context).inferExpressionType(expression, context)

    if (valueType !== 'map' && valueType !== 'set') {
      return null
    }

    const call = collectionDeps(context).emitPreparedCollectionCallExpression(expression, context)

    if (call != null && call.expression !== '') {
      return {
        type: valueType,
        lines: call.lines,
        expression: call.expression
      }
    }

    const value = collectionDeps(context).emitCValueExpression(expression, context)

    return {
      type: valueType,
      lines: value.lines,
      expression: value.expression
    }
  }

  if (collectionDeps(context).isMemberAccessExpression(expression) || collectionDeps(context).isIndexAccessExpression(expression)) {
    const valueType = collectionDeps(context).inferExpressionType(expression, context)

    if (valueType !== 'map' && valueType !== 'set') {
      return null
    }

    const value = collectionDeps(context).emitCValueExpression(expression, context)

    return {
      type: valueType,
      lines: value.lines,
      expression: value.expression
    }
  }

  return null
}

export function emitPreparedCollectionSizeExpression(expression, context) {
  if (expression?.type !== 'MemberExpression' || expression.property !== 'size') {
    return null
  }

  const receiver = emitPreparedCollectionReceiver(expression.object, context)

  if (receiver == null) {
    return null
  }

  const out = nextCName(context, `ccjs_${receiver.type}_size`)
  const helper = receiver.type === 'map' ? 'ccjs_map_size' : 'ccjs_set_size'

  return {
    lines: [
      ...receiver.lines,
      `size_t ${out} = 0;`,
      emitStatusCheck(`${helper}(${receiver.expression}, &${out})`, context)
    ],
    expression: out
  }
}

export function resolveRuntimeSetElementType(expression, context) {
  if (expression?.type === 'Reference' && expression.path.length === 1) {
    return context.setElementTypes.get(expression.path[0]) ?? null
  }

  if (expression?.type === 'CallExpression' || expression?.type === 'NewExpression') {
    const functionReturn = expression.type === 'CallExpression' ? resolveFunctionReturnNameFromCall(expression) : null

    return expression.valueType === 'set'
      ? (expression.setElementType ??
          (functionReturn == null ? null : context.functionReturnSetElementTypes.get(functionReturn)) ??
          'unknown')
      : null
  }

  if (expression?.type === 'MemberExpression') {
    const member = collectionDeps(context).resolveKnownObjectMember(expression, context)

    return member?.valueType === 'set' ? (member.setElementType ?? 'unknown') : null
  }

  if (expression?.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
    const field = collectionDeps(context).resolveKnownObjectIndex(expression, context)

    return field?.valueType === 'set' ? (field.setElementType ?? 'unknown') : null
  }

  return null
}

export function resolveRuntimeMapType(expression, context) {
  if (expression?.type === 'Reference' && expression.path.length === 1) {
    return context.mapTypes.get(expression.path[0]) ?? null
  }

  if (expression?.type === 'CallExpression' || expression?.type === 'NewExpression') {
    const functionReturn = expression.type === 'CallExpression' ? resolveFunctionReturnNameFromCall(expression) : null
    const functionReturnMap =
      functionReturn == null ? null : (context.functionReturnMapTypes.get(functionReturn) ?? null)

    return expression.valueType === 'map'
      ? {
          key: expression.mapKeyType ?? functionReturnMap?.key ?? 'unknown',
          value: expression.mapValueType ?? functionReturnMap?.value ?? 'unknown'
        }
      : null
  }

  if (expression?.type === 'MemberExpression') {
    const member = collectionDeps(context).resolveKnownObjectMember(expression, context)

    return member?.valueType === 'map'
      ? {
          key: member.mapKeyType ?? 'unknown',
          value: member.mapValueType ?? 'unknown'
        }
      : null
  }

  if (expression?.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
    const field = collectionDeps(context).resolveKnownObjectIndex(expression, context)

    return field?.valueType === 'map'
      ? {
          key: field.mapKeyType ?? 'unknown',
          value: field.mapValueType ?? 'unknown'
        }
      : null
  }

  return null
}

function resolveFunctionReturnNameFromCall(expression) {
  return expression?.type === 'CallExpression' &&
    expression.callee.type === 'Reference' &&
    expression.callee.path.length === 1
    ? expression.callee.path[0]
    : null
}

export function resolveRuntimeForOfSet(expression, context) {
  const elementType = resolveRuntimeSetElementType(expression, context)

  if (elementType == null) {
    return null
  }

  const receiver = emitPreparedCollectionReceiver(expression, context)

  if (receiver == null || receiver.type !== 'set') {
    return null
  }

  return {
    name: receiver.expression,
    elementType,
    lines: receiver.lines
  }
}

export function resolveRuntimeForOfMap(expression, context) {
  const mapType = resolveRuntimeMapType(expression, context)

  if (mapType == null) {
    return null
  }

  const receiver = emitPreparedCollectionReceiver(expression, context)

  if (receiver == null || receiver.type !== 'map') {
    return null
  }

  return {
    name: receiver.expression,
    keyType: mapType.key,
    valueType: mapType.value,
    lines: receiver.lines
  }
}
