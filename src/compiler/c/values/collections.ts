import { diagnostic } from '../../diagnostics.ts'
import { collectionConstructorNameFromPath } from '../../stdlib/descriptors/collections.ts'
import {
  emitPrepareOwnedValueWrite,
  emitStatusCheck,
  nextCName,
  registerOwnedValue
} from '../context.ts'
import { emitRuntimeNullableValueCheck } from '../runtime-values.ts'
import { cRuntimeValueTag } from '../value-types.ts'
import type { AnyNode, Diagnostic, SourceLocation } from '../../types.ts'
import type {
  CFunctionReturnMapType,
  CObjectFieldInfo,
  CObjectIndexFieldInfo,
  CObjectShapeField,
  CPreparedExpression as PreparedExpression
} from '../types.ts'

type PreparedCollectionCall = PreparedExpression
type CollectionNode = AnyNode
type CFunctionReturnMapTypeMap = Map<string, CFunctionReturnMapType>
type CObjectShapeFieldMap = Map<string, CObjectShapeField[]>
type CStringMap = Map<string, string>
type CStringNullableMap = Map<string, string | null>

type CollectionFunctionContext = {
  boxedVariables: Set<string>
  cleanupEnabled: boolean
  collectionLoweringDependencies?: CollectionLoweringDependencies
  diagnostics: Diagnostic[]
  failureStatement?: string | null
  failureStatementUsed?: boolean
  functionReturnMapTypes?: CFunctionReturnMapTypeMap
  functionReturnSetElementTypes?: CStringNullableMap
  mapTypes: CFunctionReturnMapTypeMap
  nextId: number
  objectShapes: CObjectShapeFieldMap
  ownedValues: string[]
  returnType?: string
  setElementTypes: CStringMap
  statusReturn: boolean
  throwingFunction: boolean
  usedCleanupGoto: boolean
  variables: CStringMap
}

export type CollectionLoweringDependencies = {
  emitCValueExpression(expression: AnyNode, context: CollectionFunctionContext): PreparedExpression
  inferExpressionType(expression: AnyNode, context: CollectionFunctionContext): string
  isIndexAccessExpression(expression: AnyNode): boolean
  isMemberAccessExpression(expression: AnyNode): boolean
  reportCCollectionHashability(
    valueType: string,
    subject: string,
    loc: SourceLocation | null | undefined,
    context: CollectionFunctionContext
  ): void
  resolveKnownObjectIndex(expression: AnyNode, context: CollectionFunctionContext): CObjectIndexFieldInfo | null
  resolveKnownObjectMember(expression: AnyNode, context: CollectionFunctionContext): CObjectFieldInfo | null
}

type PreparedCollectionReceiver = {
  type: 'map' | 'set'
  lines: string[]
  expression: string
}

type PreparedMapIndexReceiver = {
  receiver: PreparedCollectionReceiver
  key: AnyNode
}

type RuntimeMapType = {
  key: string
  value: string
}

type RuntimeForOfSet = {
  name: string
  elementType: string
  lines: string[]
}

type RuntimeForOfMap = {
  name: string
  keyType: string
  valueType: string
  lines: string[]
}

function emitFallbackCollectionValueExpression(
  _expression: AnyNode,
  _context: CollectionFunctionContext
): PreparedExpression {
  return {
    lines: [],
    expression: 'ccjs_undefined_value()'
  }
}

function inferFallbackCollectionExpressionType(
  _expression: AnyNode,
  _context: CollectionFunctionContext
): string {
  return 'unknown'
}

function isFallbackCollectionAccessExpression(_expression: AnyNode): boolean {
  return false
}

function reportFallbackCollectionHashability(
  _valueType: string,
  _subject: string,
  _loc: SourceLocation | null | undefined,
  _context: CollectionFunctionContext
): void {}

function resolveFallbackCollectionObjectIndex(
  _expression: AnyNode,
  _context: CollectionFunctionContext
): CObjectIndexFieldInfo | null {
  return null
}

function resolveFallbackCollectionObjectMember(
  _expression: AnyNode,
  _context: CollectionFunctionContext
): CObjectFieldInfo | null {
  return null
}

const fallbackCollectionLoweringDependencies: CollectionLoweringDependencies = {
  emitCValueExpression: emitFallbackCollectionValueExpression,
  inferExpressionType: inferFallbackCollectionExpressionType,
  isIndexAccessExpression: isFallbackCollectionAccessExpression,
  isMemberAccessExpression: isFallbackCollectionAccessExpression,
  reportCCollectionHashability: reportFallbackCollectionHashability,
  resolveKnownObjectIndex: resolveFallbackCollectionObjectIndex,
  resolveKnownObjectMember: resolveFallbackCollectionObjectMember
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

function collectionDeps(context: CollectionFunctionContext): CollectionLoweringDependencies {
  const deps = context.collectionLoweringDependencies

  if (deps != null) {
    return deps
  }

  context.diagnostics.push(diagnostic('CCJS_C_COLLECTION', 'collection lowering dependencies are not configured'))

  return fallbackCollectionLoweringDependencies
}

function pushAllLines(target: string[], source: string[]): void {
  for (const line of source) {
    target.push(line)
  }
}

function nodeLocOrFallback(
  node: AnyNode | null | undefined,
  fallback: SourceLocation | null | undefined
): SourceLocation | null | undefined {
  if (node != null && node.loc != null) {
    return node.loc
  }

  return fallback
}

function stringOrUnknown(value: string | null | undefined): string {
  if (value != null) {
    return value
  }

  return 'unknown'
}

function functionReturnMapType(
  context: CollectionFunctionContext,
  functionReturn: string
): CFunctionReturnMapType | null {
  const functionReturnMapTypes = context.functionReturnMapTypes

  if (functionReturnMapTypes == null) {
    return null
  }

  const mapType = functionReturnMapTypes.get(functionReturn)

  if (mapType != null) {
    return mapType
  }

  return null
}

function functionReturnSetElementType(context: CollectionFunctionContext, functionReturn: string): string | null {
  const functionReturnSetElementTypes = context.functionReturnSetElementTypes

  if (functionReturnSetElementTypes == null) {
    return null
  }

  const elementType = functionReturnSetElementTypes.get(functionReturn)

  if (elementType != null) {
    return elementType
  }

  return null
}

export function emitPreparedCollectionReceiver(
  expression: AnyNode,
  context: CollectionFunctionContext
): PreparedCollectionReceiver | null {
  if (expression.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]
    const receiverType = context.variables.get(name)

    if (receiverType === 'map' || receiverType === 'set') {
      return {
        type: receiverType,
        lines: [],
        expression: name
      }
    }

    return null
  }

  if (expression.type === 'CallExpression') {
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

export function isCollectionConstructorExpression(expression: AnyNode | null | undefined): boolean {
  return collectionConstructorName(expression) != null
}

export function collectionConstructorName(expression: AnyNode | null | undefined): string | null {
  if (
    expression == null ||
    expression.type !== 'NewExpression' ||
    expression.callee.type !== 'Reference' ||
    expression.callee.path.length !== 1
  ) {
    return null
  }

  return collectionConstructorNameFromPath(expression.callee.path)
}

export function emitPreparedCollectionConstructorValueExpression(
  expression: CollectionNode | null | undefined,
  context: CollectionFunctionContext
): PreparedExpression | null {
  if (expression == null) {
    return null
  }

  const collectionConstructor = collectionConstructorName(expression)

  if (collectionConstructor == null) {
    return null
  }

  if (expression.args.length > 1) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_COLLECTION',
        'C collection constructors currently support at most one array literal iterable',
        expression.loc
      )
    )
  }

  let tempPrefix = 'ccjs_set'

  if (collectionConstructor === 'Map') {
    tempPrefix = 'ccjs_map'
  }

  const temp = nextCName(context, tempPrefix)
  const lines: string[] = []

  registerOwnedValue(context, temp)
  pushAllLines(lines, emitPrepareOwnedValueWrite(temp))

  if (collectionConstructor === 'Map') {
    collectionDeps(context).reportCCollectionHashability(expression.mapKeyType, 'Map keys', expression.loc, context)
    lines.push(emitStatusCheck(`ccjs_map_new(&ccjs_default_allocator, &${temp})`, context))
    pushAllLines(lines, emitMapConstructorValueEntries(temp, expression.args[0], context, expression.loc))

    return {
      lines,
      expression: temp
    }
  }

  collectionDeps(context).reportCCollectionHashability(expression.setElementType, 'Set values', expression.loc, context)
  lines.push(emitStatusCheck(`ccjs_set_new(&ccjs_default_allocator, &${temp})`, context))
  pushAllLines(lines, emitSetConstructorValueElements(temp, expression.args[0], context, expression.loc))

  return {
    lines,
    expression: temp
  }
}

function emitMapConstructorValueEntries(
  name: string,
  expression: CollectionNode | null | undefined,
  context: CollectionFunctionContext,
  loc: SourceLocation | null | undefined
): string[] {
  if (expression == null) {
    return []
  }

  if (expression.type !== 'ArrayLiteral') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_COLLECTION',
        'C Map constructor currently supports only array literal entries',
        nodeLocOrFallback(expression, loc)
      )
    )
    return []
  }

  const lines: string[] = []

  for (const entry of expression.elements) {
    if (entry.type !== 'ArrayLiteral' || entry.elements.length !== 2) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_COLLECTION',
          'C Map constructor entries must be [key, value] array literals',
          nodeLocOrFallback(entry, loc)
        )
      )
      continue
    }

    const deps = collectionDeps(context)
    const keyNode = entry.elements[0]
    const valueNode = entry.elements[1]
    const key = deps.emitCValueExpression(keyNode, context)
    const value = deps.emitCValueExpression(valueNode, context)

    deps.reportCCollectionHashability(
      deps.inferExpressionType(keyNode, context),
      'Map keys',
      nodeLocOrFallback(keyNode, nodeLocOrFallback(entry, loc)),
      context
    )

    pushAllLines(lines, key.lines)
    pushAllLines(lines, value.lines)
    lines.push(emitStatusCheck(`ccjs_map_set(${name}, ${key.expression}, ${value.expression})`, context))
  }

  return lines
}

function emitSetConstructorValueElements(
  name: string,
  expression: CollectionNode | null | undefined,
  context: CollectionFunctionContext,
  loc: SourceLocation | null | undefined
): string[] {
  if (expression == null) {
    return []
  }

  if (expression.type !== 'ArrayLiteral') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_COLLECTION',
        'C Set constructor currently supports only array literal values',
        nodeLocOrFallback(expression, loc)
      )
    )
    return []
  }

  const deps = collectionDeps(context)
  const lines: string[] = []

  for (const element of expression.elements) {
    const value = deps.emitCValueExpression(element, context)

    deps.reportCCollectionHashability(
      deps.inferExpressionType(element, context),
      'Set values',
      nodeLocOrFallback(element, loc),
      context
    )

    pushAllLines(lines, value.lines)
    lines.push(emitStatusCheck(`ccjs_set_add(${name}, ${value.expression})`, context))
  }

  return lines
}

export function emitPreparedCollectionCallExpression(
  expression: AnyNode | null | undefined,
  context: CollectionFunctionContext
): PreparedCollectionCall | null {
  if (expression == null || expression.type !== 'CallExpression' || expression.callee.type !== 'MemberExpression') {
    return null
  }

  const receiver = emitPreparedCollectionReceiver(expression.callee.object, context)

  if (receiver != null) {
    if (receiver.type === 'map') {
      const call = emitPreparedMapMethodCall(receiver.expression, expression, context)

      return createPreparedCollectionMethodCall(receiver, call)
    }

    const call = emitPreparedSetMethodCall(receiver.expression, expression, context)

    return createPreparedCollectionMethodCall(receiver, call)
  }

  return null
}

function createPreparedCollectionMethodCall(
  receiver: PreparedCollectionReceiver,
  call: PreparedExpression
): PreparedCollectionCall {
  const lines: string[] = []
  pushAllLines(lines, receiver.lines)
  pushAllLines(lines, call.lines)

  return {
    lines,
    expression: call.expression
  }
}

function emitPreparedMapMethodCall(name: string, expression: AnyNode, context: CollectionFunctionContext): PreparedExpression {
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
    const keyArg = expression.args[0]
    const valueArg = expression.args[1]
    collectionDeps(context).reportCCollectionHashability(
      collectionDeps(context).inferExpressionType(keyArg, context),
      descriptor.hashSubject,
      nodeLocOrFallback(keyArg, expression.loc),
      context
    )
    const key = collectionDeps(context).emitCValueExpression(keyArg, context)
    const value = collectionDeps(context).emitCValueExpression(valueArg, context)
    const lines: string[] = []
    pushAllLines(lines, key.lines)
    pushAllLines(lines, value.lines)
    lines.push(emitStatusCheck(`${descriptor.callName}(${name}, ${key.expression}, ${value.expression})`, context))

    return {
      lines,
      expression: name
    }
  }

  if (descriptor.kind === 'get') {
    const keyArg = expression.args[0]
    collectionDeps(context).reportCCollectionHashability(
      collectionDeps(context).inferExpressionType(keyArg, context),
      descriptor.hashSubject,
      nodeLocOrFallback(keyArg, expression.loc),
      context
    )
    const key = collectionDeps(context).emitCValueExpression(keyArg, context)
    const valueType = collectionDeps(context).inferExpressionType(expression, context)
    const expectedTag = cRuntimeValueTag(valueType)
    const out = nextCName(context, descriptor.tempPrefix)
    registerOwnedValue(context, out)

    const lines: string[] = []
    pushAllLines(lines, key.lines)
    pushAllLines(lines, emitPrepareOwnedValueWrite(out))
    lines.push(emitStatusCheck(`${descriptor.callName}(${name}, ${key.expression}, &${out})`, context))
    pushAllLines(lines, emitRuntimeNullableValueCheck(out, expectedTag, context))

    return {
      lines,
      expression: out
    }
  }

  if (descriptor.kind === 'boolean') {
    const keyArg = expression.args[0]
    collectionDeps(context).reportCCollectionHashability(
      collectionDeps(context).inferExpressionType(keyArg, context),
      descriptor.hashSubject,
      nodeLocOrFallback(keyArg, expression.loc),
      context
    )
    const key = collectionDeps(context).emitCValueExpression(keyArg, context)
    const out = nextCName(context, descriptor.tempPrefix)
    const lines: string[] = []
    pushAllLines(lines, key.lines)
    lines.push(`bool ${out} = false;`)
    lines.push(emitStatusCheck(`${descriptor.callName}(${name}, ${key.expression}, &${out})`, context))

    return {
      lines,
      expression: `(${out} ? 1 : 0)`
    }
  }

  return {
    lines: [],
    expression: '0'
  }
}

export function emitPreparedMapIndexGetExpression(
  expression: AnyNode,
  context: CollectionFunctionContext
): PreparedExpression | null {
  const mapIndex = emitPreparedMapIndexReceiver(expression, context)

  if (mapIndex != null) {
    collectionDeps(context).reportCCollectionHashability(
      collectionDeps(context).inferExpressionType(mapIndex.key, context),
      'Map keys',
      nodeLocOrFallback(mapIndex.key, expression.loc),
      context
    )
    const key = collectionDeps(context).emitCValueExpression(mapIndex.key, context)
    const valueType = collectionDeps(context).inferExpressionType(expression, context)
    const expectedTag = cRuntimeValueTag(valueType)
    const out = nextCName(context, 'ccjs_map_value')
    registerOwnedValue(context, out)

    const lines: string[] = []
    pushAllLines(lines, mapIndex.receiver.lines)
    pushAllLines(lines, key.lines)
    pushAllLines(lines, emitPrepareOwnedValueWrite(out))
    lines.push(emitStatusCheck(`ccjs_map_get(${mapIndex.receiver.expression}, ${key.expression}, &${out})`, context))
    pushAllLines(lines, emitRuntimeNullableValueCheck(out, expectedTag, context))

    return {
      lines,
      expression: out
    }
  }

  return null
}

export function emitPreparedMapIndexAssignment(
  expression: AnyNode,
  context: CollectionFunctionContext
): PreparedExpression | null {
  if (expression.type !== 'AssignmentExpression') {
    return null
  }

  const mapIndex = emitPreparedMapIndexReceiver(expression.target, context)

  if (mapIndex != null) {
    collectionDeps(context).reportCCollectionHashability(
      collectionDeps(context).inferExpressionType(mapIndex.key, context),
      'Map keys',
      nodeLocOrFallback(mapIndex.key, expression.target.loc),
      context
    )
    const key = collectionDeps(context).emitCValueExpression(mapIndex.key, context)
    const value = collectionDeps(context).emitCValueExpression(expression.value, context)
    const lines: string[] = []
    pushAllLines(lines, mapIndex.receiver.lines)
    pushAllLines(lines, key.lines)
    pushAllLines(lines, value.lines)
    lines.push(emitStatusCheck(`ccjs_map_set(${mapIndex.receiver.expression}, ${key.expression}, ${value.expression})`, context))

    return {
      lines,
      expression: ''
    }
  }

  return null
}

function emitPreparedMapIndexReceiver(
  expression: AnyNode,
  context: CollectionFunctionContext
): PreparedMapIndexReceiver | null {
  if (expression.type !== 'IndexExpression' || expression.collectionKind !== 'map') {
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

function emitPreparedSetMethodCall(name: string, expression: AnyNode, context: CollectionFunctionContext): PreparedExpression {
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
    const valueArg = expression.args[0]
    collectionDeps(context).reportCCollectionHashability(
      collectionDeps(context).inferExpressionType(valueArg, context),
      descriptor.hashSubject,
      nodeLocOrFallback(valueArg, expression.loc),
      context
    )
    const value = collectionDeps(context).emitCValueExpression(valueArg, context)
    const lines: string[] = []
    pushAllLines(lines, value.lines)
    lines.push(emitStatusCheck(`${descriptor.callName}(${name}, ${value.expression})`, context))

    return {
      lines,
      expression: name
    }
  }

  if (descriptor.kind === 'boolean') {
    const valueArg = expression.args[0]
    collectionDeps(context).reportCCollectionHashability(
      collectionDeps(context).inferExpressionType(valueArg, context),
      descriptor.hashSubject,
      nodeLocOrFallback(valueArg, expression.loc),
      context
    )
    const value = collectionDeps(context).emitCValueExpression(valueArg, context)
    const out = nextCName(context, descriptor.tempPrefix)
    const lines: string[] = []
    pushAllLines(lines, value.lines)
    lines.push(`bool ${out} = false;`)
    lines.push(emitStatusCheck(`${descriptor.callName}(${name}, ${value.expression}, &${out})`, context))

    return {
      lines,
      expression: `(${out} ? 1 : 0)`
    }
  }

  return {
    lines: [],
    expression: '0'
  }
}

export function emitPreparedCollectionSizeExpression(
  expression: AnyNode,
  context: CollectionFunctionContext
): PreparedExpression | null {
  if (expression.type !== 'MemberExpression' || expression.property !== 'size') {
    return null
  }

  const receiver = emitPreparedCollectionReceiver(expression.object, context)

  if (receiver != null) {
    const descriptor = collectionSizeDescriptors[receiver.type]
    const out = nextCName(context, descriptor.tempPrefix)
    const lines: string[] = []
    pushAllLines(lines, receiver.lines)
    lines.push(`size_t ${out} = 0;`)
    lines.push(emitStatusCheck(`${descriptor.callName}(${receiver.expression}, &${out})`, context))

    return {
      lines,
      expression: out
    }
  }

  return null
}

export function resolveRuntimeSetElementType(expression: AnyNode, context: CollectionFunctionContext): string | null {
  if (expression.type === 'Reference' && expression.path.length === 1) {
    const elementType = context.setElementTypes.get(expression.path[0])

    if (elementType != null) {
      return elementType
    }

    return null
  }

  if (expression.type === 'CallExpression' || expression.type === 'NewExpression') {
    let functionReturn: string | null = null

    if (expression.type === 'CallExpression') {
      functionReturn = resolveFunctionReturnNameFromCall(expression)
    }

    if (expression.valueType !== 'set') {
      return null
    }

    if (expression.setElementType != null) {
      return expression.setElementType
    }

    if (functionReturn != null) {
      const returnSetElementType = functionReturnSetElementType(context, functionReturn)

      if (returnSetElementType != null) {
        return returnSetElementType
      }
    }

    return 'unknown'
  }

  if (expression.type === 'MemberExpression') {
    const member = collectionDeps(context).resolveKnownObjectMember(expression, context)

    if (member != null && member.valueType === 'set') {
      return stringOrUnknown(member.setElementType)
    }

    return null
  }

  if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
    const field = collectionDeps(context).resolveKnownObjectIndex(expression, context)

    if (field != null && field.valueType === 'set') {
      return stringOrUnknown(field.setElementType)
    }

    return null
  }

  return null
}

export function resolveRuntimeMapType(expression: AnyNode, context: CollectionFunctionContext): RuntimeMapType | null {
  if (expression.type === 'Reference' && expression.path.length === 1) {
    const mapType = context.mapTypes.get(expression.path[0])

    if (mapType != null) {
      return {
        key: stringOrUnknown(mapType.key),
        value: stringOrUnknown(mapType.value)
      }
    }

    return null
  }

  if (expression.type === 'CallExpression' || expression.type === 'NewExpression') {
    let functionReturn: string | null = null
    let functionReturnMap: CFunctionReturnMapType | null = null

    if (expression.type === 'CallExpression') {
      functionReturn = resolveFunctionReturnNameFromCall(expression)
    }

    if (functionReturn != null) {
      const storedFunctionReturnMap = functionReturnMapType(context, functionReturn)

      if (storedFunctionReturnMap != null) {
        functionReturnMap = storedFunctionReturnMap
      }
    }

    if (expression.valueType !== 'map') {
      return null
    }

    return {
      key: resolveRuntimeMapKeyType(expression, functionReturnMap),
      value: resolveRuntimeMapValueType(expression, functionReturnMap)
    }
  }

  if (expression.type === 'MemberExpression') {
    const member = collectionDeps(context).resolveKnownObjectMember(expression, context)

    if (member != null && member.valueType === 'map') {
      return {
        key: stringOrUnknown(member.mapKeyType),
        value: stringOrUnknown(member.mapValueType)
      }
    }

    return null
  }

  if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
    const field = collectionDeps(context).resolveKnownObjectIndex(expression, context)

    if (field != null && field.valueType === 'map') {
      return {
        key: stringOrUnknown(field.mapKeyType),
        value: stringOrUnknown(field.mapValueType)
      }
    }

    return null
  }

  return null
}

function resolveRuntimeMapKeyType(expression: AnyNode, functionReturnMap: CFunctionReturnMapType | null): string {
  if (expression.mapKeyType != null) {
    return expression.mapKeyType
  }

  if (functionReturnMap != null) {
    const key = functionReturnMap.key

    if (key != null) {
      return key
    }
  }

  return 'unknown'
}

function resolveRuntimeMapValueType(expression: AnyNode, functionReturnMap: CFunctionReturnMapType | null): string {
  if (expression.mapValueType != null) {
    return expression.mapValueType
  }

  if (functionReturnMap != null) {
    const value = functionReturnMap.value

    if (value != null) {
      return value
    }
  }

  return 'unknown'
}

function resolveFunctionReturnNameFromCall(expression: AnyNode): string | null {
  if (
    expression.type === 'CallExpression' &&
    expression.callee.type === 'Reference' &&
    expression.callee.path.length === 1
  ) {
    return expression.callee.path[0]
  }

  return null
}

export function resolveRuntimeForOfSet(
  expression: AnyNode,
  context: CollectionFunctionContext
): RuntimeForOfSet | null {
  const elementType = resolveRuntimeSetElementType(expression, context)

  if (elementType == null) {
    return null
  }

  const receiver = emitPreparedCollectionReceiver(expression, context)

  if (receiver != null) {
    if (receiver.type === 'set') {
      return {
        name: receiver.expression,
        elementType,
        lines: receiver.lines
      }
    }
  }

  return null
}

export function resolveRuntimeForOfMap(
  expression: AnyNode,
  context: CollectionFunctionContext
): RuntimeForOfMap | null {
  const mapType = resolveRuntimeMapType(expression, context)

  if (mapType != null) {
    const keyType = mapType.key
    const valueType = mapType.value

    const receiver = emitPreparedCollectionReceiver(expression, context)

    if (receiver != null) {
      if (receiver.type === 'map') {
        return {
          name: receiver.expression,
          keyType,
          valueType,
          lines: receiver.lines
        }
      }
    }
  }

  return null
}
