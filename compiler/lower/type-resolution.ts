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
import type { AnyNode, ProgramNode } from '../types.ts'
import { compilerLibraryNativeTypeForName, resolveCompilerLibrarySet } from '../extensions/library-set.ts'
import type { CompilerLibrarySet } from '../extensions/types.ts'

type LowerTypeNode = AnyNode

export type LowerContext = {
  types: Map<string, LowerTypeNode>
  resolvedTypes: Map<string, LowerResolvedType>
  classNames: Set<string>
  libraries: CompilerLibrarySet
  nextId: number
  variables: Map<string, LowerTypeNode>
  resolvingTypes: Set<string>
}

export type LowerResolvedType = {
  valueType: string | null
  nullable: boolean
  libraryRuntimeRequirements?: string[]
  arrayElementType: string | null
  arrayElementDeclaredType: string | null
  arrayElementFunctionType?: LowerTypeNode | null
  mapKeyType: string | null
  mapValueType: string | null
  mapValueShape?: LowerTypeNode | null
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

export function createLowerContext(
  ast: ProgramNode,
  libraries: CompilerLibrarySet | null | undefined = undefined
): LowerContext {
  return {
    types: collectTypes(ast),
    resolvedTypes: new Map(),
    classNames: collectClassNames(ast),
    libraries: resolveCompilerLibrarySet(libraries),
    nextId: 0,
    variables: new Map(),
    resolvingTypes: new Set()
  }
}

export function resolveDeclaredType(name: string | null | undefined, context: LowerContext): LowerResolvedType {
  if (name === null || typeof name === 'undefined' || name.length === 0) {
    return unresolvedType()
  }

  if (isNullableTypeName(name)) {
    const nullableTypeName = nullableTypeNameFromKnownTypeName(name)
    const inner = resolveDeclaredType(nullableTypeName, context)

    return nullableResolvedType(inner)
  }

  const unionTypeNames = unionTypeNamesFromTypeName(name)

  if (unionTypeNames !== null && typeof unionTypeNames !== 'undefined') {
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

  if ((mapTypeNames === null || typeof mapTypeNames === 'undefined') && name.startsWith('map<') && name.endsWith('>')) {
    isMalformedMapTypeName = true
  }

  if (name === 'map' || (mapTypeNames !== null && typeof mapTypeNames !== 'undefined') || isMalformedMapTypeName) {
    let keyType: LowerResolvedType | null = null
    let valueType: LowerResolvedType | null = null

    if (mapTypeNames !== null && typeof mapTypeNames !== 'undefined') {
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

  const nativeType = compilerLibraryNativeTypeForName(context.libraries, name)

  if (nativeType !== null) {
    const resolved = namedResolvedType(nativeType.valueType)
    resolved.shape = {
      kind: 'object',
      baseTypes: nativeType.baseTypeIds,
      fields: [],
      libraryTypeId: nativeType.typeId,
      libraryCppType: nativeType.cppType
    }
    resolved.libraryRuntimeRequirements = nativeType.runtimeRequirements

    return resolved
  }

  if (isBytesTypeName(name)) {
    return namedResolvedType('bytes')
  }

  if (name === 'ValueType') {
    return namedResolvedType('string')
  }

  if (isBuiltinValueType(name)) {
    return namedResolvedType(name)
  }

  if (name === 'AnyNode') {
    return anyNodeResolvedType()
  }

  const typeInfo = context.types.get(name)
  const cached = context.resolvedTypes.get(name)

  if (cached !== null && typeof cached !== 'undefined') {
    const resolved = cloneResolvedType(cached)

    if (!context.resolvingTypes.has(name)) {
      context.resolvingTypes.add(name)

      try {
        hydrateResolvedType(resolved, context)
        context.resolvedTypes.set(name, cloneResolvedType(resolved))
      } finally {
        context.resolvingTypes.delete(name)
      }
    }

    return resolved
  }

  if (context.resolvingTypes.has(name)) {
    if (
      (typeInfo !== null && typeof typeInfo !== 'undefined' && typeInfo.kind === 'object') ||
      context.classNames.has(name)
    ) {
      return namedResolvedType('object')
    }

    if (typeInfo !== null && typeof typeInfo !== 'undefined' && typeInfo.kind === 'function') {
      return namedResolvedType('function')
    }

    return unresolvedType()
  }

  if (typeInfo !== null && typeof typeInfo !== 'undefined' && typeInfo.kind === 'object') {
    context.resolvingTypes.add(name)

    try {
      const resolved = namedResolvedType('object')
      resolved.shape = resolveObjectShape(typeInfo, context)
      context.resolvedTypes.set(name, cloneResolvedType(resolved))

      return resolved
    } finally {
      context.resolvingTypes.delete(name)
    }
  }

  if (typeInfo !== null && typeof typeInfo !== 'undefined' && typeInfo.kind === 'alias') {
    context.resolvingTypes.add(name)

    try {
      const resolved = resolveDeclaredType(typeInfo.valueType, context)
      context.resolvedTypes.set(name, cloneResolvedType(resolved))

      return resolved
    } finally {
      context.resolvingTypes.delete(name)
    }
  }

  if (typeInfo !== null && typeof typeInfo !== 'undefined' && typeInfo.kind === 'function') {
    context.resolvingTypes.add(name)

    try {
      const resolved = resolveFunctionType(typeInfo, context)
      context.resolvedTypes.set(name, cloneResolvedType(resolved))

      return resolved
    } finally {
      context.resolvingTypes.delete(name)
    }
  }

  if (context.classNames.has(name)) {
    return namedResolvedType('object')
  }

  return unresolvedType()
}

function resolveFunctionType(typeInfo: LowerTypeNode, context: LowerContext): LowerResolvedType {
  let returnTypeName = 'unknown'

  if (typeInfo.returnType !== null && typeof typeInfo.returnType !== 'undefined') {
    returnTypeName = typeInfo.returnType
  }

  const returnType = resolveDeclaredType(returnTypeName, context)
  const resolved = namedResolvedType('function')
  const params: LowerTypeNode[] = []

  for (const param of typeInfo.params) {
    params.push(resolveFunctionParam(param, context))
  }

  resolved.functionType = {
    kind: 'function',
    params,
    returnType: resolvedValueType(returnType, returnTypeName),
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
  const declaredType = fieldDeclaredType(param)
  const declared = resolveDeclaredType(declaredType, context)

  return {
    name: param.name,
    optional: param.optional === true,
    declaredType,
    valueType: resolvedValueType(declared, lowerNodeValueTypeOrUnknown(param)),
    nullable: declared.nullable,
    arrayElementType: declared.arrayElementType,
    arrayElementDeclaredType: declared.arrayElementDeclaredType,
    arrayElementFunctionType: nullableNode(declared.arrayElementFunctionType),
    mapKeyType: declared.mapKeyType,
    mapValueType: declared.mapValueType,
    promiseValueType: nullableString(declared.promiseValueType),
    setElementType: declared.setElementType,
    shape: declared.shape,
    functionType: declared.functionType,
    loc: param.loc
  }
}

export function resolveObjectShape(shape: LowerTypeNode, context: LowerContext): LowerTypeNode {
  const bases = resolveObjectShapeBases(shape, context)
  const fields = concatFields(bases.fields, shape.fields)
  const resolvedFields: LowerTypeNode[] = []

  for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex = fieldIndex + 1) {
    const field = fields[fieldIndex]
    resolvedFields.push(resolveObjectShapeField(field, fields, context))
  }

  return {
    kind: 'object',
    builtin: nullableString(shape.builtin),
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
  let functionType = resolvedFunctionType(field.functionType, declared.functionType)

  if (functionType !== null && typeof functionType !== 'undefined' && functionType.resolved !== true) {
    functionType = resolveFunctionType(functionType, context).functionType
  }

  return {
    name: field.name,
    optional: field.optional === true,
    readonly: field.readonly,
    ownership: field.ownership,
    weakLoc: nullableNode(field.weakLoc),
    loc: field.loc,
    declaredType: fieldDeclaredType(field),
    valueType: resolvedValueType(declared, lowerNodeValueTypeOrUnknown(field)),
    nullable: declared.nullable || weakField || field.optional === true,
    arrayElementType: declared.arrayElementType,
    arrayElementDeclaredType: declared.arrayElementDeclaredType,
    arrayElementFunctionType: nullableNode(declared.arrayElementFunctionType),
    mapKeyType: declared.mapKeyType,
    mapValueType: declared.mapValueType,
    promiseValueType: nullableString(declared.promiseValueType),
    setElementType: declared.setElementType,
    shape: declared.shape,
    functionType
  }
}

function hasWeakOwnershipMarker(fields: LowerTypeNode[], fieldName: string): boolean {
  const markerName = `${fieldName}Ownership`

  for (const field of fields) {
    const name: string = field.name
    const valueType = lowerNodeValueTypeOrUnknown(field)

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

    if (base === null || typeof base === 'undefined' || base.kind !== 'object') {
      continue
    }

    const resolved = resolveObjectShape(base, context)

    for (const field of resolved.fields) {
      fields.push(hydrateObjectShapeField(field, context))
    }

    dynamic = dynamic || resolved.dynamic === true
  }

  return {
    dynamic,
    fields
  }
}

function hydrateResolvedType(resolved: LowerResolvedType, context: LowerContext): void {
  if (resolved.shape !== null && typeof resolved.shape !== 'undefined') {
    resolved.shape = hydrateObjectShape(resolved.shape, context)
  }

  if (resolved.functionType !== null && typeof resolved.functionType !== 'undefined') {
    resolved.functionType = hydrateFunctionType(resolved.functionType, context)
  }
}

function hydrateObjectShape(shape: LowerTypeNode, context: LowerContext): LowerTypeNode {
  const fields: LowerTypeNode[] = []

  for (let index = 0; index < shape.fields.length; index = index + 1) {
    fields.push(hydrateObjectShapeField(shape.fields[index], context))
  }

  return {
    kind: 'object',
    baseTypes: copyStringArray(shape.baseTypes),
    dynamic: shape.dynamic === true,
    fields
  }
}

function hydrateObjectShapeField(field: LowerTypeNode, context: LowerContext): LowerTypeNode {
  let functionType: LowerTypeNode | null = null
  let functionTypeChanged = false

  if (field.functionType !== null && typeof field.functionType !== 'undefined') {
    functionType = hydrateFunctionType(field.functionType, context)
    functionTypeChanged = true
  }

  if (
    field.valueType === 'object' &&
    (field.shape === null || typeof field.shape === 'undefined') &&
    field.declaredType !== null &&
    typeof field.declaredType !== 'undefined'
  ) {
    if (context.resolvingTypes.has(field.declaredType)) {
      return field
    }

    const declared = resolveDeclaredType(field.declaredType, context)

    if (declared.shape !== null && typeof declared.shape !== 'undefined') {
      return {
        name: field.name,
        optional: field.optional,
        readonly: field.readonly,
        ownership: field.ownership,
        weakLoc: nullableNode(field.weakLoc),
        loc: field.loc,
        declaredType: field.declaredType,
        valueType: field.valueType,
        nullable: field.nullable,
        arrayElementType: field.arrayElementType,
        arrayElementDeclaredType: field.arrayElementDeclaredType,
        arrayElementFunctionType: nullableNode(field.arrayElementFunctionType),
        mapKeyType: field.mapKeyType,
        mapValueType: field.mapValueType,
        promiseValueType: nullableString(field.promiseValueType),
        setElementType: field.setElementType,
        shape: declared.shape,
        functionType
      }
    }
  }

  if (functionTypeChanged) {
    return {
      name: field.name,
      optional: field.optional,
      readonly: field.readonly,
      ownership: field.ownership,
      weakLoc: nullableNode(field.weakLoc),
      loc: field.loc,
      declaredType: field.declaredType,
      valueType: field.valueType,
      nullable: field.nullable,
      arrayElementType: field.arrayElementType,
      arrayElementDeclaredType: field.arrayElementDeclaredType,
      arrayElementFunctionType: nullableNode(field.arrayElementFunctionType),
      mapKeyType: field.mapKeyType,
      mapValueType: field.mapValueType,
      promiseValueType: nullableString(field.promiseValueType),
      setElementType: field.setElementType,
      shape: nullableNode(field.shape),
      functionType
    }
  }

  return field
}

function hydrateFunctionType(functionType: LowerTypeNode, context: LowerContext): LowerTypeNode {
  const params: LowerTypeNode[] = []

  for (let index = 0; index < functionType.params.length; index = index + 1) {
    params.push(hydrateFunctionParam(functionType.params[index], context))
  }

  return {
    kind: 'function',
    resolved: functionType.resolved,
    params,
    declaredReturnType: functionType.declaredReturnType,
    returnType: functionType.returnType,
    returnNullable: functionType.returnNullable,
    returnArrayElementType: functionType.returnArrayElementType,
    returnArrayElementDeclaredType: functionType.returnArrayElementDeclaredType,
    returnMapKeyType: functionType.returnMapKeyType,
    returnMapValueType: functionType.returnMapValueType,
    returnPromiseValueType: nullableString(functionType.returnPromiseValueType),
    returnSetElementType: functionType.returnSetElementType,
    returnShape: nullableNode(functionType.returnShape),
    loc: functionType.loc
  }
}

function hydrateFunctionParam(param: LowerTypeNode, context: LowerContext): LowerTypeNode {
  let shape = nullableNode(param.shape)

  if (
    param.valueType === 'object' &&
    param.declaredType !== null &&
    typeof param.declaredType !== 'undefined' &&
    !context.resolvingTypes.has(param.declaredType)
  ) {
    const declared = resolveDeclaredType(param.declaredType, context)

    if (declared.shape !== null && typeof declared.shape !== 'undefined') {
      shape = declared.shape
    }
  }

  return {
    name: param.name,
    optional: param.optional === true,
    declaredType: fieldDeclaredType(param),
    valueType: lowerNodeValueTypeOrUnknown(param),
    nullable: param.nullable,
    arrayElementType: param.arrayElementType,
    arrayElementDeclaredType: param.arrayElementDeclaredType,
    arrayElementFunctionType: nullableNode(param.arrayElementFunctionType),
    mapKeyType: param.mapKeyType,
    mapValueType: param.mapValueType,
    promiseValueType: nullableString(param.promiseValueType),
    setElementType: param.setElementType,
    shape,
    functionType: nullableNode(param.functionType),
    loc: param.loc
  }
}

function resolveFieldDeclaredType(field: LowerTypeNode, context: LowerContext): LowerResolvedType {
  if (field.ownership === 'weak') {
    return resolveWeakFieldDeclaredType(field, context)
  }

  return resolveDeclaredType(fieldDeclaredType(field), context)
}

function resolveWeakFieldDeclaredType(field: LowerTypeNode, context: LowerContext): LowerResolvedType {
  let targetName = fieldDeclaredType(field)

  if (targetName === null || typeof targetName === 'undefined') {
    return unresolvedType()
  }

  if (isNullableTypeName(targetName)) {
    const nullableName = nullableTypeNameFromKnownTypeName(targetName)

    if (nullableName !== null && typeof nullableName !== 'undefined') {
      targetName = nullableName
    }
  }

  const typeInfo = context.types.get(targetName)

  if (typeInfo !== null && typeof typeInfo !== 'undefined' && typeInfo.kind === 'object') {
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
    valueType: resolvedValueType(declared, lowerNodeValueTypeOrUnknown(field)),
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
  if (name === null || typeof name === 'undefined') {
    return unresolvedType()
  }

  if (isNullableTypeName(name)) {
    const nullableTypeName = nullableTypeNameFromKnownTypeName(name)
    const inner = resolveWeakTargetShapeTypeName(nullableTypeName, context)

    return nullableResolvedType(inner)
  }

  const unionTypeNames = unionTypeNamesFromTypeName(name)

  if (unionTypeNames !== null && typeof unionTypeNames !== 'undefined') {
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

  if ((mapTypeNames === null || typeof mapTypeNames === 'undefined') && name.startsWith('map<') && name.endsWith('>')) {
    isMalformedMapTypeName = true
  }

  if (name === 'map' || (mapTypeNames !== null && typeof mapTypeNames !== 'undefined') || isMalformedMapTypeName) {
    let keyType: LowerResolvedType | null = null
    let valueType: LowerResolvedType | null = null

    if (mapTypeNames !== null && typeof mapTypeNames !== 'undefined') {
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

  if (name === 'ValueType') {
    return namedResolvedType('string')
  }

  if (isBuiltinValueType(name)) {
    return namedResolvedType(name)
  }

  const typeInfo = context.types.get(name)

  if (
    (typeInfo !== null && typeof typeInfo !== 'undefined' && typeInfo.kind === 'object') ||
    context.classNames.has(name)
  ) {
    return namedResolvedType('object')
  }

  return resolveDeclaredType(name, context)
}

function collectTypes(ast: ProgramNode): Map<string, LowerTypeNode> {
  const types = new Map()

  for (const item of ast.body) {
    if (item.type !== 'TypeAliasDeclaration') {
      continue
    }

    const valueType = item.valueType as LowerTypeNode

    if (valueType.kind === 'object') {
      types.set(item.name, collectObjectType(valueType))
    } else if (valueType.kind === 'function') {
      types.set(item.name, collectFunctionType(valueType))
    } else if (valueType.kind === 'alias') {
      types.set(item.name, {
        kind: 'alias',
        valueType: valueType.valueType
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

  if (fields === null || typeof fields === 'undefined') {
    return collected
  }

  for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex = fieldIndex + 1) {
    const field = fields[fieldIndex]
    const declaredType = fieldDeclaredType(field)
    let valueType = lowerNodeValueTypeOrUnknown(field)

    if (declaredType !== null && typeof declaredType !== 'undefined') {
      valueType = declaredType
    }

    collected.push({
      name: field.name,
      optional: field.optional === true,
      readonly: field.readonly,
      ownership: ownershipOrStrong(field.ownership),
      weakLoc: nullableNode(field.weakLoc),
      functionType: nullableNode(field.functionType),
      declaredType,
      valueType,
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

  if (params === null || typeof params === 'undefined') {
    return collected
  }

  for (let paramIndex = 0; paramIndex < params.length; paramIndex = paramIndex + 1) {
    const param = params[paramIndex]
    const declaredType = fieldDeclaredType(param)
    const collectedParam: LowerTypeNode = {
      name: param.name,
      optional: param.optional === true,
      declaredType,
      valueType: lowerNodeValueTypeOrUnknown(param),
      nullable: param.nullable,
      arrayElementType: param.arrayElementType,
      arrayElementDeclaredType: param.arrayElementDeclaredType,
      arrayElementFunctionType: nullableNode(param.arrayElementFunctionType),
      mapKeyType: param.mapKeyType,
      mapValueType: param.mapValueType,
      promiseValueType: nullableString(param.promiseValueType),
      setElementType: param.setElementType,
      shape: nullableNode(param.shape),
      functionType: nullableNode(param.functionType),
      loc: param.loc
    }

    if (param.defaultValue !== null && typeof param.defaultValue !== 'undefined') {
      collectedParam.defaultValue = param.defaultValue
    }

    collected.push(collectedParam)
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

function anyNodeResolvedType(): LowerResolvedType {
  const resolved = namedResolvedType('object')
  resolved.shape = {
    kind: 'object',
    builtin: 'compiler.AnyNode',
    dynamic: true,
    fields: []
  }

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

  if (valueType === null || typeof valueType === 'undefined' || valueType === 'unknown') {
    return unresolvedType()
  }

  const resolved = namedResolvedType(valueType)
  resolved.nullable = resolvedTypeListHasNullable(resolvedTypes)

  if (valueType === 'array') {
    resolved.arrayElementType = commonResolvedString(resolvedTypes, 'arrayElementType')
    resolved.arrayElementDeclaredType = commonResolvedString(resolvedTypes, 'arrayElementDeclaredType')
    resolved.arrayElementFunctionType = commonResolvedFunctionType(resolvedTypes, 'arrayElementFunctionType')
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

  if (first === null || typeof first === 'undefined') {
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

  if (first === null || typeof first === 'undefined') {
    return null
  }

  for (let index = 1; index < values.length; index = index + 1) {
    const value = lowerResolvedStringValue(values[index], key)

    if (value === null || typeof value === 'undefined' || value !== first) {
      return null
    }
  }

  return first
}

function commonResolvedFunctionType(values: LowerResolvedType[], key: 'arrayElementFunctionType'): LowerTypeNode | null {
  const first = lowerResolvedFunctionTypeValue(values[0], key)

  if (first === null || typeof first === 'undefined') {
    return null
  }

  for (let index = 1; index < values.length; index = index + 1) {
    const value = lowerResolvedFunctionTypeValue(values[index], key)

    if (value === null || typeof value === 'undefined' || value !== first) {
      return null
    }
  }

  return first
}

function lowerResolvedFunctionTypeValue(
  value: LowerResolvedType,
  key: 'arrayElementFunctionType'
): LowerTypeNode | null {
  if (key === 'arrayElementFunctionType') {
    return nullableNode(value.arrayElementFunctionType)
  }

  return null
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
    if (value.promiseValueType !== null && typeof value.promiseValueType !== 'undefined') {
      return value.promiseValueType
    }

    return null
  }

  return value.setElementType
}

function arrayResolvedType(
  elementType: LowerResolvedType | null,
  elementDeclaredType: string | null
): LowerResolvedType {
  const resolved = namedResolvedType('array')
  resolved.arrayElementType = resolvedValueType(elementType, 'unknown')
  resolved.arrayElementDeclaredType = nullableString(elementDeclaredType)
  resolved.arrayElementFunctionType = nullableNode(elementType?.functionType)

  return resolved
}

function mapResolvedType(keyType: LowerResolvedType | null, valueType: LowerResolvedType | null): LowerResolvedType {
  const resolved = namedResolvedType('map')
  resolved.mapKeyType = resolvedValueType(keyType, 'unknown')
  resolved.mapValueType = resolvedValueType(valueType, 'unknown')
  if (valueType !== null && typeof valueType !== 'undefined') {
    resolved.mapValueShape = nullableNode(valueType.shape)
  }

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
  if (valueType !== null && typeof valueType !== 'undefined') {
    resolved.shape = nullableNode(valueType.shape)
  }

  return resolved
}

function cloneResolvedType(source: LowerResolvedType): LowerResolvedType {
  const resolved: LowerResolvedType = {
    valueType: source.valueType,
    nullable: source.nullable,
    libraryRuntimeRequirements: copyStringArray(source.libraryRuntimeRequirements),
    arrayElementType: source.arrayElementType,
    arrayElementDeclaredType: source.arrayElementDeclaredType,
    arrayElementFunctionType: nullableNode(source.arrayElementFunctionType),
    mapKeyType: source.mapKeyType,
    mapValueType: source.mapValueType,
    mapValueShape: nullableNode(source.mapValueShape),
    promiseValueType: nullableString(source.promiseValueType),
    setElementType: source.setElementType,
    shape: nullableNode(source.shape),
    functionType: nullableNode(source.functionType)
  }

  if (source.returnShape !== null && typeof source.returnShape !== 'undefined') {
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
    arrayElementFunctionType: null,
    mapKeyType: null,
    mapValueType: null,
    mapValueShape: null,
    promiseValueType: null,
    setElementType: null,
    shape: null,
    functionType: null
  }
}

function resolvedValueType(resolved: LowerResolvedType | null, fallback: string): string {
  if (resolved === null || typeof resolved === 'undefined') {
    return fallback
  }

  const valueType = nullableString(resolved.valueType)

  if (valueType !== null && typeof valueType !== 'undefined') {
    return valueType
  }

  return fallback
}

function resolvedFunctionType(
  primary: LowerTypeNode | null | undefined,
  fallback: LowerTypeNode | null | undefined
): LowerTypeNode | null {
  if (primary !== null && typeof primary !== 'undefined') {
    return primary
  }

  if (fallback !== null && typeof fallback !== 'undefined') {
    return fallback
  }

  return null
}

function fieldDeclaredType(field: LowerTypeNode): string | null {
  if (field.declaredType !== null && typeof field.declaredType !== 'undefined') {
    return field.declaredType
  }

  if (field.valueType !== null && typeof field.valueType !== 'undefined') {
    return field.valueType
  }

  return null
}

function lowerNodeValueTypeOrUnknown(node: LowerTypeNode): string {
  if (node.valueType !== null && typeof node.valueType !== 'undefined') {
    return node.valueType
  }

  return 'unknown'
}

function ownershipOrStrong(value: string | null | undefined): string {
  if (value !== null && typeof value !== 'undefined' && value.length > 0) {
    return value
  }

  return 'strong'
}

function nullableString(value: string | null | undefined): string | null {
  if (value !== null && typeof value !== 'undefined' && value.length > 0) {
    return value
  }

  return null
}

function nullableNode(value: LowerTypeNode | null | undefined): LowerTypeNode | null {
  if (value !== null && typeof value !== 'undefined') {
    return value
  }

  return null
}

function copyStringArray(values: string[] | null | undefined): string[] {
  const copy: string[] = []

  if (values === null || typeof values === 'undefined') {
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

  if (right === null || typeof right === 'undefined') {
    return fields
  }

  for (let fieldIndex = 0; fieldIndex < right.length; fieldIndex = fieldIndex + 1) {
    const field = right[fieldIndex]
    let existingIndex = -1

    for (let index = 0; index < fields.length; index = index + 1) {
      if (fields[index].name === field.name) {
        existingIndex = index
        break
      }
    }

    if (existingIndex >= 0) {
      fields[existingIndex] = field
    } else {
      fields.push(field)
    }
  }

  return fields
}
