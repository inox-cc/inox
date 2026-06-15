import { diagnostic } from '../../diagnostics.ts'
import { collectionConstructorNameFromPath } from '../../stdlib/descriptors/collections.ts'
import { emitPrepareOwnedValueWrite, emitStatusCheck, nextCName, registerOwnedValue } from '../context.ts'
import { emitRuntimeNullableValueCheck } from '../runtime-values.ts'
import { cRuntimeValueTag } from '../value-types.ts'
import type { CPreparedExpression as PreparedExpression } from '../types.ts'


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

const mapMethodDescriptors = {
  clear: { kind: 'clear', callName: 'ccjs_map_clear' },
  delete: { kind: 'boolean', callName: 'ccjs_map_delete', tempPrefix: 'ccjs_map_delete', hashSubject: 'Map keys' },
  get: { kind: 'get', callName: 'ccjs_map_get', tempPrefix: 'ccjs_map_value', hashSubject: 'Map keys' },
  has: { kind: 'boolean', callName: 'ccjs_map_has', tempPrefix: 'ccjs_map_has', hashSubject: 'Map keys' },
  set: { kind: 'set', callName: 'ccjs_map_set', hashSubject: 'Map keys' }
} as const

const setMethodDescriptors = {
  add: { kind: 'add', callName: 'ccjs_set_add', hashSubject: 'Set values' },
  clear: { kind: 'clear', callName: 'ccjs_set_clear' },
  delete: { kind: 'boolean', callName: 'ccjs_set_delete', tempPrefix: 'ccjs_set_delete', hashSubject: 'Set values' },
  has: { kind: 'boolean', callName: 'ccjs_set_has', tempPrefix: 'ccjs_set_has', hashSubject: 'Set values' }
} as const

const collectionSizeDescriptors = {
  map: { callName: 'ccjs_map_size', tempPrefix: 'ccjs_map_size' },
  set: { callName: 'ccjs_set_size', tempPrefix: 'ccjs_set_size' }
} as const

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
  const descriptor = mapMethodDescriptors[method]

  if (descriptor == null) {
    context.diagnostics.push(
      diagnostic('CCJS_C_COLLECTION', `Map.${method} is not supported by the current C backend slice`, expression.loc)
    )

    return {
      lines: [],
      expression: '0'
    }
  }

  if (descriptor.kind === 'clear') {
    return {
      lines: [emitStatusCheck(`${descriptor.callName}(${name})`, context)],
      expression: ''
    }
  }

  if (descriptor.kind === 'set') {
    collectionDeps(context).reportCCollectionHashability(
      collectionDeps(context).inferExpressionType(expression.args[0], context),
      descriptor.hashSubject,
      expression.args[0]?.loc ?? expression.loc,
      context
    )
    const key = collectionDeps(context).emitCValueExpression(expression.args[0], context)
    const value = collectionDeps(context).emitCValueExpression(expression.args[1], context)

    return {
      lines: [
        ...key.lines,
        ...value.lines,
        emitStatusCheck(`${descriptor.callName}(${name}, ${key.expression}, ${value.expression})`, context)
      ],
      expression: name
    }
  }

  if (descriptor.kind === 'get') {
    collectionDeps(context).reportCCollectionHashability(
      collectionDeps(context).inferExpressionType(expression.args[0], context),
      descriptor.hashSubject,
      expression.args[0]?.loc ?? expression.loc,
      context
    )
    const key = collectionDeps(context).emitCValueExpression(expression.args[0], context)
    const valueType = collectionDeps(context).inferExpressionType(expression, context)
    const expectedTag = cRuntimeValueTag(valueType)
    const out = nextCName(context, descriptor.tempPrefix)
    registerOwnedValue(context, out)

    const lines = [
      ...key.lines,
      ...emitPrepareOwnedValueWrite(out),
      emitStatusCheck(`${descriptor.callName}(${name}, ${key.expression}, &${out})`, context),
      ...emitRuntimeNullableValueCheck(out, expectedTag, context)
    ]

    return {
      lines,
      expression: out
    }
  }

  if (descriptor.kind === 'boolean') {
    collectionDeps(context).reportCCollectionHashability(
      collectionDeps(context).inferExpressionType(expression.args[0], context),
      descriptor.hashSubject,
      expression.args[0]?.loc ?? expression.loc,
      context
    )
    const key = collectionDeps(context).emitCValueExpression(expression.args[0], context)
    const out = nextCName(context, descriptor.tempPrefix)

    return {
      lines: [
        ...key.lines,
        `bool ${out} = false;`,
        emitStatusCheck(`${descriptor.callName}(${name}, ${key.expression}, &${out})`, context)
      ],
      expression: `(${out} ? 1 : 0)`
    }
  }

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
  const descriptor = setMethodDescriptors[method]

  if (descriptor == null) {
    context.diagnostics.push(
      diagnostic('CCJS_C_COLLECTION', `Set.${method} is not supported by the current C backend slice`, expression.loc)
    )

    return {
      lines: [],
      expression: '0'
    }
  }

  if (descriptor.kind === 'clear') {
    return {
      lines: [emitStatusCheck(`${descriptor.callName}(${name})`, context)],
      expression: ''
    }
  }

  if (descriptor.kind === 'add') {
    collectionDeps(context).reportCCollectionHashability(
      collectionDeps(context).inferExpressionType(expression.args[0], context),
      descriptor.hashSubject,
      expression.args[0]?.loc ?? expression.loc,
      context
    )
    const value = collectionDeps(context).emitCValueExpression(expression.args[0], context)

    return {
      lines: [...value.lines, emitStatusCheck(`${descriptor.callName}(${name}, ${value.expression})`, context)],
      expression: name
    }
  }

  if (descriptor.kind === 'boolean') {
    collectionDeps(context).reportCCollectionHashability(
      collectionDeps(context).inferExpressionType(expression.args[0], context),
      descriptor.hashSubject,
      expression.args[0]?.loc ?? expression.loc,
      context
    )
    const value = collectionDeps(context).emitCValueExpression(expression.args[0], context)
    const out = nextCName(context, descriptor.tempPrefix)

    return {
      lines: [
        ...value.lines,
        `bool ${out} = false;`,
        emitStatusCheck(`${descriptor.callName}(${name}, ${value.expression}, &${out})`, context)
      ],
      expression: `(${out} ? 1 : 0)`
    }
  }

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

  const descriptor = collectionSizeDescriptors[receiver.type]
  const out = nextCName(context, descriptor.tempPrefix)

  return {
    lines: [
      ...receiver.lines,
      `size_t ${out} = 0;`,
      emitStatusCheck(`${descriptor.callName}(${receiver.expression}, &${out})`, context)
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
