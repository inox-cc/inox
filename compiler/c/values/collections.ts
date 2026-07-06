import { diagnostic } from '../../diagnostics.ts'
import { collectionConstructorNameFromPath } from '../../../stdlib/global/compiler/descriptor.ts'
import type { AnyNode, SourceLocation } from '../../types.ts'
import type { CFunctionContext } from '../context.ts'
import { emitRuntimeTypeCheck, nextCName } from '../context.ts'
import { emitRuntimeNullableValueCheck } from '../runtime-values.ts'
import type {
  CFunctionReturnMapType,
  CObjectFieldInfo,
  CObjectIndexFieldInfo,
  CObjectShapeField,
  CPreparedExpression as PreparedExpression
} from '../types.ts'
import { cRuntimeValueTag } from '../value-types.ts'
import { resolveNativeClassFieldMetadata } from './classes.ts'

type PreparedCollectionCall = PreparedExpression
type CollectionNode = AnyNode

type CollectionFunctionContext = CFunctionContext

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
  cppObject: boolean
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
  cppObject: boolean
}

type RuntimeForOfMap = {
  name: string
  keyType: string
  valueType: string
  lines: string[]
  cppObject: boolean
}

type RuntimeForOfMapValues = {
  name: string
  elementType: string
  lines: string[]
  useKey: boolean
  cppObject: boolean
}

function collectionThrownCheck(context: CollectionFunctionContext): string {
  return emitRuntimeTypeCheck('inox::thrown()', context)
}

function mapFacade(expression: string, cppObject: boolean = false): string {
  return cppObject ? expression : `Map(${expression})`
}

function setFacade(expression: string, cppObject: boolean = false): string {
  return cppObject ? expression : `Set(${expression})`
}

function emitFallbackCollectionValueExpression(
  _expression: CollectionNode,
  _context: CollectionFunctionContext
): PreparedExpression {
  return {
    lines: [],
    expression: 'inox_undefined_value()'
  }
}

function inferFallbackCollectionExpressionType(
  _expression: CollectionNode,
  _context: CollectionFunctionContext
): string {
  return 'unknown'
}

function isFallbackCollectionAccessExpression(_expression: CollectionNode): boolean {
  return false
}

function reportFallbackCollectionHashability(
  _valueType: string,
  _subject: string,
  _loc: SourceLocation | null | undefined,
  _context: CollectionFunctionContext
): void {}

function resolveFallbackCollectionObjectIndex(
  _expression: CollectionNode,
  _context: CollectionFunctionContext
): CObjectIndexFieldInfo | null {
  return null
}

function resolveFallbackCollectionObjectMember(
  _expression: CollectionNode,
  _context: CollectionFunctionContext
): CObjectFieldInfo | null {
  return null
}

function emitCollectionValueExpression(
  expression: CollectionNode,
  context: CollectionFunctionContext
): PreparedExpression {
  const deps = context.collectionLoweringDependencies

  if (deps !== null && typeof deps !== 'undefined') {
    return deps.emitCValueExpression(expression, context)
  }

  context.diagnostics.push(diagnostic('INOX_C_COLLECTION', 'collection lowering dependencies are not configured'))

  return emitFallbackCollectionValueExpression(expression, context)
}

function inferCollectionExpressionType(expression: CollectionNode, context: CollectionFunctionContext): string {
  const deps = context.collectionLoweringDependencies

  if (deps !== null && typeof deps !== 'undefined') {
    return deps.inferExpressionType(expression, context)
  }

  context.diagnostics.push(diagnostic('INOX_C_COLLECTION', 'collection lowering dependencies are not configured'))

  return inferFallbackCollectionExpressionType(expression, context)
}

function isCollectionIndexAccessExpression(expression: CollectionNode, context: CollectionFunctionContext): boolean {
  const deps = context.collectionLoweringDependencies

  if (deps !== null && typeof deps !== 'undefined') {
    return deps.isIndexAccessExpression(expression)
  }

  context.diagnostics.push(diagnostic('INOX_C_COLLECTION', 'collection lowering dependencies are not configured'))

  return isFallbackCollectionAccessExpression(expression)
}

function isCollectionMemberAccessExpression(expression: CollectionNode, context: CollectionFunctionContext): boolean {
  const deps = context.collectionLoweringDependencies

  if (deps !== null && typeof deps !== 'undefined') {
    return deps.isMemberAccessExpression(expression)
  }

  context.diagnostics.push(diagnostic('INOX_C_COLLECTION', 'collection lowering dependencies are not configured'))

  return isFallbackCollectionAccessExpression(expression)
}

function reportCollectionHashability(
  valueType: string | null | undefined,
  subject: string,
  loc: SourceLocation | null | undefined,
  context: CollectionFunctionContext
): void {
  const checkedType = valueType ?? 'unknown'
  const deps = context.collectionLoweringDependencies

  if (deps !== null && typeof deps !== 'undefined') {
    deps.reportCCollectionHashability(checkedType, subject, loc, context)
    return
  }

  context.diagnostics.push(diagnostic('INOX_C_COLLECTION', 'collection lowering dependencies are not configured'))

  reportFallbackCollectionHashability(checkedType, subject, loc, context)
}

function resolveKnownCollectionObjectIndex(
  expression: CollectionNode,
  context: CollectionFunctionContext
): CObjectIndexFieldInfo | null {
  const deps = context.collectionLoweringDependencies

  if (deps !== null && typeof deps !== 'undefined') {
    return deps.resolveKnownObjectIndex(expression, context)
  }

  context.diagnostics.push(diagnostic('INOX_C_COLLECTION', 'collection lowering dependencies are not configured'))

  return resolveFallbackCollectionObjectIndex(expression, context)
}

function resolveKnownCollectionObjectMember(
  expression: CollectionNode,
  context: CollectionFunctionContext
): CObjectFieldInfo | null {
  const deps = context.collectionLoweringDependencies

  if (deps !== null && typeof deps !== 'undefined') {
    return deps.resolveKnownObjectMember(expression, context)
  }

  context.diagnostics.push(diagnostic('INOX_C_COLLECTION', 'collection lowering dependencies are not configured'))

  return resolveFallbackCollectionObjectMember(expression, context)
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
  if (node !== null && typeof node !== 'undefined' && node.loc !== null && typeof node.loc !== 'undefined') {
    return node.loc
  }

  return fallback
}

function stringOrUnknown(value: string | null | undefined): string {
  if (value !== null && typeof value !== 'undefined') {
    return value
  }

  return 'unknown'
}

function collectionNodeAt(nodes: CollectionNode[], index: number): CollectionNode {
  return nodes[index]
}

function collectionStringAt(values: string[], index: number): string {
  return values[index]
}

function functionReturnMapType(
  context: CollectionFunctionContext,
  functionReturn: string
): CFunctionReturnMapType | null {
  const functionReturnMapTypes = context.functionReturnMapTypes

  if (functionReturnMapTypes === null || typeof functionReturnMapTypes === 'undefined') {
    return null
  }

  const mapType = functionReturnMapTypes.get(functionReturn)

  if (mapType !== null && typeof mapType !== 'undefined') {
    return mapType
  }

  return null
}

function functionReturnSetElementType(context: CollectionFunctionContext, functionReturn: string): string | null {
  const functionReturnSetElementTypes = context.functionReturnSetElementTypes

  if (functionReturnSetElementTypes === null || typeof functionReturnSetElementTypes === 'undefined') {
    return null
  }

  const elementType = functionReturnSetElementTypes.get(functionReturn)

  if (elementType !== null && typeof elementType !== 'undefined') {
    return elementType
  }

  return null
}

export function emitPreparedCollectionReceiver(
  expression: AnyNode,
  context: CollectionFunctionContext
): PreparedCollectionReceiver | null {
  if (expression.type === 'Reference' && expression.path.length === 1) {
    const name = collectionStringAt(expression.path, 0)
    const receiverType = context.variables.get(name)

    if (receiverType === 'map' || receiverType === 'set') {
      return {
        type: receiverType,
        lines: [],
        expression: name,
        cppObject: receiverType === 'map' ? context.cppMapValues.has(name) : context.cppSetValues.has(name)
      }
    }

    return null
  }

  if (expression.type === 'CallExpression' || expression.type === 'NewExpression') {
    const valueType = inferCollectionExpressionType(expression, context)

    if (valueType !== 'map' && valueType !== 'set') {
      return null
    }

    let call: PreparedExpression | null = null

    if (expression.type === 'CallExpression') {
      call = emitPreparedCollectionCallExpression(expression, context)
    } else {
      call = emitPreparedCollectionConstructorValueExpression(expression, context)
    }

    if (call !== null && typeof call !== 'undefined' && call.expression !== '') {
      return {
        type: valueType,
        lines: call.lines,
        expression: call.expression,
        cppObject: call.cppType === 'Map' || call.cppType === 'Set'
      }
    }

    const value = emitCollectionValueExpression(expression, context)

    return {
      type: valueType,
      lines: value.lines,
      expression: value.expression,
      cppObject: value.cppType === 'Map' || value.cppType === 'Set'
    }
  }

  const knownField = knownCollectionReceiverField(expression, context)

  if (knownField !== null && typeof knownField !== 'undefined') {
    const value = emitCollectionValueExpression(expression, context)

    return {
      type: knownField,
      lines: value.lines,
      expression: value.expression,
      cppObject: value.cppType === 'Map' || value.cppType === 'Set'
    }
  }

  if (
    isCollectionMemberAccessExpression(expression, context) ||
    isCollectionIndexAccessExpression(expression, context)
  ) {
    const valueType = inferCollectionExpressionType(expression, context)

    if (valueType !== 'map' && valueType !== 'set') {
      return null
    }

    const value = emitCollectionValueExpression(expression, context)

    return {
      type: valueType,
      lines: value.lines,
      expression: value.expression,
      cppObject: value.cppType === 'Map' || value.cppType === 'Set'
    }
  }

  return null
}

function knownCollectionReceiverField(
  expression: AnyNode,
  context: CollectionFunctionContext
): 'map' | 'set' | null {
  const classField = resolveNativeClassFieldMetadata(expression, context)

  if (classField !== null && typeof classField !== 'undefined' && classField.optional !== true) {
    return knownCollectionShapeFieldType(classField)
  }

  const member = resolveKnownCollectionObjectMember(expression, context)

  if (member !== null && typeof member !== 'undefined' && member.optional !== true) {
    return knownCollectionFieldType(member.valueType)
  }

  const index = resolveKnownCollectionObjectIndex(expression, context)

  if (index !== null && typeof index !== 'undefined' && index.optional !== true) {
    return knownCollectionFieldType(index.valueType)
  }

  return null
}

function knownCollectionShapeFieldType(field: CObjectShapeField): 'map' | 'set' | null {
  return knownCollectionFieldType(field.valueType)
}

function knownCollectionFieldType(valueType: string | null | undefined): 'map' | 'set' | null {
  if (valueType === 'map' || valueType === 'set') {
    return valueType
  }

  return null
}

export function isCollectionConstructorExpression(expression: AnyNode | null | undefined): boolean {
  return !!collectionConstructorName(expression)
}

export function collectionConstructorName(expression: AnyNode | null | undefined): string | null {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
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
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  const collectionConstructor = collectionConstructorName(expression)

  if (collectionConstructor === null || typeof collectionConstructor === 'undefined') {
    return null
  }

  if (expression.args.length > 1) {
    context.diagnostics.push(
      diagnostic(
        'INOX_C_COLLECTION',
        'C collection constructors currently support at most one array literal iterable',
        expression.loc
      )
    )
  }

  let tempPrefix = 'set_storage'

  if (collectionConstructor === 'Map') {
    tempPrefix = 'map_storage'
  }

  const temp = nextCName(context, tempPrefix)
  const lines: string[] = []

  if (collectionConstructor === 'Map') {
    reportCollectionHashability(expression.mapKeyType, 'Map keys', expression.loc, context)
    lines.push(`auto ${temp} = Map::create();`)
    lines.push(emitRuntimeTypeCheck(`!${temp}.valid()`, context))
    if (expression.args.length > 0) {
      pushAllLines(
        lines,
        emitMapConstructorValueEntries(temp, collectionNodeAt(expression.args, 0), context, expression.loc)
      )
    }

    return {
      lines,
      expression: temp,
      cppType: 'Map'
    }
  }

  reportCollectionHashability(expression.setElementType, 'Set values', expression.loc, context)
  lines.push(`auto ${temp} = Set::create();`)
  lines.push(emitRuntimeTypeCheck(`!${temp}.valid()`, context))
  if (expression.args.length > 0) {
    pushAllLines(
      lines,
      emitSetConstructorValueElements(temp, collectionNodeAt(expression.args, 0), context, expression.loc)
    )
  }

  return {
    lines,
    expression: temp,
    cppType: 'Set'
  }
}

function emitMapConstructorValueEntries(
  name: string,
  expression: CollectionNode | null | undefined,
  context: CollectionFunctionContext,
  loc: SourceLocation | null | undefined
): string[] {
  if (expression === null || typeof expression === 'undefined') {
    return []
  }

  if (expression.type !== 'ArrayLiteral') {
    const source = emitPreparedCollectionReceiver(expression, context)

    if (source !== null && typeof source !== 'undefined' && source.type === 'map') {
      return emitMapConstructorCopiedEntries(name, source, context)
    }

    context.diagnostics.push(
      diagnostic(
        'INOX_C_COLLECTION',
        'C Map constructor currently supports only array literal entries or Map copy sources',
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
          'INOX_C_COLLECTION',
          'C Map constructor entries must be [key, value] array literals',
          nodeLocOrFallback(entry, loc)
        )
      )
      continue
    }

    const keyNode = collectionNodeAt(entry.elements, 0)
    const valueNode = collectionNodeAt(entry.elements, 1)
    const key = emitCollectionValueExpression(keyNode, context)
    const value = emitCollectionValueExpression(valueNode, context)

    reportCollectionHashability(
      inferCollectionExpressionType(keyNode, context),
      'Map keys',
      nodeLocOrFallback(keyNode, nodeLocOrFallback(entry, loc)),
      context
    )

    pushAllLines(lines, key.lines)
    pushAllLines(lines, value.lines)
    lines.push(`${mapFacade(name, true)}.set(${key.expression}, ${value.expression});`)
    lines.push(collectionThrownCheck(context))
  }

  return lines
}

function emitMapConstructorCopiedEntries(
  name: string,
  source: PreparedCollectionReceiver,
  context: CollectionFunctionContext
): string[] {
  const sourceMap = nextCName(context, 'inox_map_source')
  const index = nextCName(context, 'inox_map_source_index')
  const sourceExpression = source.expression
  const lines: string[] = []

  pushAllLines(lines, source.lines)
  lines.push(`MapStorage* ${sourceMap} = ${mapFacade(sourceExpression, source.cppObject)}.data();`)
  lines.push(emitRuntimeTypeCheck(`${sourceMap} == nullptr`, context))
  lines.push(`for (size_t ${index} = 0; ${index} < ${sourceMap}->capacity; ++${index}) {`)
  lines.push(`  if (${sourceMap}->entries[${index}].state != MapSlotOccupied) {`)
  lines.push('    continue;')
  lines.push('  }')
  lines.push(`  ${mapFacade(name, true)}.set(${sourceMap}->entries[${index}].key, ${sourceMap}->entries[${index}].value);`)
  lines.push(`  ${collectionThrownCheck(context)}`)
  lines.push('}')

  return lines
}

function emitSetConstructorValueElements(
  name: string,
  expression: CollectionNode | null | undefined,
  context: CollectionFunctionContext,
  loc: SourceLocation | null | undefined
): string[] {
  if (expression === null || typeof expression === 'undefined') {
    return []
  }

  if (expression.type !== 'ArrayLiteral') {
    const source = emitPreparedCollectionReceiver(expression, context)

    if (source !== null && typeof source !== 'undefined' && source.type === 'set') {
      return emitSetConstructorCopiedElements(name, source, context)
    }

    context.diagnostics.push(
      diagnostic(
        'INOX_C_COLLECTION',
        'C Set constructor currently supports only array literal values or Set copy sources',
        nodeLocOrFallback(expression, loc)
      )
    )
    return []
  }

  const lines: string[] = []

  for (const element of expression.elements) {
    const value = emitCollectionValueExpression(element, context)

    reportCollectionHashability(
      inferCollectionExpressionType(element, context),
      'Set values',
      nodeLocOrFallback(element, loc),
      context
    )

    pushAllLines(lines, value.lines)
    lines.push(`${setFacade(name, true)}.add(${value.expression});`)
    lines.push(collectionThrownCheck(context))
  }

  return lines
}

function emitSetConstructorCopiedElements(
  name: string,
  source: PreparedCollectionReceiver,
  context: CollectionFunctionContext
): string[] {
  const sourceSet = nextCName(context, 'inox_set_source')
  const index = nextCName(context, 'inox_set_source_index')
  const sourceExpression = source.expression
  const lines: string[] = []

  pushAllLines(lines, source.lines)
  lines.push(`SetStorage* ${sourceSet} = ${setFacade(sourceExpression, source.cppObject)}.data();`)
  lines.push(emitRuntimeTypeCheck(`${sourceSet} == nullptr`, context))
  lines.push(`for (size_t ${index} = 0; ${index} < ${sourceSet}->capacity; ++${index}) {`)
  lines.push(`  if (${sourceSet}->entries[${index}].state != SetSlotOccupied) {`)
  lines.push('    continue;')
  lines.push('  }')
  lines.push(`  ${setFacade(name, true)}.add(${sourceSet}->entries[${index}].value);`)
  lines.push(`  ${collectionThrownCheck(context)}`)
  lines.push('}')

  return lines
}

export function emitPreparedCollectionCallExpression(
  expression: AnyNode | null | undefined,
  context: CollectionFunctionContext
): PreparedCollectionCall | null {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression'
  ) {
    return null
  }

  const receiver = emitPreparedCollectionReceiver(expression.callee.object, context)

  if (receiver !== null && typeof receiver !== 'undefined') {
    if (receiver.type === 'map') {
      const call = emitPreparedMapMethodCall(receiver, expression, context)

      return createPreparedCollectionMethodCall(receiver, call)
    }

    const call = emitPreparedSetMethodCall(receiver, expression, context)

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

function emitPreparedMapMethodCall(
  receiver: PreparedCollectionReceiver,
  expression: AnyNode,
  context: CollectionFunctionContext
): PreparedExpression {
  const method = expression.callee.property
  const name = receiver.expression
  const facade = mapFacade(name, receiver.cppObject)

  if (method === 'clear') {
    return {
      lines: [`${facade}.clear();`, collectionThrownCheck(context)],
      expression: ''
    }
  }

  if (method === 'set') {
    const keyArg = collectionNodeAt(expression.args, 0)
    const valueArg = collectionNodeAt(expression.args, 1)
    reportCollectionHashability(
      inferCollectionExpressionType(keyArg, context),
      'Map keys',
      nodeLocOrFallback(keyArg, expression.loc),
      context
    )
    const key = emitCollectionValueExpression(keyArg, context)
    const value = emitCollectionValueExpression(valueArg, context)
    const lines: string[] = []
    pushAllLines(lines, key.lines)
    pushAllLines(lines, value.lines)
    lines.push(`${facade}.set(${key.expression}, ${value.expression});`)
    lines.push(collectionThrownCheck(context))

    return {
      lines,
      expression: name
    }
  }

  if (method === 'get') {
    const keyArg = collectionNodeAt(expression.args, 0)
    reportCollectionHashability(
      inferCollectionExpressionType(keyArg, context),
      'Map keys',
      nodeLocOrFallback(keyArg, expression.loc),
      context
    )
    const key = emitCollectionValueExpression(keyArg, context)
    const valueType = inferCollectionExpressionType(expression, context)
    const expectedTag = cRuntimeValueTag(valueType)
    const out = nextCName(context, 'inox_map_value')

    const lines: string[] = []
    pushAllLines(lines, key.lines)
    lines.push(`auto ${out} = ${facade}.get(${key.expression});`)
    lines.push(collectionThrownCheck(context))
    pushAllLines(lines, emitRuntimeNullableValueCheck(out, expectedTag, context))

    return {
      lines,
      expression: out
    }
  }

  if (method === 'delete' || method === 'has') {
    let tempPrefix = 'inox_map_has'
    let methodName = 'has'

    if (method === 'delete') {
      tempPrefix = 'inox_map_delete'
      methodName = 'deleteKey'
    }

    const keyArg = collectionNodeAt(expression.args, 0)
    reportCollectionHashability(
      inferCollectionExpressionType(keyArg, context),
      'Map keys',
      nodeLocOrFallback(keyArg, expression.loc),
      context
    )
    const key = emitCollectionValueExpression(keyArg, context)
    const out = nextCName(context, tempPrefix)
    const lines: string[] = []
    pushAllLines(lines, key.lines)
    lines.push(`bool ${out} = ${facade}.${methodName}(${key.expression});`)
    lines.push(collectionThrownCheck(context))

    return {
      lines,
      expression: `(${out} ? 1 : 0)`
    }
  }

  context.diagnostics.push(
    diagnostic('INOX_C_COLLECTION', `Map.${method} is not supported by the current C backend slice`, expression.loc)
  )

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

  if (mapIndex !== null && typeof mapIndex !== 'undefined') {
    reportCollectionHashability(
      inferCollectionExpressionType(mapIndex.key, context),
      'Map keys',
      nodeLocOrFallback(mapIndex.key, expression.loc),
      context
    )
    const key = emitCollectionValueExpression(mapIndex.key, context)
    const valueType = inferCollectionExpressionType(expression, context)
    const expectedTag = cRuntimeValueTag(valueType)
    const out = nextCName(context, 'inox_map_value')

    const lines: string[] = []
    pushAllLines(lines, mapIndex.receiver.lines)
    pushAllLines(lines, key.lines)
    lines.push(`auto ${out} = ${mapFacade(mapIndex.receiver.expression, mapIndex.receiver.cppObject)}.get(${key.expression});`)
    lines.push(collectionThrownCheck(context))
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

  if (mapIndex !== null && typeof mapIndex !== 'undefined') {
    reportCollectionHashability(
      inferCollectionExpressionType(mapIndex.key, context),
      'Map keys',
      nodeLocOrFallback(mapIndex.key, expression.target.loc),
      context
    )
    const key = emitCollectionValueExpression(mapIndex.key, context)
    const value = emitCollectionValueExpression(expression.value, context)
    const lines: string[] = []
    pushAllLines(lines, mapIndex.receiver.lines)
    pushAllLines(lines, key.lines)
    pushAllLines(lines, value.lines)
    lines.push(`${mapFacade(mapIndex.receiver.expression, mapIndex.receiver.cppObject)}.set(${key.expression}, ${value.expression});`)
    lines.push(collectionThrownCheck(context))

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

  if (receiver === null || typeof receiver === 'undefined' || receiver.type !== 'map') {
    return null
  }

  return {
    receiver,
    key: expression.index
  }
}

function emitPreparedSetMethodCall(
  receiver: PreparedCollectionReceiver,
  expression: AnyNode,
  context: CollectionFunctionContext
): PreparedExpression {
  const method = expression.callee.property
  const name = receiver.expression
  const facade = setFacade(name, receiver.cppObject)

  if (method === 'clear') {
    return {
      lines: [`${facade}.clear();`, collectionThrownCheck(context)],
      expression: ''
    }
  }

  if (method === 'add') {
    const valueArg = collectionNodeAt(expression.args, 0)
    reportCollectionHashability(
      inferCollectionExpressionType(valueArg, context),
      'Set values',
      nodeLocOrFallback(valueArg, expression.loc),
      context
    )
    const value = emitCollectionValueExpression(valueArg, context)
    const lines: string[] = []
    pushAllLines(lines, value.lines)
    lines.push(`${facade}.add(${value.expression});`)
    lines.push(collectionThrownCheck(context))

    return {
      lines,
      expression: name
    }
  }

  if (method === 'delete' || method === 'has') {
    let tempPrefix = 'inox_set_has'
    let methodName = 'has'

    if (method === 'delete') {
      tempPrefix = 'inox_set_delete'
      methodName = 'deleteValue'
    }

    const valueArg = collectionNodeAt(expression.args, 0)
    reportCollectionHashability(
      inferCollectionExpressionType(valueArg, context),
      'Set values',
      nodeLocOrFallback(valueArg, expression.loc),
      context
    )
    const value = emitCollectionValueExpression(valueArg, context)
    const out = nextCName(context, tempPrefix)
    const lines: string[] = []
    pushAllLines(lines, value.lines)
    lines.push(`bool ${out} = ${facade}.${methodName}(${value.expression});`)
    lines.push(collectionThrownCheck(context))

    return {
      lines,
      expression: `(${out} ? 1 : 0)`
    }
  }

  context.diagnostics.push(
    diagnostic('INOX_C_COLLECTION', `Set.${method} is not supported by the current C backend slice`, expression.loc)
  )

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

  if (receiver !== null && typeof receiver !== 'undefined') {
    let tempPrefix = 'inox_set_size'
    let facade = setFacade(receiver.expression, receiver.cppObject)

    if (receiver.type === 'map') {
      tempPrefix = 'inox_map_size'
      facade = mapFacade(receiver.expression, receiver.cppObject)
    }

    const out = nextCName(context, tempPrefix)
    const lines: string[] = []
    pushAllLines(lines, receiver.lines)
    lines.push(`size_t ${out} = ${facade}.size();`)
    lines.push(collectionThrownCheck(context))

    return {
      lines,
      expression: `((double)${out})`
    }
  }

  return null
}

export function resolveRuntimeSetElementType(expression: AnyNode, context: CollectionFunctionContext): string | null {
  if (expression.type === 'Reference' && expression.path.length === 1) {
    const elementType = context.setElementTypes.get(collectionStringAt(expression.path, 0))

    if (elementType !== null && typeof elementType !== 'undefined') {
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

    if (expression.setElementType !== null && typeof expression.setElementType !== 'undefined') {
      return expression.setElementType
    }

    if (functionReturn !== null && typeof functionReturn !== 'undefined') {
      const returnSetElementType = functionReturnSetElementType(context, functionReturn)

      if (returnSetElementType !== null && typeof returnSetElementType !== 'undefined') {
        return returnSetElementType
      }
    }

    return 'unknown'
  }

  if (expression.type === 'MemberExpression') {
    const member = resolveKnownCollectionObjectMember(expression, context)

    if (member !== null && typeof member !== 'undefined' && member.valueType === 'set') {
      return stringOrUnknown(member.setElementType)
    }

    return null
  }

  if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
    const field = resolveKnownCollectionObjectIndex(expression, context)

    if (field !== null && typeof field !== 'undefined' && field.valueType === 'set') {
      return stringOrUnknown(field.setElementType)
    }

    return null
  }

  return null
}

export function resolveRuntimeMapType(expression: AnyNode, context: CollectionFunctionContext): RuntimeMapType | null {
  if (expression.type === 'Reference' && expression.path.length === 1) {
    const mapType = context.mapTypes.get(collectionStringAt(expression.path, 0))

    if (mapType !== null && typeof mapType !== 'undefined') {
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

    if (functionReturn !== null && typeof functionReturn !== 'undefined') {
      const storedFunctionReturnMap = functionReturnMapType(context, functionReturn)

      if (storedFunctionReturnMap !== null && typeof storedFunctionReturnMap !== 'undefined') {
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
    const classField = resolveNativeClassFieldMetadata(expression, context)

    if (classField !== null && typeof classField !== 'undefined' && classField.valueType === 'map') {
      return {
        key: stringOrUnknown(classField.mapKeyType),
        value: stringOrUnknown(classField.mapValueType)
      }
    }

    const member = resolveKnownCollectionObjectMember(expression, context)

    if (member !== null && typeof member !== 'undefined' && member.valueType === 'map') {
      return {
        key: stringOrUnknown(member.mapKeyType),
        value: stringOrUnknown(member.mapValueType)
      }
    }

    return null
  }

  if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
    const field = resolveKnownCollectionObjectIndex(expression, context)

    if (field !== null && typeof field !== 'undefined' && field.valueType === 'map') {
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
  if (expression.mapKeyType !== null && typeof expression.mapKeyType !== 'undefined') {
    return expression.mapKeyType
  }

  if (functionReturnMap !== null && typeof functionReturnMap !== 'undefined') {
    const key = functionReturnMap.key

    if (key !== null && typeof key !== 'undefined') {
      return key
    }
  }

  return 'unknown'
}

function resolveRuntimeMapValueType(expression: AnyNode, functionReturnMap: CFunctionReturnMapType | null): string {
  if (expression.mapValueType !== null && typeof expression.mapValueType !== 'undefined') {
    return expression.mapValueType
  }

  if (functionReturnMap !== null && typeof functionReturnMap !== 'undefined') {
    const value = functionReturnMap.value

    if (value !== null && typeof value !== 'undefined') {
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
    return collectionStringAt(expression.callee.path, 0)
  }

  return null
}

function resolveCollectionKeysCallReceiver(
  expression: AnyNode,
  context: CollectionFunctionContext
): PreparedCollectionReceiver | null {
  if (
    expression.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.property !== 'keys' ||
    expression.args.length !== 0
  ) {
    return null
  }

  return emitPreparedCollectionReceiver(expression.callee.object, context)
}

function resolveCollectionValuesCallReceiver(
  expression: AnyNode,
  context: CollectionFunctionContext
): PreparedCollectionReceiver | null {
  if (
    expression.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.property !== 'values' ||
    expression.args.length !== 0
  ) {
    return null
  }

  return emitPreparedCollectionReceiver(expression.callee.object, context)
}

function resolveCollectionEntriesCallReceiver(
  expression: AnyNode,
  context: CollectionFunctionContext
): PreparedCollectionReceiver | null {
  if (
    expression.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.property !== 'entries' ||
    expression.args.length !== 0
  ) {
    return null
  }

  return emitPreparedCollectionReceiver(expression.callee.object, context)
}

export function resolveRuntimeForOfSet(
  expression: AnyNode,
  context: CollectionFunctionContext
): RuntimeForOfSet | null {
  const elementType = resolveRuntimeSetElementType(expression, context)

  if (elementType === null || typeof elementType === 'undefined') {
    return null
  }

  const receiver = emitPreparedCollectionReceiver(expression, context)

  if (receiver !== null && typeof receiver !== 'undefined') {
    if (receiver.type === 'set') {
      return {
        name: receiver.expression,
        elementType,
        lines: receiver.lines,
        cppObject: receiver.cppObject
      }
    }
  }

  return null
}

export function resolveRuntimeForOfMapKeys(
  expression: AnyNode,
  context: CollectionFunctionContext
): RuntimeForOfMapValues | null {
  const keysReceiver = resolveCollectionKeysCallReceiver(expression, context)

  if (keysReceiver === null || typeof keysReceiver === 'undefined' || keysReceiver.type !== 'map') {
    return null
  }

  const mapType = resolveRuntimeMapType(expression.callee.object, context)

  if (mapType === null || typeof mapType === 'undefined') {
    return null
  }

  return {
    name: keysReceiver.expression,
    elementType: stringOrUnknown(mapType.key),
    lines: keysReceiver.lines,
    useKey: true,
    cppObject: keysReceiver.cppObject
  }
}

export function resolveRuntimeForOfMapEntries(
  expression: AnyNode,
  context: CollectionFunctionContext
): RuntimeForOfMap | null {
  const entriesReceiver = resolveCollectionEntriesCallReceiver(expression, context)

  if (entriesReceiver === null || typeof entriesReceiver === 'undefined' || entriesReceiver.type !== 'map') {
    return null
  }

  const mapType = resolveRuntimeMapType(expression.callee.object, context)

  if (mapType === null || typeof mapType === 'undefined') {
    return null
  }

  return {
    name: entriesReceiver.expression,
    keyType: stringOrUnknown(mapType.key),
    valueType: stringOrUnknown(mapType.value),
    lines: entriesReceiver.lines,
    cppObject: entriesReceiver.cppObject
  }
}

export function resolveRuntimeForOfMapValues(
  expression: AnyNode,
  context: CollectionFunctionContext
): RuntimeForOfMapValues | null {
  const valuesReceiver = resolveCollectionValuesCallReceiver(expression, context)

  if (valuesReceiver === null || typeof valuesReceiver === 'undefined' || valuesReceiver.type !== 'map') {
    return null
  }

  const mapType = resolveRuntimeMapType(expression.callee.object, context)

  if (mapType === null || typeof mapType === 'undefined') {
    return null
  }

  return {
    name: valuesReceiver.expression,
    elementType: stringOrUnknown(mapType.value),
    lines: valuesReceiver.lines,
    useKey: false,
    cppObject: valuesReceiver.cppObject
  }
}

export function resolveRuntimeForOfMap(
  expression: AnyNode,
  context: CollectionFunctionContext
): RuntimeForOfMap | null {
  const mapType = resolveRuntimeMapType(expression, context)

  if (mapType !== null && typeof mapType !== 'undefined') {
    const keyType = mapType.key
    const valueType = mapType.value

    const receiver = emitPreparedCollectionReceiver(expression, context)

    if (receiver !== null && typeof receiver !== 'undefined') {
      if (receiver.type === 'map') {
        return {
          name: receiver.expression,
          keyType,
          valueType,
          lines: receiver.lines,
          cppObject: receiver.cppObject
        }
      }
    }
  }

  return null
}
