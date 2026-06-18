import type { AnyNode, ProgramNode } from '../types.ts'
import {
  arrayElementTypeNameFromKnownTypeName,
  isArrayTypeName,
  isBuiltinValueType,
  isBytesTypeName,
  isNullableTypeName,
  isPromiseTypeName,
  isSetTypeName,
  mapTypeNamesFromTypeName,
  nullableTypeNameFromKnownTypeName,
  promiseValueTypeNameFromKnownTypeName,
  setElementTypeNameFromKnownTypeName,
  unionTypeNamesFromTypeName
} from '../type-names.ts'

type LowerTypeNode = AnyNode

export type LowerContext = {
  types: Map<string, LowerTypeNode>
  classNames: Set<string>
  nextId: number
  variables: Map<string, LowerTypeNode>
}

export type LowerResolvedType = {
  valueType: string | null
  nullable: boolean
  arrayElementType: string | null
  arrayElementDeclaredType: string | null
  mapKeyType: string | null
  mapValueType: string | null
  promiseValueType?: string | null
  setElementType: string | null
  returnShape?: LowerTypeNode | null
  shape: LowerTypeNode | null
  functionType: LowerTypeNode | null
}

type LowerObjectShapeBases = {
  dynamic: boolean
  fields: LowerTypeNode[]
}

type LowerResolvedStringKey =
  | 'arrayElementType'
  | 'arrayElementDeclaredType'
  | 'mapKeyType'
  | 'mapValueType'
  | 'promiseValueType'
  | 'setElementType'

type LowerTypeNameResolver = (name: string, context: LowerContext) => LowerResolvedType

export function createLowerContext(ast: ProgramNode): LowerContext {
  return {
    types: collectTypes(ast),
    classNames: collectClassNames(ast),
    nextId: 0,
    variables: new Map()
  }
}

export function resolveDeclaredType(name: string | null | undefined, context: LowerContext): LowerResolvedType {
  if (name == null) {
    return unresolvedType()
  }

  if (isNullableTypeName(name)) {
    const nullableTypeName = nullableTypeNameFromKnownTypeName(name)
    const inner = resolveDeclaredType(nullableTypeName, context)

    return nullableResolvedType(inner)
  }

  const unionTypeNames = unionTypeNamesFromTypeName(name)

  if (unionTypeNames != null) {
    return resolveUnionTypeNames(unionTypeNames, context, resolveDeclaredType)
  }

  if (name === 'array') {
    return arrayResolvedType(null, null)
  }

  if (isArrayTypeName(name)) {
    const arrayElementTypeName = arrayElementTypeNameFromKnownTypeName(name)
    const elementType = resolveDeclaredType(arrayElementTypeName, context)

    return arrayResolvedType(elementType, arrayElementTypeName)
  }

  const mapTypeNames = mapTypeNamesFromTypeName(name)
  let isMalformedMapTypeName = false

  if (mapTypeNames == null && name.startsWith('map<') && name.endsWith('>')) {
    isMalformedMapTypeName = true
  }

  if (name === 'map' || mapTypeNames != null || isMalformedMapTypeName) {
    let keyType: LowerResolvedType | null = null
    let valueType: LowerResolvedType | null = null

    if (mapTypeNames != null) {
      keyType = resolveDeclaredType(mapTypeNames.key, context)
      valueType = resolveDeclaredType(mapTypeNames.value, context)
    }

    return mapResolvedType(keyType, valueType)
  }

  if (name === 'set') {
    return setResolvedType(null)
  }

  if (isSetTypeName(name)) {
    const setElementTypeName = setElementTypeNameFromKnownTypeName(name)
    const elementType = resolveDeclaredType(setElementTypeName, context)

    return setResolvedType(elementType)
  }

  if (name === 'promise') {
    return promiseResolvedType(null)
  }

  if (isPromiseTypeName(name)) {
    const promiseValueTypeName = promiseValueTypeNameFromKnownTypeName(name)
    const valueType = resolveDeclaredType(promiseValueTypeName, context)

    return promiseResolvedType(valueType)
  }

  if (isBytesTypeName(name)) {
    return namedResolvedType('bytes')
  }

  if (isBuiltinValueType(name)) {
    return namedResolvedType(name)
  }

  const typeInfo = context.types.get(name)

  if (typeInfo != null && typeInfo.kind === 'object') {
    const resolved = namedResolvedType('object')
    resolved.shape = resolveObjectShape(typeInfo, context)

    return resolved
  }

  if (typeInfo != null && typeInfo.kind === 'alias') {
    return resolveDeclaredType(typeInfo.valueType, context)
  }

  if (typeInfo != null && typeInfo.kind === 'function') {
    return resolveFunctionType(typeInfo, context)
  }

  if (context.classNames.has(name)) {
    return namedResolvedType('object')
  }

  return unresolvedType()
}

function resolveFunctionType(typeInfo: LowerTypeNode, context: LowerContext): LowerResolvedType {
  const returnType = resolveDeclaredType(typeInfo.returnType, context)
  const resolved = namedResolvedType('function')
  const params: LowerTypeNode[] = []

  for (const param of typeInfo.params) {
    params.push(resolveFunctionParam(param, context))
  }

  resolved.functionType = {
    kind: 'function',
    params,
    returnType: resolvedValueType(returnType, typeInfo.returnType),
    returnNullable: returnType.nullable,
    returnArrayElementType: returnType.arrayElementType,
    returnArrayElementDeclaredType: returnType.arrayElementDeclaredType,
    returnMapKeyType: returnType.mapKeyType,
    returnMapValueType: returnType.mapValueType,
    returnPromiseValueType: nullableString(returnType.promiseValueType),
    returnSetElementType: returnType.setElementType,
    returnShape: returnType.shape
  }

  return resolved
}

function resolveFunctionParam(param: LowerTypeNode, context: LowerContext): LowerTypeNode {
  const declared = resolveDeclaredType(param.valueType, context)

  return {
    name: param.name,
    optional: param.optional === true,
    declaredType: param.valueType,
    valueType: resolvedValueType(declared, param.valueType),
    nullable: declared.nullable,
    arrayElementType: declared.arrayElementType,
    arrayElementDeclaredType: declared.arrayElementDeclaredType,
    mapKeyType: declared.mapKeyType,
    mapValueType: declared.mapValueType,
    promiseValueType: nullableString(declared.promiseValueType),
    setElementType: declared.setElementType,
    shape: declared.shape,
    functionType: declared.functionType,
    loc: param.loc
  }
}

function resolveObjectShape(shape: LowerTypeNode, context: LowerContext): LowerTypeNode {
  const bases = resolveObjectShapeBases(shape, context)
  const fields = concatFields(bases.fields, shape.fields)
  const resolvedFields: LowerTypeNode[] = []

  for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex = fieldIndex + 1) {
    const field = fields[fieldIndex]
    resolvedFields.push(resolveObjectShapeField(field, fields, context))
  }

  return {
    kind: 'object',
    baseTypes: copyStringArray(shape.baseTypes),
    dynamic: shape.dynamic === true || bases.dynamic,
    fields: resolvedFields
  }
}

function resolveObjectShapeField(field: LowerTypeNode, fields: LowerTypeNode[], context: LowerContext): LowerTypeNode {
  const weakField = field.ownership === 'weak' || hasWeakOwnershipMarker(fields, field.name)
  let declared = unresolvedType()

  if (weakField) {
    declared = resolveWeakTargetShapeFieldType(field, context)
  } else {
    declared = resolveFieldDeclaredType(field, context)
  }

  return {
    name: field.name,
    optional: field.optional === true,
    readonly: field.readonly,
    ownership: field.ownership,
    weakLoc: nullableNode(field.weakLoc),
    loc: field.loc,
    declaredType: field.valueType,
    valueType: resolvedValueType(declared, field.valueType),
    nullable: declared.nullable || weakField || field.optional === true,
    arrayElementType: declared.arrayElementType,
    arrayElementDeclaredType: declared.arrayElementDeclaredType,
    mapKeyType: declared.mapKeyType,
    mapValueType: declared.mapValueType,
    promiseValueType: nullableString(declared.promiseValueType),
    setElementType: declared.setElementType,
    shape: declared.shape,
    functionType: resolvedFunctionType(field.functionType, declared.functionType)
  }
}

function hasWeakOwnershipMarker(fields: LowerTypeNode[], fieldName: string): boolean {
  const markerName = `${fieldName}Ownership`

  for (const field of fields) {
    const name: string = field.name
    const valueType: string = field.valueType

    if (name === markerName && field.optional === true && valueType === 'string') {
      return true
    }
  }

  return false
}

function resolveObjectShapeBases(shape: LowerTypeNode, context: LowerContext): LowerObjectShapeBases {
  const fields: LowerTypeNode[] = []
  let dynamic = false
  const baseTypes = copyStringArray(shape.baseTypes)

  for (const name of baseTypes) {
    const base = context.types.get(name)

    if (base == null || base.kind !== 'object') {
      continue
    }

    const resolved = resolveObjectShape(base, context)

    for (const field of resolved.fields) {
      fields.push(field)
    }

    dynamic = dynamic || resolved.dynamic === true
  }

  return {
    dynamic,
    fields
  }
}

function resolveFieldDeclaredType(field: LowerTypeNode, context: LowerContext): LowerResolvedType {
  if (field.ownership === 'weak') {
    return resolveWeakFieldDeclaredType(field, context)
  }

  return resolveDeclaredType(field.valueType, context)
}

function resolveWeakFieldDeclaredType(field: LowerTypeNode, context: LowerContext): LowerResolvedType {
  let targetName = field.valueType

  if (isNullableTypeName(field.valueType)) {
    targetName = nullableTypeNameFromKnownTypeName(field.valueType)
  }

  const typeInfo = context.types.get(targetName)

  if (typeInfo != null && typeInfo.kind === 'object') {
    const resolved = namedResolvedType('object')
    resolved.nullable = true
    resolved.shape = resolveWeakTargetObjectShape(typeInfo, context)

    return resolved
  }

  if (targetName === 'object' || context.classNames.has(targetName)) {
    const resolved = namedResolvedType('object')
    resolved.nullable = true

    return resolved
  }

  const resolved = cloneResolvedType(resolveDeclaredType(targetName, context))
  resolved.nullable = true

  return resolved
}

function resolveWeakTargetObjectShape(shape: LowerTypeNode, context: LowerContext): LowerTypeNode {
  const bases = resolveObjectShapeBases(shape, context)
  const fields = concatFields(bases.fields, shape.fields)
  const resolvedFields: LowerTypeNode[] = []

  for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex = fieldIndex + 1) {
    const field = fields[fieldIndex]
    resolvedFields.push(resolveWeakTargetObjectShapeField(field, context))
  }

  return {
    kind: 'object',
    baseTypes: copyStringArray(shape.baseTypes),
    dynamic: shape.dynamic === true || bases.dynamic,
    fields: resolvedFields
  }
}

function resolveWeakTargetObjectShapeField(field: LowerTypeNode, context: LowerContext): LowerTypeNode {
  const declared = resolveWeakTargetShapeFieldType(field, context)

  return {
    name: field.name,
    optional: field.optional === true,
    readonly: field.readonly,
    ownership: field.ownership,
    weakLoc: nullableNode(field.weakLoc),
    loc: field.loc,
    declaredType: fieldDeclaredType(field),
    valueType: resolvedValueType(declared, field.valueType),
    nullable: declared.nullable || field.ownership === 'weak' || field.optional === true,
    arrayElementType: declared.arrayElementType,
    arrayElementDeclaredType: declared.arrayElementDeclaredType,
    mapKeyType: declared.mapKeyType,
    mapValueType: declared.mapValueType,
    promiseValueType: nullableString(declared.promiseValueType),
    setElementType: declared.setElementType,
    shape: null,
    functionType: nullableNode(field.functionType)
  }
}

function resolveWeakTargetShapeFieldType(field: LowerTypeNode, context: LowerContext): LowerResolvedType {
  return resolveWeakTargetShapeTypeName(fieldDeclaredType(field), context)
}

function resolveWeakTargetShapeTypeName(name: string | null | undefined, context: LowerContext): LowerResolvedType {
  if (name == null) {
    return unresolvedType()
  }

  if (isNullableTypeName(name)) {
    const nullableTypeName = nullableTypeNameFromKnownTypeName(name)
    const inner = resolveWeakTargetShapeTypeName(nullableTypeName, context)

    return nullableResolvedType(inner)
  }

  const unionTypeNames = unionTypeNamesFromTypeName(name)

  if (unionTypeNames != null) {
    return resolveUnionTypeNames(unionTypeNames, context, resolveWeakTargetShapeTypeName)
  }

  if (name === 'array') {
    return arrayResolvedType(null, null)
  }

  if (isArrayTypeName(name)) {
    const arrayElementTypeName = arrayElementTypeNameFromKnownTypeName(name)
    const elementType = resolveWeakTargetShapeTypeName(arrayElementTypeName, context)

    return arrayResolvedType(elementType, arrayElementTypeName)
  }

  const mapTypeNames = mapTypeNamesFromTypeName(name)
  let isMalformedMapTypeName = false

  if (mapTypeNames == null && name.startsWith('map<') && name.endsWith('>')) {
    isMalformedMapTypeName = true
  }

  if (name === 'map' || mapTypeNames != null || isMalformedMapTypeName) {
    let keyType: LowerResolvedType | null = null
    let valueType: LowerResolvedType | null = null

    if (mapTypeNames != null) {
      keyType = resolveWeakTargetShapeTypeName(mapTypeNames.key, context)
      valueType = resolveWeakTargetShapeTypeName(mapTypeNames.value, context)
    }

    return mapResolvedType(keyType, valueType)
  }

  if (name === 'set') {
    return setResolvedType(null)
  }

  if (isSetTypeName(name)) {
    const setElementTypeName = setElementTypeNameFromKnownTypeName(name)
    const elementType = resolveWeakTargetShapeTypeName(setElementTypeName, context)

    return setResolvedType(elementType)
  }

  if (isBytesTypeName(name)) {
    return namedResolvedType('bytes')
  }

  if (isBuiltinValueType(name)) {
    return namedResolvedType(name)
  }

  const typeInfo = context.types.get(name)

  if ((typeInfo != null && typeInfo.kind === 'object') || context.classNames.has(name)) {
    return namedResolvedType('object')
  }

  return resolveDeclaredType(name, context)
}

function collectTypes(ast: ProgramNode): Map<string, LowerTypeNode> {
  const types = new Map()

  for (const item of ast.body) {
    if (item.type === 'TypeAliasDeclaration' && item.valueType.kind === 'object') {
      types.set(item.name, collectObjectType(item.valueType))
    } else if (item.type === 'TypeAliasDeclaration' && item.valueType.kind === 'function') {
      types.set(item.name, collectFunctionType(item.valueType))
    } else if (item.type === 'TypeAliasDeclaration' && item.valueType.kind === 'alias') {
      types.set(item.name, {
        kind: 'alias',
        valueType: item.valueType.valueType
      })
    }
  }

  return types
}

function collectObjectType(valueType: LowerTypeNode): LowerTypeNode {
  return {
    kind: 'object',
    baseTypes: copyStringArray(valueType.baseTypes),
    dynamic: valueType.dynamic === true,
    fields: collectObjectTypeFields(valueType.fields)
  }
}

function collectObjectTypeFields(fields: LowerTypeNode[] | null | undefined): LowerTypeNode[] {
  const collected: LowerTypeNode[] = []

  if (fields == null) {
    return collected
  }

  for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex = fieldIndex + 1) {
    const field = fields[fieldIndex]
    collected.push({
      name: field.name,
      optional: field.optional === true,
      readonly: field.readonly,
      ownership: ownershipOrStrong(field.ownership),
      weakLoc: nullableNode(field.weakLoc),
      functionType: nullableNode(field.functionType),
      valueType: field.valueType,
      loc: field.loc
    })
  }

  return collected
}

function collectFunctionType(valueType: LowerTypeNode): LowerTypeNode {
  return {
    kind: 'function',
    params: collectFunctionParams(valueType.params),
    returnType: valueType.returnType
  }
}

function collectFunctionParams(params: LowerTypeNode[] | null | undefined): LowerTypeNode[] {
  const collected: LowerTypeNode[] = []

  if (params == null) {
    return collected
  }

  for (let paramIndex = 0; paramIndex < params.length; paramIndex = paramIndex + 1) {
    const param = params[paramIndex]
    collected.push({
      name: param.name,
      optional: param.optional === true,
      valueType: param.valueType,
      loc: param.loc
    })
  }

  return collected
}

function collectClassNames(ast: ProgramNode): Set<string> {
  const classNames: Set<string> = new Set()

  for (let itemIndex = 0; itemIndex < ast.body.length; itemIndex = itemIndex + 1) {
    const item = ast.body[itemIndex]
    if (item.type === 'ClassDeclaration') {
      classNames.add(item.name)
    }
  }

  return classNames
}

function namedResolvedType(valueType: string): LowerResolvedType {
  const resolved = unresolvedType()
  resolved.valueType = valueType

  return resolved
}

function nullableResolvedType(source: LowerResolvedType): LowerResolvedType {
  const resolved = cloneResolvedType(source)
  resolved.nullable = true

  return resolved
}

function resolveUnionTypeNames(
  names: string[],
  context: LowerContext,
  resolveTypeName: LowerTypeNameResolver
): LowerResolvedType {
  const resolvedTypes: LowerResolvedType[] = []

  for (let index = 0; index < names.length; index = index + 1) {
    resolvedTypes.push(resolveTypeName(names[index], context))
  }

  const valueType = commonResolvedValueType(resolvedTypes)

  if (valueType == null || valueType === 'unknown') {
    return unresolvedType()
  }

  const resolved = namedResolvedType(valueType)
  resolved.nullable = resolvedTypeListHasNullable(resolvedTypes)

  if (valueType === 'array') {
    resolved.arrayElementType = commonResolvedString(resolvedTypes, 'arrayElementType')
    resolved.arrayElementDeclaredType = commonResolvedString(resolvedTypes, 'arrayElementDeclaredType')
  } else if (valueType === 'map') {
    resolved.mapKeyType = commonResolvedString(resolvedTypes, 'mapKeyType')
    resolved.mapValueType = commonResolvedString(resolvedTypes, 'mapValueType')
  } else if (valueType === 'promise') {
    resolved.promiseValueType = commonResolvedString(resolvedTypes, 'promiseValueType')
  } else if (valueType === 'set') {
    resolved.setElementType = commonResolvedString(resolvedTypes, 'setElementType')
  }

  return resolved
}

function resolvedTypeListHasNullable(values: LowerResolvedType[]): boolean {
  for (let index = 0; index < values.length; index = index + 1) {
    if (values[index].nullable === true) {
      return true
    }
  }

  return false
}

function commonResolvedValueType(values: LowerResolvedType[]): string | null {
  if (values.length === 0) {
    return null
  }

  const first = values[0].valueType

  if (first == null) {
    return null
  }

  for (let index = 1; index < values.length; index = index + 1) {
    if (values[index].valueType !== first) {
      return null
    }
  }

  return first
}

function commonResolvedString(values: LowerResolvedType[], key: LowerResolvedStringKey): string | null {
  if (values.length === 0) {
    return null
  }

  const first = lowerResolvedStringValue(values[0], key)

  if (first == null) {
    return null
  }

  for (let index = 1; index < values.length; index = index + 1) {
    const value = lowerResolvedStringValue(values[index], key)

    if (value == null || value !== first) {
      return null
    }
  }

  return first
}

function lowerResolvedStringValue(value: LowerResolvedType, key: LowerResolvedStringKey): string | null {
  if (key === 'arrayElementType') {
    return value.arrayElementType
  }

  if (key === 'arrayElementDeclaredType') {
    return value.arrayElementDeclaredType
  }

  if (key === 'mapKeyType') {
    return value.mapKeyType
  }

  if (key === 'mapValueType') {
    return value.mapValueType
  }

  if (key === 'promiseValueType') {
    if (value.promiseValueType != null) {
      return value.promiseValueType
    }

    return null
  }

  return value.setElementType
}

function arrayResolvedType(elementType: LowerResolvedType | null, elementDeclaredType: string | null): LowerResolvedType {
  const resolved = namedResolvedType('array')
  resolved.arrayElementType = resolvedValueType(elementType, 'unknown')
  resolved.arrayElementDeclaredType = nullableString(elementDeclaredType)

  return resolved
}

function mapResolvedType(keyType: LowerResolvedType | null, valueType: LowerResolvedType | null): LowerResolvedType {
  const resolved = namedResolvedType('map')
  resolved.mapKeyType = resolvedValueType(keyType, 'unknown')
  resolved.mapValueType = resolvedValueType(valueType, 'unknown')

  return resolved
}

function setResolvedType(elementType: LowerResolvedType | null): LowerResolvedType {
  const resolved = namedResolvedType('set')
  resolved.setElementType = resolvedValueType(elementType, 'unknown')

  return resolved
}

function promiseResolvedType(valueType: LowerResolvedType | null): LowerResolvedType {
  const resolved = namedResolvedType('promise')
  resolved.promiseValueType = resolvedValueType(valueType, 'unknown')

  return resolved
}

function cloneResolvedType(source: LowerResolvedType): LowerResolvedType {
  const resolved: LowerResolvedType = {
    valueType: source.valueType,
    nullable: source.nullable,
    arrayElementType: source.arrayElementType,
    arrayElementDeclaredType: source.arrayElementDeclaredType,
    mapKeyType: source.mapKeyType,
    mapValueType: source.mapValueType,
    promiseValueType: nullableString(source.promiseValueType),
    setElementType: source.setElementType,
    shape: nullableNode(source.shape),
    functionType: nullableNode(source.functionType)
  }

  if (source.returnShape != null) {
    resolved.returnShape = source.returnShape
  }

  return resolved
}

function unresolvedType(): LowerResolvedType {
  return {
    valueType: null,
    nullable: false,
    arrayElementType: null,
    arrayElementDeclaredType: null,
    mapKeyType: null,
    mapValueType: null,
    promiseValueType: null,
    setElementType: null,
    shape: null,
    functionType: null
  }
}

function resolvedValueType(resolved: LowerResolvedType | null, fallback: string): string {
  if (resolved == null) {
    return fallback
  }

  const valueType = resolved.valueType

  if (valueType != null) {
    return valueType
  }

  return fallback
}

function resolvedFunctionType(primary: LowerTypeNode | null | undefined, fallback: LowerTypeNode | null | undefined): LowerTypeNode | null {
  if (primary != null) {
    return primary
  }

  if (fallback != null) {
    return fallback
  }

  return null
}

function fieldDeclaredType(field: LowerTypeNode): string | null {
  if (field.declaredType != null) {
    return field.declaredType
  }

  if (field.valueType != null) {
    return field.valueType
  }

  return null
}

function ownershipOrStrong(value: string | null | undefined): string {
  if (value != null) {
    return value
  }

  return 'strong'
}

function nullableString(value: string | null | undefined): string | null {
  if (value != null) {
    return value
  }

  return null
}

function nullableNode(value: LowerTypeNode | null | undefined): LowerTypeNode | null {
  if (value != null) {
    return value
  }

  return null
}

function copyStringArray(values: string[] | null | undefined): string[] {
  const copy: string[] = []

  if (values == null) {
    return copy
  }

  for (const value of values) {
    copy.push(value)
  }

  return copy
}

function concatFields(left: LowerTypeNode[], right: LowerTypeNode[] | null | undefined): LowerTypeNode[] {
  const fields: LowerTypeNode[] = []

  for (let fieldIndex = 0; fieldIndex < left.length; fieldIndex = fieldIndex + 1) {
    const field = left[fieldIndex]
    fields.push(field)
  }

  if (right == null) {
    return fields
  }

  for (let fieldIndex = 0; fieldIndex < right.length; fieldIndex = fieldIndex + 1) {
    const field = right[fieldIndex]
    fields.push(field)
  }

  return fields
}
