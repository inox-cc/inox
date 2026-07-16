import {
  arrayElementTypeNameFromKnownTypeName,
  genericTypeApplicationFromTypeName,
  isArrayTypeName,
  isBuiltinValueType,
  isNullableTypeName,
  isPromiseTypeName,
  nullableTypeNameFromKnownTypeName,
  promiseValueTypeNameFromKnownTypeName,
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
  typeSubstitutions: Map<string, LowerResolvedType>
}

export type LowerResolvedType = {
  valueType: string | null
  nullable: boolean
  libraryRuntimeRequirements?: string[]
  arrayElementType: string | null
  arrayElementDeclaredType: string | null
  arrayElementFunctionType?: LowerTypeNode | null
  promiseValueType?: string | null
  returnShape?: LowerTypeNode | null
  shape: LowerTypeNode | null
  functionType: LowerTypeNode | null
}

type LowerObjectShapeBases = {
  builtin: string | null
  dynamic: boolean
  fields: LowerTypeNode[]
}

type LowerResolvedStringKey =
  | 'arrayElementType'
  | 'arrayElementDeclaredType'
  | 'promiseValueType'

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
    resolvingTypes: new Set(),
    typeSubstitutions: new Map()
  }
}

export function resolveDeclaredType(name: string | null | undefined, context: LowerContext): LowerResolvedType {
  if (name === null || typeof name === 'undefined' || name.length === 0) {
    return unresolvedType()
  }

  const substitution = context.typeSubstitutions.get(name)

  if (substitution !== null && typeof substitution !== 'undefined') {
    return cloneResolvedType(substitution)
  }

  const genericApplication = genericTypeApplicationFromTypeName(name)

  if (genericApplication !== null) {
    if (genericApplication.name === 'NonNullable' && genericApplication.args.length === 1) {
      const resolved = resolveDeclaredType(genericApplication.args[0], context)

      resolved.nullable = false
      return resolved
    }

    const definition = context.types.get(genericApplication.name)

    if (definition !== null && typeof definition !== 'undefined' && (definition.typeParameters ?? []).length > 0) {
      return resolveGenericDeclaredType(name, definition, genericApplication.args, context)
    }
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
      libraryCValueAdapter: nativeType.cValueAdapter ?? null,
      libraryTypeId: nativeType.typeId,
      libraryCppType: nativeType.cppType
    }
    resolved.libraryRuntimeRequirements = nativeType.runtimeRequirements

    return resolved
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

function resolveGenericDeclaredType(
  applicationName: string,
  definition: LowerTypeNode,
  argumentNames: string[],
  context: LowerContext
): LowerResolvedType {
  const typeParameters: LowerTypeNode[] = definition.typeParameters ?? []

  if (typeParameters.length !== argumentNames.length) {
    return unresolvedType()
  }

  const cached = context.resolvedTypes.get(applicationName)

  if (cached !== null && typeof cached !== 'undefined') {
    return cloneResolvedType(cached)
  }

  if (context.resolvingTypes.has(applicationName)) {
    if (definition.kind === 'object') {
      return namedResolvedType('object')
    }

    if (definition.kind === 'function') {
      return namedResolvedType('function')
    }

    return unresolvedType()
  }

  const substitutions = new Map(context.typeSubstitutions)

  for (let index = 0; index < typeParameters.length; index = index + 1) {
    substitutions.set(typeParameters[index].name, resolveDeclaredType(argumentNames[index], context))
  }

  const child: LowerContext = {
    ...context,
    typeSubstitutions: substitutions
  }

  context.resolvingTypes.add(applicationName)

  try {
    let resolved = unresolvedType()

    if (definition.kind === 'object') {
      resolved = namedResolvedType('object')
      resolved.shape = resolveObjectShape(definition, child)
    } else if (definition.kind === 'alias') {
      resolved = resolveDeclaredType(definition.valueType, child)
    } else if (definition.kind === 'function') {
      resolved = resolveFunctionType(definition, child)
    }

    context.resolvedTypes.set(applicationName, cloneResolvedType(resolved))
    return resolved
  } finally {
    context.resolvingTypes.delete(applicationName)
  }
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
    returnTypeRef: nullableNode(typeInfo.returnTypeRef),
    returnNullable: returnType.nullable,
    returnArrayElementType: returnType.arrayElementType,
    returnArrayElementDeclaredType: returnType.arrayElementDeclaredType,
    returnPromiseValueType: nullableString(returnType.promiseValueType),
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
    rest: param.rest === true,
    declaredType,
    typeRef: nullableNode(param.typeRef),
    valueType: resolvedValueType(declared, lowerNodeValueTypeOrUnknown(param)),
    nullable:
      declared.nullable ||
      (param.optional === true && (param.defaultValue === null || typeof param.defaultValue === 'undefined')),
    arrayElementType: declared.arrayElementType,
    arrayElementDeclaredType: declared.arrayElementDeclaredType,
    arrayElementFunctionType: nullableNode(declared.arrayElementFunctionType),
    promiseValueType: nullableString(declared.promiseValueType),
    shape: declared.shape ?? nullableNode(param.shape),
    functionType: declared.functionType,
    loc: param.loc
  }
}

export function resolveObjectShape(shape: LowerTypeNode, context: LowerContext): LowerTypeNode {
  const bases = resolveObjectShapeBases(shape, context)
  const fields = concatFields(bases.fields, shape.fields)
  const resolvedFields: LowerTypeNode[] = []
  let builtin = bases.builtin

  if (shape.builtin !== null && typeof shape.builtin !== 'undefined') {
    builtin = shape.builtin
  }

  const optionalFieldsAreNullable = builtin !== 'compiler.AnyNode'

  for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex = fieldIndex + 1) {
    const field = fields[fieldIndex]
    resolvedFields.push(resolveObjectShapeField(field, fields, context, optionalFieldsAreNullable))
  }

  return {
    kind: 'object',
    builtin,
    baseTypes: copyStringArray(shape.baseTypes),
    dynamic: shape.dynamic === true || bases.dynamic,
    fields: resolvedFields,
    libraryCValueAdapter: nullableString(shape.libraryCValueAdapter),
    libraryTypeId: nullableString(shape.libraryTypeId),
    libraryCppType: nullableString(shape.libraryCppType)
  }
}

function resolveObjectShapeField(
  field: LowerTypeNode,
  fields: LowerTypeNode[],
  context: LowerContext,
  optionalFieldsAreNullable: boolean = true
): LowerTypeNode {
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
    declaredType: optionalFieldsAreNullable ? fieldDeclaredType(field) : nullableString(field.declaredType),
    typeRef: nullableNode(field.typeRef),
    valueType: resolvedValueType(declared, lowerNodeValueTypeOrUnknown(field)),
    nullable:
      declared.nullable ||
      field.nullable === true ||
      weakField ||
      (optionalFieldsAreNullable && field.optional === true),
    arrayElementType: declared.arrayElementType,
    arrayElementDeclaredType: declared.arrayElementDeclaredType,
    arrayElementFunctionType: nullableNode(declared.arrayElementFunctionType),
    promiseValueType: nullableString(declared.promiseValueType),
    shape: declared.shape ?? nullableNode(field.shape),
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
  let builtin: string | null = null
  let dynamic = false
  const baseTypes = copyStringArray(shape.baseTypes)

  for (const name of baseTypes) {
    const base = resolveObjectShapeBase(name, context)

    if (base === null || typeof base === 'undefined') {
      continue
    }

    for (const field of base.fields) {
      fields.push(hydrateObjectShapeField(field, context))
    }

    dynamic = dynamic || base.dynamic === true

    if (base.builtin !== null && typeof base.builtin !== 'undefined') {
      builtin = base.builtin
    }
  }

  return {
    builtin,
    dynamic,
    fields
  }
}

function resolveObjectShapeBase(name: string, context: LowerContext): LowerTypeNode | null {
  const seen: Set<string> = new Set()
  let currentName = name

  while (!seen.has(currentName)) {
    seen.add(currentName)

    if (currentName === 'AnyNode') {
      return anyNodeResolvedType().shape
    }

    const current = context.types.get(currentName)

    if (current === null || typeof current === 'undefined') {
      return null
    }

    if (current.kind === 'object') {
      return resolveObjectShape(current, context)
    }

    if (current.kind !== 'alias') {
      return null
    }

    const nextName = current.valueType

    if (nextName === null || typeof nextName === 'undefined') {
      return null
    }

    currentName = nextName
  }

  return null
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
        typeRef: nullableNode(field.typeRef),
        valueType: field.valueType,
        nullable: field.nullable,
        arrayElementType: field.arrayElementType,
        arrayElementDeclaredType: field.arrayElementDeclaredType,
        arrayElementFunctionType: nullableNode(field.arrayElementFunctionType),
        promiseValueType: nullableString(field.promiseValueType),
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
      typeRef: nullableNode(field.typeRef),
      valueType: field.valueType,
      nullable: field.nullable,
      arrayElementType: field.arrayElementType,
      arrayElementDeclaredType: field.arrayElementDeclaredType,
      arrayElementFunctionType: nullableNode(field.arrayElementFunctionType),
      promiseValueType: nullableString(field.promiseValueType),
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
    returnTypeRef: nullableNode(functionType.returnTypeRef),
    returnNullable: functionType.returnNullable,
    returnArrayElementType: functionType.returnArrayElementType,
    returnArrayElementDeclaredType: functionType.returnArrayElementDeclaredType,
    returnPromiseValueType: nullableString(functionType.returnPromiseValueType),
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
    rest: param.rest === true,
    declaredType: fieldDeclaredType(param),
    typeRef: nullableNode(param.typeRef),
    valueType: lowerNodeValueTypeOrUnknown(param),
    nullable: param.nullable,
    arrayElementType: param.arrayElementType,
    arrayElementDeclaredType: param.arrayElementDeclaredType,
    arrayElementFunctionType: nullableNode(param.arrayElementFunctionType),
    promiseValueType: nullableString(param.promiseValueType),
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
  let builtin = bases.builtin

  if (shape.builtin !== null && typeof shape.builtin !== 'undefined') {
    builtin = shape.builtin
  }

  for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex = fieldIndex + 1) {
    const field = fields[fieldIndex]
    resolvedFields.push(resolveWeakTargetObjectShapeField(field, context))
  }

  return {
    kind: 'object',
    builtin,
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
    promiseValueType: nullableString(declared.promiseValueType),
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

    let collected: LowerTypeNode | null = null

    if (valueType.kind === 'object') {
      collected = collectObjectType(valueType)
    } else if (valueType.kind === 'function') {
      collected = collectFunctionType(valueType)
    } else if (valueType.kind === 'alias') {
      collected = {
        kind: 'alias',
        valueType: valueType.valueType
      }
    }

    if (collected !== null) {
      const typeParameters: LowerTypeNode[] = item.typeParameters ?? []

      if (typeParameters.length > 0) {
        collected.typeParameters = typeParameters
      }

      types.set(item.name, collected)
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

    collected.push({
      name: field.name,
      optional: field.optional === true,
      readonly: field.readonly,
      ownership: ownershipOrStrong(field.ownership),
      weakLoc: nullableNode(field.weakLoc),
      functionType: nullableNode(field.functionType),
      declaredType,
      typeRef: nullableNode(field.typeRef),
      valueType: lowerNodeValueTypeOrUnknown(field),
      nullable: field.nullable === true,
      arrayElementType: nullableString(field.arrayElementType),
      arrayElementDeclaredType: nullableString(field.arrayElementDeclaredType),
      arrayElementFunctionType: nullableNode(field.arrayElementFunctionType),
      promiseValueType: nullableString(field.promiseValueType),
      shape: nullableNode(field.shape),
      loc: field.loc
    })
  }

  return collected
}

function collectFunctionType(valueType: LowerTypeNode): LowerTypeNode {
  return {
    kind: 'function',
    params: collectFunctionParams(valueType.params),
    returnType: valueType.returnType,
    returnTypeRef: nullableNode(valueType.returnTypeRef)
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
      rest: param.rest === true,
      declaredType,
      typeRef: nullableNode(param.typeRef),
      valueType: lowerNodeValueTypeOrUnknown(param),
      nullable: param.nullable,
      arrayElementType: param.arrayElementType,
      arrayElementDeclaredType: param.arrayElementDeclaredType,
      arrayElementFunctionType: nullableNode(param.arrayElementFunctionType),
      promiseValueType: nullableString(param.promiseValueType),
      shape: nullableNode(param.shape),
      functionType: nullableNode(param.functionType),
      defaultValue: null,
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
  } else if (valueType === 'promise') {
    resolved.promiseValueType = commonResolvedString(resolvedTypes, 'promiseValueType')
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

function commonResolvedFunctionType(
  values: LowerResolvedType[],
  key: 'arrayElementFunctionType'
): LowerTypeNode | null {
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

  if (key === 'promiseValueType') {
    if (value.promiseValueType !== null && typeof value.promiseValueType !== 'undefined') {
      return value.promiseValueType
    }

    return null
  }

  return null
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
    promiseValueType: nullableString(source.promiseValueType),
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
    promiseValueType: null,
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
