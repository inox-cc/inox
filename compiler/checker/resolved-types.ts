import { commonValueType } from './assignability.ts'
import { memberExpressionPath } from '../member-paths.ts'
import type { AnyNode, ObjectShapeInfo, ProgramNode, SourceLocation, TypeAliasInfo, ValueType } from '../types.ts'

export type ResolvedTypeInfo = {
  valueType: ValueType
  nullable: boolean
  functionType: FunctionTypeMetadata | null
  shape: ObjectShapeInfo | null
  arrayElementType: ValueType | null
  arrayElementDeclaredType: string | null
  arrayElementFunctionType?: FunctionTypeMetadata | null
  mapKeyType: ValueType | null
  mapValueType: ValueType | null
  mapValueShape: ObjectShapeInfo | null
  promiseValueType: ValueType | null
  setElementType: ValueType | null
}

export type ResolvedTypeInfoValueKind = number

export const resolvedArrayElementTypeKind: ResolvedTypeInfoValueKind = 0
export const resolvedMapKeyTypeKind: ResolvedTypeInfoValueKind = 1
export const resolvedMapValueTypeKind: ResolvedTypeInfoValueKind = 2
export const resolvedPromiseValueTypeKind: ResolvedTypeInfoValueKind = 3
export const resolvedSetElementTypeKind: ResolvedTypeInfoValueKind = 4

export type OwnershipGraphEdge = {
  from: string
  to: string
  field: string
  loc: SourceLocation
}

export type OptionalParamInfo = {
  optional?: boolean
  rest?: boolean
  [key: string]: unknown
}

export type PromiseCallbackParamMetadata = {
  shape: ObjectShapeInfo | null
}

export type CheckerNode = AnyNode
export type NullableNode = AnyNode | null
export type TypeAliasDeclarationNode = AnyNode & {
  name: string
  loc: SourceLocation
  valueType: TypeAliasInfo
}
export type CheckerObjectPropertyNode = CheckerNode & {
  key: string
  loc: SourceLocation
  value: CheckerNode
}

export type FunctionTypeParamMetadata = {
  name: string
  loc: SourceLocation
  optional?: boolean
  rest?: boolean
  declaredType?: string
  valueType: ValueType
  nullable?: boolean
  arrayElementType?: ValueType | null
  arrayElementDeclaredType?: string | null
  arrayElementFunctionType?: FunctionTypeMetadata | null
  arrayElementFunctionTypeOwnership?: 'weak'
  mapKeyType?: ValueType | null
  mapValueType?: ValueType | null
  mapValueShape?: ObjectShapeInfo | null
  promiseValueType?: ValueType | null
  setElementType?: ValueType | null
  functionType?: FunctionTypeMetadata | null
  functionTypeOwnership?: 'weak'
  shape?: ObjectShapeInfo | null
  [key: string]: any
}

export type FunctionTypeMetadata = {
  kind?: string
  resolved: boolean
  params: FunctionTypeParamMetadata[]
  returnType: ValueType
  declaredReturnType?: string
  returnNullable: boolean
  returnArrayElementType?: ValueType | null
  returnArrayElementDeclaredType?: string | null
  returnMapKeyType?: ValueType | null
  returnMapValueType?: ValueType | null
  returnPromiseValueType?: ValueType | null
  returnSetElementType?: ValueType | null
  returnShape?: ObjectShapeInfo | null
  loc?: SourceLocation
  [key: string]: any
}

export type CheckerMapType = {
  key: ValueType | null
  value: ValueType | null
  valueShape?: ObjectShapeInfo | null
}


export type NullableConditionNarrowing = {
  trueNames: string[]
  falseNames: string[]
}

export type ObjectShapeBases = {
  dynamic: boolean
  dynamicField: AnyNode | null
  fields: AnyNode[]
}

export type CheckProgramResult = {
  ast: ProgramNode
}

export type RuntimeCallInfo = {
  method: string
  label: string
  unsupported: boolean
}

export type AnyNodeFieldOptions = {
  arrayElementType?: ValueType | null
  arrayElementDeclaredType?: string | null
  shape?: ObjectShapeInfo | null
}

export function isAnyNodeChildFieldName(name: string): boolean {
  return (
    name === 'argument' ||
    name === 'callee' ||
    name === 'expression' ||
    name === 'handler' ||
    name === 'index' ||
    name === 'init' ||
    name === 'left' ||
    name === 'object' ||
    name === 'right' ||
    name === 'target'
  )
}

export function isUnsupportedEqualityOperator(operator: string): boolean {
  return (
    operator.length === 2 &&
    (operator[0] === '=' || operator[0] === '!') &&
    operator[1] === '='
  )
}

export function anyNodeResolvedTypeInfo(loc: SourceLocation): ResolvedTypeInfo {
  return {
    valueType: 'object',
    nullable: false,
    functionType: null,
    shape: anyNodeObjectShape(loc),
    arrayElementType: null,
    arrayElementDeclaredType: null,
    mapKeyType: null,
    mapValueType: null,
    mapValueShape: null,
    promiseValueType: null,
    setElementType: null
  }
}

export function anyNodeObjectShape(loc: SourceLocation): ObjectShapeInfo {
  return {
    kind: 'object',
    builtin: 'compiler.AnyNode',
    dynamic: true,
    dynamicField: anyNodeField('', 'unknown', null, true, loc),
    fields: [
      anyNodeField('type', 'string', null, true, loc),
      anyNodeField('loc', 'object', null, true, loc, { shape: anyNodeLocObjectShape(loc) }),
      anyNodeField('name', 'string', null, false, loc),
      anyNodeField('imported', 'string', null, false, loc),
      anyNodeField('local', 'string', null, false, loc),
      anyNodeField('source', 'string', null, false, loc),
      anyNodeField('path', 'array', null, false, loc, {
        arrayElementType: 'string',
        arrayElementDeclaredType: 'string'
      }),
      anyNodeField('args', 'array', null, false, loc, {
        arrayElementType: 'object'
      }),
      anyNodeField('params', 'array', null, false, loc, {
        arrayElementType: 'object'
      }),
      anyNodeField('methods', 'array', null, false, loc, {
        arrayElementType: 'object'
      }),
      anyNodeField('fields', 'array', null, false, loc, {
        arrayElementType: 'object'
      }),
      anyNodeField('properties', 'array', null, false, loc, {
        arrayElementType: 'object'
      }),
      anyNodeField('elements', 'array', null, false, loc, {
        arrayElementType: 'object'
      }),
      anyNodeField('cases', 'array', null, false, loc, {
        arrayElementType: 'object'
      }),
      anyNodeField('specifiers', 'array', null, false, loc, {
        arrayElementType: 'object',
        arrayElementDeclaredType: 'AnyNode'
      }),
      anyNodeField('body', 'unknown', null, false, loc),
      anyNodeField('callee', 'unknown', null, false, loc),
      anyNodeField('expression', 'unknown', null, false, loc),
      anyNodeField('init', 'unknown', null, false, loc),
      anyNodeField('target', 'unknown', null, false, loc),
      anyNodeField('value', 'unknown', null, false, loc),
      anyNodeField('left', 'unknown', null, false, loc),
      anyNodeField('right', 'unknown', null, false, loc),
      anyNodeField('argument', 'unknown', null, false, loc),
      anyNodeField('block', 'unknown', null, false, loc),
      anyNodeField('object', 'unknown', null, false, loc),
      anyNodeField('index', 'unknown', null, false, loc),
      anyNodeField('handler', 'object', 'AnyNode', true, loc),
      anyNodeField('finalizer', 'unknown', null, true, loc),
      anyNodeField('param', 'string', null, true, loc),
      anyNodeField('paramLoc', 'object', null, true, loc, { shape: anyNodeLocObjectShape(loc) }),
      anyNodeField('expressionBody', 'boolean', null, false, loc),
      anyNodeField('default', 'boolean', null, true, loc),
      anyNodeField('typeOnly', 'boolean', null, false, loc),
      anyNodeField('property', 'string', null, false, loc),
      anyNodeField('operator', 'string', null, false, loc),
      anyNodeField('raw', 'string', null, false, loc),
      anyNodeField('pattern', 'string', null, false, loc),
      anyNodeField('flags', 'string', null, false, loc),
      anyNodeField('declaredType', 'string', null, true, loc),
      anyNodeField('valueType', 'string', null, true, loc),
      anyNodeField('arrayElementType', 'string', null, true, loc),
      anyNodeField('arrayElementDeclaredType', 'string', null, true, loc),
      anyNodeField('arrayElementFunctionType', 'object', null, true, loc),
      anyNodeField('mapKeyType', 'string', null, true, loc),
      anyNodeField('mapValueType', 'string', null, true, loc),
      anyNodeField('promiseValueType', 'string', null, true, loc),
      anyNodeField('promiseRejectionValueType', 'string', null, true, loc),
      anyNodeField('setElementType', 'string', null, true, loc),
      anyNodeField('propertyValueType', 'string', null, true, loc),
      anyNodeField('returnType', 'string', null, true, loc),
      anyNodeField('declaredReturnType', 'string', null, true, loc),
      anyNodeField('returnArrayElementType', 'string', null, true, loc),
      anyNodeField('returnArrayElementDeclaredType', 'string', null, true, loc),
      anyNodeField('returnMapKeyType', 'string', null, true, loc),
      anyNodeField('returnMapValueType', 'string', null, true, loc),
      anyNodeField('returnPromiseValueType', 'string', null, true, loc),
      anyNodeField('returnSetElementType', 'string', null, true, loc),
      anyNodeField('returnNullable', 'boolean', null, false, loc),
      anyNodeField('returnShape', 'object', null, true, loc),
      anyNodeField('functionType', 'object', null, true, loc),
      anyNodeField('shape', 'object', null, true, loc),
      anyNodeField('rest', 'boolean', null, false, loc),
      anyNodeField('pathRuntimeMethod', 'string', null, true, loc),
      anyNodeField('pathRuntimeConstant', 'string', null, true, loc),
      anyNodeField('processRuntimeMethod', 'string', null, true, loc),
      anyNodeField('processRuntimeProperty', 'string', null, true, loc),
      anyNodeField('processRuntimeEnvName', 'string', null, true, loc),
      anyNodeField('runtimeObjectName', 'string', null, true, loc),
      anyNodeField('runtimeObjectSource', 'string', null, true, loc),
      anyNodeField('dgramMessageHandlerName', 'string', null, true, loc),
      anyNodeField('regexpRuntimeMethod', 'string', null, true, loc),
      anyNodeField('urlRuntimeMethod', 'string', null, true, loc),
      anyNodeField('urlRuntimeField', 'string', null, true, loc),
      anyNodeField('httpHandlerName', 'string', null, true, loc)
    ]
  }
}

export function anyNodeLocObjectShape(loc: SourceLocation): ObjectShapeInfo {
  return {
    kind: 'object',
    fields: [
      anyNodeField('file', 'string', null, true, loc),
      anyNodeField('line', 'number', null, false, loc),
      anyNodeField('column', 'number', null, false, loc)
    ]
  }
}

export function anyNodeField(
  name: string,
  valueType: ValueType,
  declaredType: string | null,
  nullable: boolean,
  loc: SourceLocation,
  options: AnyNodeFieldOptions = {}
): AnyNode {
  return {
    name,
    optional: true,
    readonly: false,
    ownership: 'strong',
    declaredType,
    valueType,
    nullable,
    arrayElementType: options.arrayElementType ?? null,
    arrayElementDeclaredType: options.arrayElementDeclaredType ?? null,
    arrayElementFunctionType: null,
    mapKeyType: null,
    mapValueType: null,
    promiseValueType: null,
    setElementType: null,
    functionType: null,
    shape: options.shape ?? null,
    loc
  }
}

export function resolvedValueTypeMetadata(
  value: ValueType | null | undefined,
  fallback: ValueType | null | undefined
): ValueType | null {
  if (value !== null && typeof value !== 'undefined') {
    return value
  }

  if (fallback !== null && typeof fallback !== 'undefined') {
    return fallback
  }

  return null
}

export function resolvedConcreteValueTypeMetadata(
  value: ValueType | null | undefined,
  fallback: ValueType | null | undefined
): ValueType {
  const resolved = resolvedValueTypeMetadata(value, fallback)

  if (resolved !== null && typeof resolved !== 'undefined') {
    return resolved
  }

  return 'unknown'
}

export function resolvedStringMetadata(value: string | null | undefined, fallback: string | null | undefined): string | null {
  if (value !== null && typeof value !== 'undefined') {
    return value
  }

  if (fallback !== null && typeof fallback !== 'undefined') {
    return fallback
  }

  return null
}

export function firstPathSegment(path: readonly string[]): string {
  return path[0]
}

export function nullableNarrowingKey(expression: AnyNode | null | undefined): string | null {
  const path = memberExpressionPath(expression)

  if (path.length === 0) {
    return null
  }

  return joinStrings(path, '.')
}

export function isOptionalChainProtectedExpression(expression: AnyNode | null | undefined): boolean {
  if (expression === null || typeof expression === 'undefined') {
    return false
  }

  return expression.optionalChainProtected === true
}

export function resolvedObjectShapeMetadata(
  value: ObjectShapeInfo | null | undefined,
  fallback: ObjectShapeInfo | null | undefined
): ObjectShapeInfo | null {
  if (value !== null && typeof value !== 'undefined') {
    return value
  }

  if (fallback !== null && typeof fallback !== 'undefined') {
    return fallback
  }

  return null
}

export function resolvedFieldNullableMetadata(field: AnyNode, fieldType: ResolvedTypeInfo): boolean {
  if (field.ownership === 'weak') {
    return true
  }

  if (field.nullable === true) {
    return true
  }

  return fieldType.nullable
}

export function resolvedFunctionTypeMetadata(
  value: FunctionTypeMetadata | null | undefined,
  fallback: FunctionTypeMetadata | null | undefined
): FunctionTypeMetadata | null {
  if (value !== null && typeof value !== 'undefined') {
    return value
  }

  if (fallback !== null && typeof fallback !== 'undefined') {
    return fallback
  }

  return null
}

export function stringAt(values: string[], index: number): string {
  return values[index]
}

export function checkerNodeAt(values: CheckerNode[], index: number): CheckerNode {
  return values[index]
}

export function nodeNameEquals(node: AnyNode, name: string): boolean {
  return node.name === name
}

export function nodeValueTypeOrUnknown(node: AnyNode): ValueType {
  const valueType = node.valueType

  if (valueType !== null && typeof valueType !== 'undefined') {
    return valueType
  }

  return 'unknown'
}

export function nodeDeclaredTypeOrValueType(node: AnyNode): string {
  const declaredType = node.declaredType

  if (declaredType !== null && typeof declaredType !== 'undefined') {
    return declaredType
  }

  return nodeValueTypeOrUnknown(node)
}

export function optionalParamAt(values: OptionalParamInfo[], index: number): OptionalParamInfo {
  return values[index]
}

export function isOptionalParam(param: OptionalParamInfo): boolean {
  if (param.rest === true) {
    return true
  }

  if (param.optional === true) {
    return true
  }

  return param.defaultValue !== null && typeof param.defaultValue !== 'undefined'
}

export function conditionalExpressionValueType(consequentType: ValueType, alternateType: ValueType): ValueType {
  if (consequentType === alternateType) {
    return consequentType
  }

  if (consequentType === 'null') {
    return alternateType
  }

  if (alternateType === 'null') {
    return consequentType
  }

  if (consequentType === 'unknown') {
    return alternateType
  }

  if (alternateType === 'unknown') {
    return consequentType
  }

  return 'unknown'
}

export function resolvedTypeInfoAt(values: ResolvedTypeInfo[], index: number): ResolvedTypeInfo {
  return values[index]
}

export function stringSetFromArray(values: string[]): Set<string> {
  const result: Set<string> = new Set()

  for (let index = 0; index < values.length; index = index + 1) {
    result.add(stringAt(values, index))
  }

  return result
}

export function cloneStringSet(values: Set<string>): Set<string> {
  return new Set(values)
}

export function deleteNullableNarrowingKey(values: Set<string>, key: string): void {
  values.delete(key)

  const prefix = `${key}.`
  const stale: string[] = []

  for (const value of values) {
    if (value.startsWith(prefix)) {
      stale.push(value)
    }
  }

  for (const value of stale) {
    values.delete(value)
  }
}

export function resolvedTypeListHasNullable(infos: ResolvedTypeInfo[]): boolean {
  for (let index = 0; index < infos.length; index = index + 1) {
    if (infos[index].nullable) {
      return true
    }
  }

  return false
}

export function commonResolvedArrayElementType(infos: ResolvedTypeInfo[]): ValueType | null {
  return commonResolvedOptionalValueType(infos, resolvedArrayElementTypeKind)
}

export function commonResolvedMapKeyType(infos: ResolvedTypeInfo[]): ValueType | null {
  return commonResolvedOptionalValueType(infos, resolvedMapKeyTypeKind)
}

export function commonResolvedMapValueType(infos: ResolvedTypeInfo[]): ValueType | null {
  return commonResolvedOptionalValueType(infos, resolvedMapValueTypeKind)
}

export function commonResolvedMapValueShape(infos: ResolvedTypeInfo[]): ObjectShapeInfo | null {
  let shape: ObjectShapeInfo | null = null

  for (let index = 0; index < infos.length; index = index + 1) {
    const info = resolvedTypeInfoAt(infos, index)

    if (info.mapValueShape === null || typeof info.mapValueShape === 'undefined') {
      return null
    }

    if (shape === null || typeof shape === 'undefined') {
      shape = info.mapValueShape
    }
  }

  return shape
}

export function commonResolvedPromiseValueType(infos: ResolvedTypeInfo[]): ValueType | null {
  return commonResolvedOptionalValueType(infos, resolvedPromiseValueTypeKind)
}

export function commonResolvedSetElementType(infos: ResolvedTypeInfo[]): ValueType | null {
  return commonResolvedOptionalValueType(infos, resolvedSetElementTypeKind)
}

export function commonResolvedObjectShape(infos: ResolvedTypeInfo[]): ObjectShapeInfo | null {
  if (infos.length === 0) {
    return null
  }

  const fields: AnyNode[] = []

  for (let infoIndex = 0; infoIndex < infos.length; infoIndex = infoIndex + 1) {
    const info = resolvedTypeInfoAt(infos, infoIndex)
    const shape = info.shape

    if (
      shape === null ||
      typeof shape === 'undefined' ||
      shape.fields === null ||
      typeof shape.fields === 'undefined'
    ) {
      return null
    }

    for (let fieldIndex = 0; fieldIndex < shape.fields.length; fieldIndex = fieldIndex + 1) {
      const field = shape.fields[fieldIndex]

      if (objectShapeFieldByName({ kind: 'object', fields }, field.name)) {
        continue
      }

      const common = commonResolvedObjectShapeField(field.name, infos)

      if (common !== null && typeof common !== 'undefined') {
        fields.push(common)
      }
    }
  }

  if (fields.length === 0) {
    return null
  }

  return {
    kind: 'object',
    fields
  }
}

export function commonResolvedObjectShapeField(name: string, infos: ResolvedTypeInfo[]): AnyNode | null {
  const fields: AnyNode[] = []
  const valueTypes: ValueType[] = []
  let nullable = false
  let optional = false
  let missing = false

  for (let index = 0; index < infos.length; index = index + 1) {
    const info = resolvedTypeInfoAt(infos, index)
    const shape = info.shape

    if (shape === null || typeof shape === 'undefined') {
      return null
    }

    const field = objectShapeFieldByName(shape, name)

    if (field === null || typeof field === 'undefined') {
      missing = true
      continue
    }

    fields.push(field)
    valueTypes.push(nodeValueTypeOrUnknown(field))

    if (field.nullable === true) {
      nullable = true
    }

    if (field.optional === true) {
      optional = true
    }
  }

  const valueType = commonValueType(valueTypes)

  if (valueTypes.length === 0 || valueType === 'unknown') {
    return null
  }

  const first = fields[0]

  return {
    type: first.type,
    name,
    optional: optional || missing,
    readonly: commonResolvedObjectShapeFieldReadonly(fields),
    ownership: commonResolvedObjectShapeFieldOwnership(fields),
    weakLoc: first.weakLoc,
    static: first.static,
    staticLoc: first.staticLoc,
    weakTypeValidated: first.weakTypeValidated,
    loc: first.loc,
    declaredType: commonResolvedObjectShapeFieldDeclaredType(fields),
    valueType,
    nullable,
    arrayElementType: commonResolvedObjectShapeFieldArrayElementType(fields),
    arrayElementDeclaredType: commonResolvedObjectShapeFieldArrayElementDeclaredType(fields),
    mapKeyType: commonResolvedObjectShapeFieldMapKeyType(fields),
    mapValueType: commonResolvedObjectShapeFieldMapValueType(fields),
    mapValueShape: commonResolvedObjectShapeFieldMapValueShape(fields),
    promiseValueType: commonResolvedObjectShapeFieldPromiseValueType(fields),
    setElementType: commonResolvedObjectShapeFieldSetElementType(fields),
    functionType: commonResolvedObjectShapeFieldFunctionType(fields),
    shape: commonResolvedObjectShapeFieldShape(fields)
  }
}

export function objectShapeFieldByName(shape: ObjectShapeInfo, name: string): AnyNode | null {
  const fields = shape.fields

  for (let index = 0; index < fields.length; index = index + 1) {
    const field = fields[index]

    if (field.name === name) {
      return field
    }
  }

  return null
}

export function commonResolvedObjectShapeFieldReadonly(fields: AnyNode[]): boolean {
  for (let index = 0; index < fields.length; index = index + 1) {
    if (fields[index].readonly !== true) {
      return false
    }
  }

  return fields.length > 0
}

export function commonResolvedObjectShapeFieldOwnership(fields: AnyNode[]): string | null {
  const first = fields[0]
  let ownership: string | null = null

  if (first.ownership !== null && typeof first.ownership !== 'undefined') {
    ownership = first.ownership
  }

  for (let index = 1; index < fields.length; index = index + 1) {
    const field = fields[index]
    let current: string | null = null

    if (field.ownership !== null && typeof field.ownership !== 'undefined') {
      current = field.ownership
    }

    if (current !== ownership) {
      return null
    }
  }

  return ownership
}

export function commonResolvedObjectShapeFieldDeclaredType(fields: AnyNode[]): string | null {
  const first = fields[0]
  let declaredType: string | null = null

  if (first.declaredType !== null && typeof first.declaredType !== 'undefined') {
    declaredType = first.declaredType
  }

  for (let index = 1; index < fields.length; index = index + 1) {
    const field = fields[index]
    let current: string | null = null

    if (field.declaredType !== null && typeof field.declaredType !== 'undefined') {
      current = field.declaredType
    }

    if (current !== declaredType) {
      return null
    }
  }

  return declaredType
}

export function commonResolvedObjectShapeFieldArrayElementType(fields: AnyNode[]): ValueType | null {
  const values: ValueType[] = []

  for (let index = 0; index < fields.length; index = index + 1) {
    const value = fields[index].arrayElementType

    if (value === null || typeof value === 'undefined') {
      return null
    }

    values.push(value)
  }

  return commonValueType(values)
}

export function commonResolvedObjectShapeFieldArrayElementDeclaredType(fields: AnyNode[]): string | null {
  const first = fields[0]
  let declaredType: string | null = null

  if (first.arrayElementDeclaredType !== null && typeof first.arrayElementDeclaredType !== 'undefined') {
    declaredType = first.arrayElementDeclaredType
  }

  for (let index = 1; index < fields.length; index = index + 1) {
    const field = fields[index]
    let current: string | null = null

    if (field.arrayElementDeclaredType !== null && typeof field.arrayElementDeclaredType !== 'undefined') {
      current = field.arrayElementDeclaredType
    }

    if (current !== declaredType) {
      return null
    }
  }

  return declaredType
}

export function commonResolvedObjectShapeFieldMapKeyType(fields: AnyNode[]): ValueType | null {
  const values: ValueType[] = []

  for (let index = 0; index < fields.length; index = index + 1) {
    const value = fields[index].mapKeyType

    if (value === null || typeof value === 'undefined') {
      return null
    }

    values.push(value)
  }

  return commonValueType(values)
}

export function commonResolvedObjectShapeFieldMapValueType(fields: AnyNode[]): ValueType | null {
  const values: ValueType[] = []

  for (let index = 0; index < fields.length; index = index + 1) {
    const value = fields[index].mapValueType

    if (value === null || typeof value === 'undefined') {
      return null
    }

    values.push(value)
  }

  return commonValueType(values)
}

export function commonResolvedObjectShapeFieldMapValueShape(fields: AnyNode[]): ObjectShapeInfo | null {
  let shape: ObjectShapeInfo | null = null

  for (let index = 0; index < fields.length; index = index + 1) {
    const value = fields[index].mapValueShape

    if (value === null || typeof value === 'undefined') {
      return null
    }

    if (shape === null || typeof shape === 'undefined') {
      shape = value
    }
  }

  return shape
}

export function commonResolvedObjectShapeFieldPromiseValueType(fields: AnyNode[]): ValueType | null {
  const values: ValueType[] = []

  for (let index = 0; index < fields.length; index = index + 1) {
    const value = fields[index].promiseValueType

    if (value === null || typeof value === 'undefined') {
      return null
    }

    values.push(value)
  }

  return commonValueType(values)
}

export function commonResolvedObjectShapeFieldSetElementType(fields: AnyNode[]): ValueType | null {
  const values: ValueType[] = []

  for (let index = 0; index < fields.length; index = index + 1) {
    const value = fields[index].setElementType

    if (value === null || typeof value === 'undefined') {
      return null
    }

    values.push(value)
  }

  return commonValueType(values)
}

export function commonResolvedObjectShapeFieldFunctionType(fields: AnyNode[]): FunctionTypeMetadata | null {
  const first = fields[0]
  let functionType: FunctionTypeMetadata | null = null

  if (first.functionType !== null && typeof first.functionType !== 'undefined') {
    functionType = first.functionType
  }

  for (let index = 1; index < fields.length; index = index + 1) {
    const field = fields[index]
    let current: FunctionTypeMetadata | null = null

    if (field.functionType !== null && typeof field.functionType !== 'undefined') {
      current = field.functionType
    }

    if (current !== functionType) {
      return null
    }
  }

  return functionType
}

export function commonExpressionFunctionType(values: AnyNode[]): FunctionTypeMetadata | null {
  let functionType: FunctionTypeMetadata | null = null
  let seen = false

  for (let index = 0; index < values.length; index = index + 1) {
    const value = values[index]
    let current: FunctionTypeMetadata | null = null

    if (value.functionType !== null && typeof value.functionType !== 'undefined') {
      current = value.functionType
    }

    if (current === null || typeof current === 'undefined') {
      return null
    }

    if (!seen) {
      functionType = current
      seen = true
    } else if (current !== functionType) {
      return null
    }
  }

  return functionType
}

export function commonResolvedObjectShapeFieldShape(fields: AnyNode[]): ObjectShapeInfo | null {
  const first = fields[0]
  let shape: ObjectShapeInfo | null = null

  if (first.shape !== null && typeof first.shape !== 'undefined') {
    shape = first.shape
  }

  for (let index = 1; index < fields.length; index = index + 1) {
    const field = fields[index]
    let current: ObjectShapeInfo | null = null

    if (field.shape !== null && typeof field.shape !== 'undefined') {
      current = field.shape
    }

    if (current !== shape) {
      return null
    }
  }

  return shape
}

export function resolvedTypeInfoValue(info: ResolvedTypeInfo, kind: ResolvedTypeInfoValueKind): ValueType | null {
  if (kind === resolvedArrayElementTypeKind) {
    return info.arrayElementType
  }

  if (kind === resolvedMapKeyTypeKind) {
    return info.mapKeyType
  }

  if (kind === resolvedMapValueTypeKind) {
    return info.mapValueType
  }

  if (kind === resolvedPromiseValueTypeKind) {
    return info.promiseValueType ?? null
  }

  return info.setElementType
}

export function commonResolvedOptionalValueType(infos: ResolvedTypeInfo[], kind: ResolvedTypeInfoValueKind): ValueType | null {
  const values: ValueType[] = []

  for (let index = 0; index < infos.length; index = index + 1) {
    const info = resolvedTypeInfoAt(infos, index)
    const value = resolvedTypeInfoValue(info, kind)

    if (value === null || typeof value === 'undefined') {
      return null
    }

    values.push(value)
  }

  if (values.length === 0) {
    return null
  }

  return commonValueType(values)
}

function joinStrings(values: readonly string[], separator: string): string {
  let result = ''

  for (let index = 0; index < values.length; index = index + 1) {
    if (index > 0) {
      result = result + separator
    }

    result = result + values[index]
  }

  return result
}
