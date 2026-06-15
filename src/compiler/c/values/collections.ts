import { diagnostic } from '../../diagnostics.ts'
import { collectionConstructorNameFromPath } from '../../stdlib/descriptors/collections.ts'
import { emitPrepareOwnedValueWrite, emitStatusCheck, nextCName, registerOwnedValue } from '../context.ts'
import { emitRuntimeNullableValueCheck } from '../runtime-values.ts'
import { cRuntimeValueTag } from '../value-types.ts'

type PreparedExpression = {
  lines: string[]
  expression: string
}

type PreparedCollectionCall = PreparedExpression

export type CollectionLoweringDependencies = {
  emitCValueExpression: (expression: any, context: any) => PreparedExpression
  inferExpressionType: (expression: any, context: any) => string
  isIndexAccessExpression: (expression: any) => boolean
  isMemberAccessExpression: (expression: any) => boolean
  reportCCollectionHashability: (valueType: string, subject: string, loc: any, context: any) => void
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

    const call = emitPreparedCollectionCallExpression(expression, context)

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

export function isCollectionConstructorExpression(expression: any): boolean {
  return collectionConstructorName(expression) != null
}

export function collectionConstructorName(expression: any): string | null {
  if (
    expression?.type !== 'NewExpression' ||
    expression.callee.type !== 'Reference' ||
    expression.callee.path.length !== 1
  ) {
    return null
  }

  return collectionConstructorNameFromPath(expression.callee.path)
}

export function emitPreparedCollectionCallExpression(expression, context): PreparedCollectionCall | null {
  if (expression?.type !== 'CallExpression' || expression.callee.type !== 'MemberExpression') {
    return null
  }

  const receiver = emitPreparedCollectionReceiver(expression.callee.object, context)

  if (receiver == null) {
    return null
  }

  const call =
    receiver.type === 'map'
      ? emitPreparedMapMethodCall(receiver.expression, expression, context)
      : emitPreparedSetMethodCall(receiver.expression, expression, context)

  return {
    lines: [...receiver.lines, ...call.lines],
    expression: call.expression
  }
}

function emitPreparedMapMethodCall(name, expression, context): PreparedExpression {
  const method = expression.callee.property

  if (method === 'clear') {
    return {
      lines: [emitStatusCheck(`ccjs_map_clear(${name})`, context)],
      expression: ''
    }
  }

  if (method === 'set') {
    collectionDeps(context).reportCCollectionHashability(
      collectionDeps(context).inferExpressionType(expression.args[0], context),
      'Map keys',
      expression.args[0]?.loc ?? expression.loc,
      context
    )
    const key = collectionDeps(context).emitCValueExpression(expression.args[0], context)
    const value = collectionDeps(context).emitCValueExpression(expression.args[1], context)

    return {
      lines: [
        ...key.lines,
        ...value.lines,
        emitStatusCheck(`ccjs_map_set(${name}, ${key.expression}, ${value.expression})`, context)
      ],
      expression: name
    }
  }

  if (method === 'get') {
    collectionDeps(context).reportCCollectionHashability(
      collectionDeps(context).inferExpressionType(expression.args[0], context),
      'Map keys',
      expression.args[0]?.loc ?? expression.loc,
      context
    )
    const key = collectionDeps(context).emitCValueExpression(expression.args[0], context)
    const valueType = collectionDeps(context).inferExpressionType(expression, context)
    const expectedTag = cRuntimeValueTag(valueType)
    const out = nextCName(context, 'ccjs_map_value')
    registerOwnedValue(context, out)

    const lines = [
      ...key.lines,
      ...emitPrepareOwnedValueWrite(out),
      emitStatusCheck(`ccjs_map_get(${name}, ${key.expression}, &${out})`, context),
      ...emitRuntimeNullableValueCheck(out, expectedTag, context)
    ]

    return {
      lines,
      expression: out
    }
  }

  if (method === 'has' || method === 'delete') {
    collectionDeps(context).reportCCollectionHashability(
      collectionDeps(context).inferExpressionType(expression.args[0], context),
      'Map keys',
      expression.args[0]?.loc ?? expression.loc,
      context
    )
    const key = collectionDeps(context).emitCValueExpression(expression.args[0], context)
    const out = nextCName(context, `ccjs_map_${method}`)
    const helper = method === 'has' ? 'ccjs_map_has' : 'ccjs_map_delete'

    return {
      lines: [
        ...key.lines,
        `bool ${out} = false;`,
        emitStatusCheck(`${helper}(${name}, ${key.expression}, &${out})`, context)
      ],
      expression: `(${out} ? 1 : 0)`
    }
  }

  context.diagnostics.push(
    diagnostic('CCJS_C_COLLECTION', `Map.${method} is not supported by the current C backend slice`, expression.loc)
  )

  return {
    lines: [],
    expression: '0'
  }
}

export function emitPreparedMapIndexGetExpression(expression, context): PreparedExpression | null {
  const mapIndex = emitPreparedMapIndexReceiver(expression, context)

  if (mapIndex == null) {
    return null
  }

  collectionDeps(context).reportCCollectionHashability(
    collectionDeps(context).inferExpressionType(mapIndex.key, context),
    'Map keys',
    mapIndex.key.loc ?? expression.loc,
    context
  )
  const key = collectionDeps(context).emitCValueExpression(mapIndex.key, context)
  const valueType = collectionDeps(context).inferExpressionType(expression, context)
  const expectedTag = cRuntimeValueTag(valueType)
  const out = nextCName(context, 'ccjs_map_value')
  registerOwnedValue(context, out)

  return {
    lines: [
      ...mapIndex.receiver.lines,
      ...key.lines,
      ...emitPrepareOwnedValueWrite(out),
      emitStatusCheck(`ccjs_map_get(${mapIndex.receiver.expression}, ${key.expression}, &${out})`, context),
      ...emitRuntimeNullableValueCheck(out, expectedTag, context)
    ],
    expression: out
  }
}

export function emitPreparedMapIndexAssignment(expression, context): PreparedExpression | null {
  if (expression?.type !== 'AssignmentExpression') {
    return null
  }

  const mapIndex = emitPreparedMapIndexReceiver(expression.target, context)

  if (mapIndex == null) {
    return null
  }

  collectionDeps(context).reportCCollectionHashability(
    collectionDeps(context).inferExpressionType(mapIndex.key, context),
    'Map keys',
    mapIndex.key.loc ?? expression.target.loc,
    context
  )
  const key = collectionDeps(context).emitCValueExpression(mapIndex.key, context)
  const value = collectionDeps(context).emitCValueExpression(expression.value, context)

  return {
    lines: [
      ...mapIndex.receiver.lines,
      ...key.lines,
      ...value.lines,
      emitStatusCheck(`ccjs_map_set(${mapIndex.receiver.expression}, ${key.expression}, ${value.expression})`, context)
    ],
    expression: ''
  }
}

function emitPreparedMapIndexReceiver(expression, context) {
  if (expression?.type !== 'IndexExpression' || expression.collectionKind !== 'map') {
    return null
  }

  const receiver = emitPreparedCollectionReceiver(expression.object, context)

  if (receiver == null || receiver.type !== 'map') {
    return null
  }

  return {
    receiver,
    key: expression.index
  }
}

function emitPreparedSetMethodCall(name, expression, context): PreparedExpression {
  const method = expression.callee.property

  if (method === 'clear') {
    return {
      lines: [emitStatusCheck(`ccjs_set_clear(${name})`, context)],
      expression: ''
    }
  }

  if (method === 'add') {
    collectionDeps(context).reportCCollectionHashability(
      collectionDeps(context).inferExpressionType(expression.args[0], context),
      'Set values',
      expression.args[0]?.loc ?? expression.loc,
      context
    )
    const value = collectionDeps(context).emitCValueExpression(expression.args[0], context)

    return {
      lines: [...value.lines, emitStatusCheck(`ccjs_set_add(${name}, ${value.expression})`, context)],
      expression: name
    }
  }

  if (method === 'has' || method === 'delete') {
    collectionDeps(context).reportCCollectionHashability(
      collectionDeps(context).inferExpressionType(expression.args[0], context),
      'Set values',
      expression.args[0]?.loc ?? expression.loc,
      context
    )
    const value = collectionDeps(context).emitCValueExpression(expression.args[0], context)
    const out = nextCName(context, `ccjs_set_${method}`)
    const helper = method === 'has' ? 'ccjs_set_has' : 'ccjs_set_delete'

    return {
      lines: [
        ...value.lines,
        `bool ${out} = false;`,
        emitStatusCheck(`${helper}(${name}, ${value.expression}, &${out})`, context)
      ],
      expression: `(${out} ? 1 : 0)`
    }
  }

  context.diagnostics.push(
    diagnostic('CCJS_C_COLLECTION', `Set.${method} is not supported by the current C backend slice`, expression.loc)
  )

  return {
    lines: [],
    expression: '0'
  }
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
