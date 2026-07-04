import { diagnostic } from '../diagnostics.ts'
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
  recordTypeNamesFromTypeName,
  setElementTypeNameFromKnownTypeName,
  unionTypeNamesFromTypeName
} from '../type-names.ts'
import type {
  AnyNode,
  Diagnostic,
  FunctionTypeInfo,
  ObjectShapeInfo,
  SourceLocation,
  SymbolInfo,
  TypeAliasInfo,
  ValueType
} from '../types.ts'
import { commonValueType } from './assignability.ts'
import { hasWeakOwnershipMarker } from './ownership.ts'
import {
  anyNodeResolvedTypeInfo,
  commonResolvedArrayElementType,
  commonResolvedMapKeyType,
  commonResolvedMapValueShape,
  commonResolvedMapValueType,
  commonResolvedObjectShape,
  commonResolvedPromiseValueType,
  commonResolvedSetElementType,
  isOptionalParam,
  nodeDeclaredTypeOrValueType,
  resolvedFunctionTypeMetadata as resolvedFunctionTypeMetadataValue,
  resolvedTypeListHasNullable
} from './resolved-types.ts'
import type {
  FunctionTypeMetadata,
  FunctionTypeParamMetadata,
  ObjectShapeBases,
  ResolvedTypeInfo,
  TypeAliasDeclarationNode
} from './resolved-types.ts'
import { mergeShapeFields } from './helpers.ts'

export type DeclaredTypeResolverContext = {
  classNames: Set<string>
  diagnostics: Diagnostic[]
  resolvedDeclaredTypes: Map<string, ResolvedTypeInfo>
  resolvingDeclaredTypes: Set<string>
  symbols: Map<string, SymbolInfo>
  types: Map<string, TypeAliasInfo>
}

export function declareTypeAlias(context: DeclaredTypeResolverContext, item: TypeAliasDeclarationNode): void {
  if (context.types.has(item.name)) {
    context.diagnostics.push(diagnostic('INOX_REDECLARED_NAME', `type ${item.name} is already declared`, item.loc))
    return
  }

  if (item.valueType.kind === 'alias' || item.valueType.kind === 'object' || item.valueType.kind === 'function') {
    context.types.set(item.name, item.valueType)
  }
}

export function resolveDeclaredType(
  context: DeclaredTypeResolverContext,
  name: string | null | undefined,
  loc: SourceLocation
): ResolvedTypeInfo {
  if (name === null || typeof name === 'undefined' || name === 'unknown') {
    return unresolvedTypeInfo()
  }

  if (name === 'AnyNode') {
    return anyNodeResolvedTypeInfo(loc)
  }

  if (name === 'ValueType') {
    const info = unresolvedTypeInfo()
    info.valueType = 'string'

    return info
  }

  if (isNullableTypeName(name)) {
    const nullableTypeName = nullableTypeNameFromKnownTypeName(name)
    const inner = resolveDeclaredType(context, nullableTypeName, loc)

    return {
      valueType: inner.valueType,
      nullable: true,
      functionType: inner.functionType,
      shape: inner.shape,
      arrayElementType: inner.arrayElementType,
      arrayElementDeclaredType: inner.arrayElementDeclaredType,
      mapKeyType: inner.mapKeyType,
      mapValueType: inner.mapValueType,
      mapValueShape: inner.mapValueShape,
      promiseValueType: inner.promiseValueType,
      setElementType: inner.setElementType
    }
  }

  const unionTypeNames = unionTypeNamesFromTypeName(name)

  if (unionTypeNames !== null && typeof unionTypeNames !== 'undefined') {
    return resolveUnionDeclaredType(context, unionTypeNames, loc)
  }

  if (name === 'array') {
    const info = unresolvedTypeInfo()
    info.valueType = 'array'
    info.arrayElementType = 'unknown'

    return info
  }

  if (isArrayTypeName(name)) {
    const arrayElementTypeName = arrayElementTypeNameFromKnownTypeName(name)
    const elementInfo = resolveDeclaredType(context, arrayElementTypeName, loc)
    const info = unresolvedTypeInfo()
    info.valueType = 'array'
    info.arrayElementType = elementInfo.valueType
    info.arrayElementDeclaredType = arrayElementTypeName
    info.arrayElementFunctionType = elementInfo.functionType

    return info
  }

  const mapTypeNames = mapTypeNamesFromTypeName(name)

  if (name === 'map' || (mapTypeNames !== null && typeof mapTypeNames !== 'undefined')) {
    const info = unresolvedTypeInfo()
    info.valueType = 'map'
    info.mapKeyType = 'unknown'
    info.mapValueType = 'unknown'

    if (mapTypeNames !== null && typeof mapTypeNames !== 'undefined') {
      const keyInfo = resolveDeclaredType(context, mapTypeNames.key, loc)
      const valueInfo = resolveDeclaredType(context, mapTypeNames.value, loc)
      info.mapKeyType = keyInfo.valueType
      info.mapValueType = valueInfo.valueType
      info.mapValueShape = valueInfo.shape
    }

    return info
  }

  const recordTypeNames = recordTypeNamesFromTypeName(name)

  if (recordTypeNames !== null && typeof recordTypeNames !== 'undefined') {
    const valueInfo = resolveDeclaredType(context, recordTypeNames.value, loc)
    const info = unresolvedTypeInfo()
    info.valueType = 'object'
    info.shape = {
      kind: 'object',
      dynamic: true,
      dynamicField: {
        name: '',
        optional: false,
        readonly: false,
        ownership: 'strong',
        declaredType: recordTypeNames.value,
        valueType: valueInfo.valueType,
        nullable: valueInfo.nullable,
        arrayElementType: valueInfo.arrayElementType,
        arrayElementDeclaredType: valueInfo.arrayElementDeclaredType,
        mapKeyType: valueInfo.mapKeyType,
        mapValueType: valueInfo.mapValueType,
        mapValueShape: valueInfo.mapValueShape,
        promiseValueType: valueInfo.promiseValueType,
        setElementType: valueInfo.setElementType,
        functionType: valueInfo.functionType,
        shape: valueInfo.shape,
        loc
      },
      fields: []
    }

    return info
  }

  if (name === 'set') {
    const info = unresolvedTypeInfo()
    info.valueType = 'set'
    info.setElementType = 'unknown'

    return info
  }

  if (isSetTypeName(name)) {
    const setElementTypeName = setElementTypeNameFromKnownTypeName(name)
    const elementInfo = resolveDeclaredType(context, setElementTypeName, loc)
    const info = unresolvedTypeInfo()
    info.valueType = 'set'
    info.setElementType = elementInfo.valueType

    return info
  }

  if (name === 'promise') {
    const info = unresolvedTypeInfo()
    info.valueType = 'promise'
    info.promiseValueType = 'unknown'

    return info
  }

  if (isPromiseTypeName(name)) {
    const promiseValueTypeName = promiseValueTypeNameFromKnownTypeName(name)
    const valueInfo = resolveDeclaredType(context, promiseValueTypeName, loc)
    const info = unresolvedTypeInfo()
    info.valueType = 'promise'
    info.shape = valueInfo.shape
    info.promiseValueType = valueInfo.valueType

    return info
  }

  if (isBytesTypeName(name)) {
    const info = unresolvedTypeInfo()
    info.valueType = 'bytes'

    return info
  }

  if (isBuiltinValueType(name)) {
    const info = unresolvedTypeInfo()
    info.valueType = name

    return info
  }

  const classKnown = context.classNames.has(name)
  let classSymbol: SymbolInfo | null = null

  if (classKnown) {
    const foundClassSymbol = context.symbols.get(name)

    if (foundClassSymbol !== null && typeof foundClassSymbol !== 'undefined' && foundClassSymbol.kind === 'class') {
      classSymbol = foundClassSymbol
    }
  }

  if (
    classKnown ||
    (classSymbol !== null && typeof classSymbol !== 'undefined' && classSymbol.kind === 'class')
  ) {
    const info = unresolvedTypeInfo()
    info.valueType = 'object'

    if (
      classSymbol !== null &&
      typeof classSymbol !== 'undefined' &&
      classSymbol.shape !== null &&
      typeof classSymbol.shape !== 'undefined'
    ) {
      info.shape = classSymbol.shape
    }

    return info
  }

  const shape = context.types.get(name)

  if (shape !== null && typeof shape !== 'undefined') {
    const cached = context.resolvedDeclaredTypes.get(name)

    if (cached !== null && typeof cached !== 'undefined') {
      return cloneResolvedTypeInfo(cached)
    }

    if (context.resolvingDeclaredTypes.has(name)) {
      const recursiveInfo = unresolvedTypeInfo()

      if (shape.kind === 'function') {
        recursiveInfo.valueType = 'function'
      } else if (shape.kind === 'object') {
        recursiveInfo.valueType = 'object'
      }

      return recursiveInfo
    }

    if (shape.kind === 'alias') {
      context.resolvingDeclaredTypes.add(name)

      try {
        const resolved = resolveDeclaredType(context, shape.valueType, loc)
        context.resolvedDeclaredTypes.set(name, cloneResolvedTypeInfo(resolved))

        return resolved
      } finally {
        context.resolvingDeclaredTypes.delete(name)
      }
    }

    if (shape.kind === 'function') {
      return resolveDeclaredFunctionAlias(context, name, shape, loc)
    }

    context.resolvingDeclaredTypes.add(name)

    try {
      const resolvedShape = resolveObjectShape(context, shape)
      const resolved = unresolvedTypeInfo()
      resolved.valueType = 'object'
      resolved.shape = resolvedShape
      context.resolvedDeclaredTypes.set(name, cloneResolvedTypeInfo(resolved))

      return resolved
    } finally {
      context.resolvingDeclaredTypes.delete(name)
    }
  }

  context.diagnostics.push(diagnostic('INOX_UNKNOWN_TYPE', `unknown type ${name}`, loc))

  return unresolvedTypeInfo()
}

function resolveDeclaredFunctionAlias(
  context: DeclaredTypeResolverContext,
  name: string,
  shape: FunctionTypeInfo,
  loc: SourceLocation
): ResolvedTypeInfo {
  context.resolvingDeclaredTypes.add(name)

  try {
    const returnInfo = resolveDeclaredType(context, shape.returnType, loc)
    const params = resolveFunctionTypeParams(context, shape.params)
    const resolved = unresolvedTypeInfo()
    let returnPromiseValueType: ValueType | null = null

    if (returnInfo.promiseValueType !== null && typeof returnInfo.promiseValueType !== 'undefined') {
      returnPromiseValueType = returnInfo.promiseValueType
    }

    resolved.valueType = 'function'
    resolved.functionType = {
      kind: 'function',
      resolved: true,
      params,
      declaredReturnType: shape.returnType,
      returnType: returnInfo.valueType,
      returnNullable: returnInfo.nullable,
      returnArrayElementType: returnInfo.arrayElementType,
      returnArrayElementDeclaredType: returnInfo.arrayElementDeclaredType,
      returnMapKeyType: returnInfo.mapKeyType,
      returnMapValueType: returnInfo.mapValueType,
      returnPromiseValueType,
      returnSetElementType: returnInfo.setElementType,
      returnShape: returnInfo.shape
    }
    context.resolvedDeclaredTypes.set(name, cloneResolvedTypeInfo(resolved))

    return resolved
  } finally {
    context.resolvingDeclaredTypes.delete(name)
  }
}

function resolveFunctionTypeParams(
  context: DeclaredTypeResolverContext,
  params: AnyNode[]
): FunctionTypeParamMetadata[] {
  const resolvedParams: FunctionTypeParamMetadata[] = []

  for (const param of params) {
    const declaredType = nodeDeclaredTypeOrValueType(param)
    const paramInfo = resolveDeclaredType(context, declaredType, param.loc)
    let paramPromiseValueType: ValueType | null = null

    if (paramInfo.promiseValueType !== null && typeof paramInfo.promiseValueType !== 'undefined') {
      paramPromiseValueType = paramInfo.promiseValueType
    }

    resolvedParams.push({
      name: param.name,
      loc: param.loc,
      optional: isOptionalParam(param),
      rest: param.rest === true,
      declaredType,
      valueType: paramInfo.valueType,
      nullable: paramInfo.nullable,
      arrayElementType: paramInfo.arrayElementType,
      arrayElementDeclaredType: paramInfo.arrayElementDeclaredType,
      mapKeyType: paramInfo.mapKeyType,
      mapValueType: paramInfo.mapValueType,
      promiseValueType: paramPromiseValueType,
      setElementType: paramInfo.setElementType,
      functionType: paramInfo.functionType,
      shape: paramInfo.shape
    })
  }

  return resolvedParams
}

export function resolveUnionDeclaredType(
  context: DeclaredTypeResolverContext,
  names: string[],
  loc: SourceLocation
): ResolvedTypeInfo {
  const infos: ResolvedTypeInfo[] = []
  const valueTypes: ValueType[] = []

  for (let index = 0; index < names.length; index = index + 1) {
    const info = resolveDeclaredType(context, names[index], loc)
    infos.push(info)
    valueTypes.push(info.valueType)
  }

  const valueType = commonValueType(valueTypes)
  const result = unresolvedTypeInfo()

  if (valueType === 'unknown') {
    return result
  }

  result.valueType = valueType
  result.nullable = resolvedTypeListHasNullable(infos)

  if (valueType === 'array') {
    result.arrayElementType = commonResolvedArrayElementType(infos)
  } else if (valueType === 'map') {
    result.mapKeyType = commonResolvedMapKeyType(infos)
    result.mapValueType = commonResolvedMapValueType(infos)
    result.mapValueShape = commonResolvedMapValueShape(infos)
  } else if (valueType === 'promise') {
    result.promiseValueType = commonResolvedPromiseValueType(infos)
  } else if (valueType === 'set') {
    result.setElementType = commonResolvedSetElementType(infos)
  } else if (valueType === 'object') {
    result.shape = commonResolvedObjectShape(infos)
  }

  return result
}

export function resolveObjectShape(context: DeclaredTypeResolverContext, shape: ObjectShapeInfo): ObjectShapeInfo {
  const bases = resolveObjectShapeBases(context, shape)
  const fields: AnyNode[] = []
  const resolvedFields: AnyNode[] = []

  mergeShapeFields(fields, bases.fields)
  mergeShapeFields(fields, shape.fields)

  for (const field of fields) {
    resolvedFields.push(resolveObjectShapeField(context, field, fields))
  }

  const resolvedBaseTypes: string[] = []
  const baseTypes = shape.baseTypes

  if (baseTypes !== null && typeof baseTypes !== 'undefined') {
    for (let index = 0; index < baseTypes.length; index = index + 1) {
      resolvedBaseTypes.push(baseTypes[index])
    }
  }

  const resolvedShape: ObjectShapeInfo = {
    kind: 'object',
    baseTypes: resolvedBaseTypes,
    dynamic: shape.dynamic === true || bases.dynamic,
    dynamicField: bases.dynamicField,
    fields: resolvedFields
  }

  if (shape.dynamicField !== null && typeof shape.dynamicField !== 'undefined') {
    resolvedShape.dynamicField = resolveObjectShapeField(context, shape.dynamicField, [shape.dynamicField])
  }

  if (shape.builtin !== null && typeof shape.builtin !== 'undefined') {
    resolvedShape.builtin = shape.builtin
  }

  return resolvedShape
}

export function resolveObjectShapeField(
  context: DeclaredTypeResolverContext,
  field: AnyNode,
  fields: AnyNode[]
): AnyNode {
  const weakField = field.ownership === 'weak' || hasWeakOwnershipMarker(fields, field.name)
  const declaredType = nodeDeclaredTypeOrValueType(field)

  let fieldInfo = resolveFieldDeclaredType(context, field)

  if (weakField) {
    fieldInfo = resolveWeakTargetShapeFieldType(context, field)
  }

  let promiseValueType: ValueType | null = null
  let functionType = fieldInfo.functionType

  if (functionType === null || typeof functionType === 'undefined') {
    const fieldFunctionType = field.functionType

    if (fieldFunctionType !== null && typeof fieldFunctionType !== 'undefined') {
      functionType = resolveFunctionTypeMetadata(context, fieldFunctionType, field.loc)
    } else {
      functionType = null
    }
  }

  if (fieldInfo.promiseValueType !== null && typeof fieldInfo.promiseValueType !== 'undefined') {
    promiseValueType = fieldInfo.promiseValueType
  }

  return {
    type: field.type,
    name: field.name,
    optional: field.optional,
    readonly: field.readonly,
    ownership: field.ownership,
    weakLoc: field.weakLoc,
    static: field.static,
    staticLoc: field.staticLoc,
    weakTypeValidated: field.weakTypeValidated,
    loc: field.loc,
    declaredType,
    valueType: fieldInfo.valueType,
    nullable: fieldInfo.nullable || weakField || field.optional === true,
    arrayElementType: fieldInfo.arrayElementType,
    arrayElementDeclaredType: fieldInfo.arrayElementDeclaredType,
    mapKeyType: fieldInfo.mapKeyType,
    mapValueType: fieldInfo.mapValueType,
    mapValueShape: fieldInfo.mapValueShape,
    promiseValueType,
    setElementType: fieldInfo.setElementType,
    functionType,
    shape: fieldInfo.shape
  }
}

export function resolveFunctionTypeMetadata(
  context: DeclaredTypeResolverContext,
  functionType: FunctionTypeMetadata | null | undefined,
  loc: SourceLocation | null | undefined
): FunctionTypeMetadata | null {
  if (functionType === null || typeof functionType === 'undefined') {
    return null
  }

  let typeLine = 1
  let typeColumn = 1

  if (loc !== null && typeof loc !== 'undefined') {
    typeLine = loc.line
    typeColumn = loc.column
  }

  const functionTypeLoc = functionType.loc

  if (functionTypeLoc !== null && typeof functionTypeLoc !== 'undefined') {
    typeLine = functionTypeLoc.line
    typeColumn = functionTypeLoc.column
  }

  const typeLoc: SourceLocation = { line: typeLine, column: typeColumn }
  const returnInfo = resolveDeclaredType(context, functionType.returnType, typeLoc)
  const params = resolveFunctionTypeParams(context, functionType.params)
  let returnPromiseValueType: ValueType | null = null

  if (returnInfo.promiseValueType !== null && typeof returnInfo.promiseValueType !== 'undefined') {
    returnPromiseValueType = returnInfo.promiseValueType
  }

  return {
    kind: 'function',
    resolved: true,
    params,
    declaredReturnType: functionType.returnType,
    returnType: returnInfo.valueType,
    returnNullable: returnInfo.nullable,
    returnArrayElementType: returnInfo.arrayElementType,
    returnArrayElementDeclaredType: returnInfo.arrayElementDeclaredType,
    returnMapKeyType: returnInfo.mapKeyType,
    returnMapValueType: returnInfo.mapValueType,
    returnPromiseValueType,
    returnSetElementType: returnInfo.setElementType,
    returnShape: returnInfo.shape
  }
}

export function resolveObjectShapeBases(
  context: DeclaredTypeResolverContext,
  shape: ObjectShapeInfo
): ObjectShapeBases {
  const fields: AnyNode[] = []
  let dynamic = false
  let dynamicField: AnyNode | null = null

  const baseTypes: string[] = shape.baseTypes ?? []

  for (const name of baseTypes) {
    const base = context.types.get(name)

    if (base === null || typeof base === 'undefined' || base.kind !== 'object') {
      continue
    }

    const resolved = resolveObjectShape(context, base)

    for (const field of resolved.fields) {
      fields.push(field)
    }

    dynamic = dynamic || resolved.dynamic === true

    if (resolved.dynamicField !== null && typeof resolved.dynamicField !== 'undefined') {
      dynamicField = resolved.dynamicField
    }
  }

  return {
    dynamic,
    dynamicField,
    fields
  }
}

export function resolveFieldDeclaredType(
  context: DeclaredTypeResolverContext,
  field: AnyNode
): ResolvedTypeInfo {
  if (field.ownership === 'weak') {
    return resolveWeakFieldDeclaredType(context, field)
  }

  const declaredType = nodeDeclaredTypeOrValueType(field)

  return resolveDeclaredType(context, declaredType, field.loc)
}

export function resolveWeakFieldDeclaredType(
  context: DeclaredTypeResolverContext,
  field: AnyNode
): ResolvedTypeInfo {
  const declaredName = nodeDeclaredTypeOrValueType(field)

  let targetName = declaredName

  if (isNullableTypeName(declaredName)) {
    const nullableName = nullableTypeNameFromKnownTypeName(declaredName)

    if (nullableName !== null && typeof nullableName !== 'undefined') {
      targetName = nullableName
    }
  }

  const fieldInfo = resolveWeakTargetDeclaredType(context, targetName, field.loc)

  if (fieldInfo.valueType !== 'unknown' && fieldInfo.valueType !== 'object' && field.weakTypeValidated !== true) {
    let weakLoc = field.loc

    if (field.weakLoc !== null && typeof field.weakLoc !== 'undefined') {
      weakLoc = field.weakLoc
    }

    context.diagnostics.push(
      diagnostic(
        'INOX_WEAK_TYPE',
        `weak field ${field.name} must target an object or class type in the current compiler slice`,
        weakLoc
      )
    )
  }

  field.weakTypeValidated = true

  fieldInfo.nullable = true

  return fieldInfo
}

export function resolveWeakTargetDeclaredType(
  context: DeclaredTypeResolverContext,
  name: string | null | undefined,
  loc: SourceLocation
): ResolvedTypeInfo {
  if (name === null || typeof name === 'undefined' || name === 'unknown') {
    return unresolvedTypeInfo()
  }

  if (name === 'object') {
    const info = unresolvedTypeInfo()
    info.valueType = 'object'

    return info
  }

  const shape = context.types.get(name)

  if (shape !== null && typeof shape !== 'undefined' && shape.kind === 'object') {
    const info = unresolvedTypeInfo()
    info.valueType = 'object'
    info.shape = resolveWeakTargetObjectShape(context, shape)

    return info
  }

  const classSymbol = context.symbols.get(name)

  if (
    context.classNames.has(name) ||
    (classSymbol !== null && typeof classSymbol !== 'undefined' && classSymbol.kind === 'class')
  ) {
    const info = unresolvedTypeInfo()
    info.valueType = 'object'

    if (
      classSymbol !== null &&
      typeof classSymbol !== 'undefined' &&
      classSymbol.shape !== null &&
      typeof classSymbol.shape !== 'undefined'
    ) {
      info.shape = resolveWeakTargetObjectShape(context, classSymbol.shape)
    }

    return info
  }

  return resolveDeclaredType(context, name, loc)
}

export function resolveWeakTargetObjectShape(
  context: DeclaredTypeResolverContext,
  shape: ObjectShapeInfo
): ObjectShapeInfo {
  const bases = resolveObjectShapeBases(context, shape)
  const fields: AnyNode[] = []
  const resolvedFields: AnyNode[] = []

  mergeShapeFields(fields, bases.fields)
  mergeShapeFields(fields, shape.fields)

  for (const field of fields) {
    const declared = resolveWeakTargetShapeFieldType(context, field)
    let declaredType = nodeDeclaredTypeOrValueType(field)
    const fieldDeclaredType = field.declaredType
    let promiseValueType: ValueType | null = null
    const functionType = resolvedFunctionTypeMetadataValue(declared.functionType, field.functionType)

    if (fieldDeclaredType !== null && typeof fieldDeclaredType !== 'undefined') {
      declaredType = fieldDeclaredType
    }

    if (declared.promiseValueType !== null && typeof declared.promiseValueType !== 'undefined') {
      promiseValueType = declared.promiseValueType
    }

    resolvedFields.push({
      type: field.type,
      name: field.name,
      optional: field.optional,
      readonly: field.readonly,
      ownership: field.ownership,
      weakLoc: field.weakLoc,
      static: field.static,
      staticLoc: field.staticLoc,
      weakTypeValidated: field.weakTypeValidated,
      loc: field.loc,
      declaredType,
      valueType: declared.valueType,
      nullable: declared.nullable || field.ownership === 'weak' || field.optional === true,
      arrayElementType: declared.arrayElementType,
      arrayElementDeclaredType: declared.arrayElementDeclaredType,
      mapKeyType: declared.mapKeyType,
      mapValueType: declared.mapValueType,
      promiseValueType,
      setElementType: declared.setElementType,
      functionType,
      shape: null
    })
  }

  const resolvedBaseTypes: string[] = shape.baseTypes ?? []

  const resolvedShape: ObjectShapeInfo = {
    kind: 'object',
    baseTypes: resolvedBaseTypes,
    dynamic: shape.dynamic === true || bases.dynamic,
    fields: resolvedFields
  }

  if (shape.builtin !== null && typeof shape.builtin !== 'undefined') {
    resolvedShape.builtin = shape.builtin
  }

  return resolvedShape
}

export function resolveWeakTargetShapeFieldType(
  context: DeclaredTypeResolverContext,
  field: AnyNode
): ResolvedTypeInfo {
  const declaredType = nodeDeclaredTypeOrValueType(field)

  return resolveWeakTargetShapeTypeName(context, declaredType, field.loc)
}

export function resolveWeakTargetShapeTypeName(
  context: DeclaredTypeResolverContext,
  name: string | null | undefined,
  loc: SourceLocation
): ResolvedTypeInfo {
  if (name === null || typeof name === 'undefined' || name === 'unknown') {
    return unresolvedTypeInfo()
  }

  if (isNullableTypeName(name)) {
    const nullableTypeName = nullableTypeNameFromKnownTypeName(name)
    const inner = resolveWeakTargetShapeTypeName(context, nullableTypeName, loc)

    return {
      valueType: inner.valueType,
      nullable: true,
      functionType: inner.functionType,
      shape: inner.shape,
      arrayElementType: inner.arrayElementType,
      arrayElementDeclaredType: inner.arrayElementDeclaredType,
      mapKeyType: inner.mapKeyType,
      mapValueType: inner.mapValueType,
      mapValueShape: inner.mapValueShape,
      promiseValueType: inner.promiseValueType,
      setElementType: inner.setElementType
    }
  }

  if (name === 'array') {
    const info = unresolvedTypeInfo()
    info.valueType = 'array'
    info.arrayElementType = 'unknown'
    info.arrayElementDeclaredType = null

    return info
  }

  if (isArrayTypeName(name)) {
    const arrayElementTypeName = arrayElementTypeNameFromKnownTypeName(name)
    const elementInfo = resolveWeakTargetShapeTypeName(context, arrayElementTypeName, loc)
    const info = unresolvedTypeInfo()
    info.valueType = 'array'
    info.arrayElementType = elementInfo.valueType
    info.arrayElementDeclaredType = arrayElementTypeName
    info.arrayElementFunctionType = elementInfo.functionType

    return info
  }

  const mapTypeNames = mapTypeNamesFromTypeName(name)

  if (name === 'map' || (mapTypeNames !== null && typeof mapTypeNames !== 'undefined')) {
    const info = unresolvedTypeInfo()
    info.valueType = 'map'
    info.mapKeyType = 'unknown'
    info.mapValueType = 'unknown'

    if (mapTypeNames !== null && typeof mapTypeNames !== 'undefined') {
      const keyInfo = resolveWeakTargetShapeTypeName(context, mapTypeNames.key, loc)
      const valueInfo = resolveWeakTargetShapeTypeName(context, mapTypeNames.value, loc)
      info.mapKeyType = keyInfo.valueType
      info.mapValueType = valueInfo.valueType
    }

    return info
  }

  if (name === 'set') {
    const info = unresolvedTypeInfo()
    info.valueType = 'set'
    info.setElementType = 'unknown'

    return info
  }

  if (isSetTypeName(name)) {
    const setElementTypeName = setElementTypeNameFromKnownTypeName(name)
    const elementInfo = resolveWeakTargetShapeTypeName(context, setElementTypeName, loc)
    const info = unresolvedTypeInfo()
    info.valueType = 'set'
    info.setElementType = elementInfo.valueType

    return info
  }

  if (isBytesTypeName(name)) {
    const info = unresolvedTypeInfo()
    info.valueType = 'bytes'

    return info
  }

  if (name === 'ValueType') {
    const info = unresolvedTypeInfo()
    info.valueType = 'string'

    return info
  }

  if (isBuiltinValueType(name)) {
    const info = unresolvedTypeInfo()
    info.valueType = name

    return info
  }

  const shape = context.types.get(name)
  const symbol = context.symbols.get(name)

  if (
    (shape !== null && typeof shape !== 'undefined' && shape.kind === 'object') ||
    context.classNames.has(name) ||
    (symbol !== null && typeof symbol !== 'undefined' && symbol.kind === 'class')
  ) {
    const info = unresolvedTypeInfo()
    info.valueType = 'object'

    return info
  }

  return resolveDeclaredType(context, name, loc)
}

export function cloneResolvedTypeInfo(info: ResolvedTypeInfo): ResolvedTypeInfo {
  return {
    valueType: info.valueType,
    nullable: info.nullable,
    functionType: info.functionType,
    shape: info.shape,
    arrayElementType: info.arrayElementType,
    arrayElementDeclaredType: info.arrayElementDeclaredType,
    arrayElementFunctionType: info.arrayElementFunctionType ?? null,
    mapKeyType: info.mapKeyType,
    mapValueType: info.mapValueType,
    mapValueShape: info.mapValueShape,
    promiseValueType: info.promiseValueType,
    setElementType: info.setElementType
  }
}

export function unresolvedTypeInfo(): ResolvedTypeInfo {
  return {
    valueType: 'unknown',
    nullable: false,
    functionType: null,
    shape: null,
    arrayElementType: null,
    arrayElementDeclaredType: null,
    mapKeyType: null,
    mapValueType: null,
    mapValueShape: null,
    promiseValueType: null,
    setElementType: null
  }
}
