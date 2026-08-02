import {
  arrayElementTypeNameFromKnownTypeName,
  functionTypeNamesFromTypeName,
  genericTypeApplicationFromTypeName,
  inlineObjectTypeNamesFromTypeName,
  isArrayTypeName,
  isBuiltinValueType,
  isNullableTypeName,
  nullableTypeNameFromKnownTypeName,
  typeQueryTargetNameFromTypeName,
  unionTypeNamesFromTypeName
} from '../type-names.ts'
import type { InlineObjectTypeNames } from '../type-names.ts'
import type { AnyNode, ProgramNode } from '../types.ts'
import {
  compilerLibraryNativeTypeForIntrinsic,
  compilerLibraryNativeTypeForName,
  compilerLibraryTypeOperatorForName,
  resolveCompilerLibrarySet
} from '../extensions/library-set.ts'
import { instantiateNativeTypeRef } from '../extensions/type-ref-substitution.ts'
import { commonTypeRef, typeRefCompatibilityMetadata } from '../extensions/type-ref-compatibility.ts'
import type { CompilerLibrarySet, CorePrimitiveType, ObjectTypeRefField, TypeRef } from '../extensions/types.ts'

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
  runtimeTypeAlternatives: LowerRuntimeTypeAlternative[] | null
  asyncResultValueType?: string | null
  returnShape?: LowerTypeNode | null
  shape: LowerTypeNode | null
  functionType: LowerTypeNode | null
  typeRef: TypeRef | null
}

export type LowerRuntimeTypeAlternative = {
  nullable: boolean
  shape: LowerTypeNode | null
  typeRef: TypeRef | null
  valueType: string
}

type LowerObjectShapeBases = {
  builtin: string | null
  dynamic: boolean
  fields: LowerTypeNode[]
  functionCompanions: boolean
}

type LowerResolvedStringKey = 'asyncResultValueType'

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
    variables: collectFunctionVariables(ast),
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

  const typeQueryTarget = typeQueryTargetNameFromTypeName(name)

  if (typeQueryTarget !== null) {
    const value = context.variables.get(typeQueryTarget)

    if (value !== null && typeof value !== 'undefined' && value.functionType !== null) {
      return resolveFunctionType(value.functionType, context)
    }

    return unresolvedType()
  }

  const functionTypeNames = functionTypeNamesFromTypeName(name)

  if (functionTypeNames !== null) {
    const params: LowerTypeNode[] = []

    for (let index = 0; index < functionTypeNames.params.length; index = index + 1) {
      params.push({ name: `arg${index}`, declaredType: functionTypeNames.params[index] })
    }

    return resolveFunctionType(
      {
        kind: 'function',
        params,
        declaredReturnType: functionTypeNames.result,
        returnType: functionTypeNames.result
      },
      context
    )
  }

  const inlineObject = inlineObjectTypeNamesFromTypeName(name)

  if (inlineObject !== null) {
    return resolveInlineObjectType(inlineObject, context)
  }

  const genericApplication = genericTypeApplicationFromTypeName(name)

  if (genericApplication !== null) {
    const typeOperator = compilerLibraryTypeOperatorForName(context.libraries, genericApplication.name)

    if (typeOperator !== null && genericApplication.args.length === 1) {
      const operand = resolveDeclaredType(genericApplication.args[0], context)
      const operandTypeRef = operand.typeRef

      if (typeOperator.kind === 'function-result' && operandTypeRef !== null && operandTypeRef.kind === 'function') {
        return resolvedTypeFromTypeRef(operandTypeRef.result, context)
      }

      return unresolvedType()
    }

    if (genericApplication.name === 'NonNullable' && genericApplication.args.length === 1) {
      const resolved = resolveDeclaredType(genericApplication.args[0], context)

      resolved.nullable = false
      return resolved
    }

    const genericNativeType = compilerLibraryNativeTypeForName(context.libraries, genericApplication.name)
    const nativeTypeParameters = genericNativeType?.typeParameters

    if (
      genericNativeType !== null &&
      nativeTypeParameters !== null &&
      typeof nativeTypeParameters !== 'undefined' &&
      nativeTypeParameters.length === genericApplication.args.length
    ) {
      const typeArguments: TypeRef[] = []

      for (let index = 0; index < genericApplication.args.length; index = index + 1) {
        const argumentName = genericApplication.args[index]
        typeArguments.push(typeRefForResolvedType(resolveDeclaredType(argumentName, context), argumentName))
      }

      const typeRef = instantiateNativeTypeRef(genericNativeType, typeArguments)
      const metadata = typeRefCompatibilityMetadata(typeRef, context.libraries, { line: 1, column: 1 })
      const resolved = namedResolvedType(metadata.valueType)

      resolved.typeRef = typeRef
      resolved.shape = metadata.shape
      resolved.asyncResultValueType = metadata.asyncResultValueType
      resolved.libraryRuntimeRequirements = genericNativeType.runtimeRequirements
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
    return arrayResolvedType(unknownTypeRef(), context)
  }

  if (isArrayTypeName(name)) {
    const arrayElementTypeName = arrayElementTypeNameFromKnownTypeName(name)
    const elementType = resolveDeclaredType(arrayElementTypeName, context)

    return arrayResolvedType(typeRefForResolvedType(elementType, arrayElementTypeName), context)
  }

  const nativeType = compilerLibraryNativeTypeForName(context.libraries, name)

  if (nativeType !== null) {
    const resolved = namedResolvedType(nativeType.valueType)
    resolved.typeRef = instantiateNativeTypeRef(nativeType, [])
    resolved.shape = {
      kind: 'object',
      baseTypes: nativeType.baseTypeIds,
      dynamic: false,
      fields: [],
      libraryCValueAdapter: nativeType.cValueAdapter ?? null,
      libraryTypeId: nativeType.typeId,
      libraryCppType: nativeType.cppType
    }
    resolved.libraryRuntimeRequirements = nativeType.runtimeRequirements

    return resolved
  }

  if (name === 'ValueType') {
    return primitiveResolvedType('string')
  }

  if (isBuiltinValueType(name)) {
    return primitiveResolvedType(name)
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
    if (typeInfo !== null && typeof typeInfo !== 'undefined' && typeInfo.kind === 'object') {
      return shallowRecursiveObjectType(typeInfo)
    }

    if (context.classNames.has(name)) {
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
      return shallowRecursiveObjectType(definition)
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

function shallowRecursiveObjectType(typeInfo: LowerTypeNode): LowerResolvedType {
  const resolved = namedResolvedType('object')

  if (
    typeInfo.functionCompanions === true ||
    objectShapeFieldsRequireFunctionCompanions(typeInfo.fields, new Set<LowerTypeNode>())
  ) {
    resolved.shape = {
      kind: 'object',
      baseTypes: [],
      dynamic: false,
      fields: [],
      functionCompanions: true
    }
  }

  return resolved
}

function objectShapeFieldsRequireFunctionCompanions(
  fields: LowerTypeNode[] | null | undefined,
  seen: Set<LowerTypeNode>
): boolean {
  if (fields === null || typeof fields === 'undefined') {
    return false
  }

  for (const field of fields) {
    if (field.valueType === 'function' || field.functionType !== null && typeof field.functionType !== 'undefined') {
      return true
    }

    const shape = nullableNode(field.shape)

    if (shape === null || seen.has(shape)) {
      continue
    }

    if (shape.functionCompanions === true) {
      return true
    }

    seen.add(shape)

    if (objectShapeFieldsRequireFunctionCompanions(shape.fields, seen)) {
      return true
    }
  }

  return false
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
    declaredReturnType: nullableString(typeInfo.declaredReturnType),
    kind: 'function',
    params,
    returnType: resolvedValueType(returnType, returnTypeName),
    returnTypeRef: nullableNode(typeInfo.returnTypeRef) ?? returnType.typeRef,
    returnRuntimeTypeAlternatives: returnType.runtimeTypeAlternatives,
    returnNullable: returnType.nullable,
    returnAsyncResultValueType: nullableString(returnType.asyncResultValueType),
    returnShape: returnType.shape ?? nullableNode(typeInfo.returnShape)
  }
  const paramTypeRefs: TypeRef[] = []

  for (let index = 0; index < params.length; index = index + 1) {
    const declaredType = fieldDeclaredType(params[index]) ?? 'unknown'
    const parameterType = resolveDeclaredType(declaredType, context)
    const parameterTypeRef: TypeRef | null = params[index].typeRef ?? null

    paramTypeRefs.push(parameterTypeRef ?? typeRefForResolvedType(parameterType, declaredType))
  }

  const explicitReturnTypeRef: TypeRef | null = typeInfo.returnTypeRef ?? null

  resolved.typeRef = {
    kind: 'function',
    params: paramTypeRefs,
    result: explicitReturnTypeRef ?? typeRefForResolvedType(returnType, returnTypeName),
    nullable: false,
    ownership: 'value',
    traits: []
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
    typeRef: nullableNode(param.typeRef) ?? declared.typeRef,
    runtimeTypeAlternatives: declared.runtimeTypeAlternatives,
    valueType: resolvedValueType(declared, unresolvedFunctionParamValueType(param, declaredType)),
    nullable:
      declared.nullable ||
      (param.optional === true && (param.defaultValue === null || typeof param.defaultValue === 'undefined')),
    asyncResultValueType: nullableString(declared.asyncResultValueType),
    shape: declared.shape ?? nullableNode(param.shape),
    functionType: declared.functionType,
    loc: param.loc
  }
}

function resolveInlineObjectType(inlineObject: InlineObjectTypeNames, context: LowerContext): LowerResolvedType {
  const fields: LowerTypeNode[] = []

  for (let index = 0; index < inlineObject.fields.length; index = index + 1) {
    const inlineField = inlineObject.fields[index]
    const declared = resolveDeclaredType(inlineField.typeName, context)

    fields.push({
      name: inlineField.name,
      optional: inlineField.optional,
      readonly: false,
      ownership: 'strong',
      declaredType: inlineField.typeName,
      typeRef: declared.typeRef,
      valueType: declared.valueType ?? 'unknown',
      nullable: declared.nullable || inlineField.optional,
      asyncResultValueType: nullableString(declared.asyncResultValueType),
      shape: declared.shape,
      functionType: declared.functionType
    })
  }

  let dynamicField: LowerTypeNode | null = null

  if (inlineObject.indexSignature !== null) {
    const valueTypeName = inlineObject.indexSignature.valueTypeName
    const declared = resolveDeclaredType(valueTypeName, context)

    dynamicField = {
      name: '',
      optional: false,
      readonly: false,
      ownership: 'strong',
      declaredType: valueTypeName,
      typeRef: declared.typeRef,
      valueType: declared.valueType ?? 'unknown',
      nullable: declared.nullable,
      asyncResultValueType: nullableString(declared.asyncResultValueType),
      shape: declared.shape,
      functionType: declared.functionType
    }
  }

  const resolved = namedResolvedType('object')
  resolved.shape = {
    kind: 'object',
    baseTypes: [],
    dynamic: dynamicField !== null,
    dynamicField,
    fields
  }
  const typeRefFields: ObjectTypeRefField[] = []

  for (let index = 0; index < fields.length; index = index + 1) {
    const field = fields[index]
    const typeRefField: ObjectTypeRefField = {
      name: field.name,
      typeRef: field.typeRef ?? unknownTypeRef(),
      readonly: field.readonly === true
    }

    if (field.optional === true) {
      typeRefField.optional = true
    }

    typeRefFields.push(typeRefField)
  }

  resolved.typeRef = {
    kind: 'object',
    fields: typeRefFields,
    dynamic: dynamicField !== null,
    dynamicField: dynamicField?.typeRef ?? null,
    nullable: false,
    ownership: 'value',
    traits: []
  }
  return resolved
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
    baseTypes: resolvedObjectShapeBaseTypes(shape),
    dynamic: shape.dynamic === true || bases.dynamic,
    fields: resolvedFields,
    functionCompanions:
      shape.functionCompanions === true ||
      bases.functionCompanions ||
      objectShapeFieldsRequireFunctionCompanions(resolvedFields, new Set<LowerTypeNode>()),
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
    weakTypeValidated: weakField || field.weakTypeValidated === true,
    loc: field.loc,
    declaredType: optionalFieldsAreNullable ? fieldDeclaredType(field) : nullableString(field.declaredType),
    typeRef: nullableNode(field.typeRef) ?? declared.typeRef,
    valueType: resolvedValueType(declared, lowerNodeValueTypeOrUnknown(field)),
    nullable:
      declared.nullable ||
      field.nullable === true ||
      weakField ||
      (optionalFieldsAreNullable && field.optional === true),
    asyncResultValueType: nullableString(declared.asyncResultValueType),
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
  let functionCompanions = false
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
    functionCompanions = functionCompanions || base.functionCompanions === true

    if (base.builtin !== null && typeof base.builtin !== 'undefined') {
      builtin = base.builtin
    }
  }

  return {
    builtin,
    dynamic,
    fields,
    functionCompanions
  }
}

function resolveObjectShapeBase(name: string, context: LowerContext): LowerTypeNode | null {
  const seen: Set<string> = new Set()
  let currentName = name

  while (!seen.has(currentName)) {
    seen.add(currentName)

    if (genericTypeApplicationFromTypeName(currentName) !== null) {
      const resolved = resolveDeclaredType(currentName, context)

      if (resolved.valueType === 'object' && resolved.shape !== null) {
        return resolved.shape
      }

      return null
    }

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
    fields,
    functionCompanions: shape.functionCompanions === true
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
        asyncResultValueType: nullableString(field.asyncResultValueType),
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
      asyncResultValueType: nullableString(field.asyncResultValueType),
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
    returnRuntimeTypeAlternatives: nullableNodeArray(functionType.returnRuntimeTypeAlternatives),
    returnNullable: functionType.returnNullable,
    returnAsyncResultValueType: nullableString(functionType.returnAsyncResultValueType),
    returnShape: nullableNode(functionType.returnShape),
    loc: functionType.loc
  }
}

function hydrateFunctionParam(param: LowerTypeNode, context: LowerContext): LowerTypeNode {
  let shape = nullableNode(param.shape)
  const declaredType = fieldDeclaredType(param)

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
    declaredType,
    typeRef: nullableNode(param.typeRef),
    runtimeTypeAlternatives: nullableNodeArray(param.runtimeTypeAlternatives),
    valueType: unresolvedFunctionParamValueType(param, declaredType),
    nullable: param.nullable,
    asyncResultValueType: nullableString(param.asyncResultValueType),
    shape,
    functionType: nullableNode(param.functionType),
    loc: param.loc
  }
}

function unresolvedFunctionParamValueType(
  param: LowerTypeNode,
  declaredType: string | null | undefined
): string {
  const valueType = lowerNodeValueTypeOrUnknown(param)

  if (
    declaredType !== null &&
    typeof declaredType !== 'undefined' &&
    valueType === declaredType &&
    !isBuiltinValueType(valueType)
  ) {
    return 'unknown'
  }

  return valueType
}

function resolveFieldDeclaredType(field: LowerTypeNode, context: LowerContext): LowerResolvedType {
  if (field.ownership === 'weak' || field.weakTypeValidated === true) {
    return resolveWeakFieldDeclaredType(field, context)
  }

  if (fieldHasResolvedTypeMetadata(field)) {
    const resolved = namedResolvedType(lowerNodeValueTypeOrUnknown(field))

    resolved.nullable = field.nullable === true
    resolved.asyncResultValueType = nullableString(field.asyncResultValueType)
    resolved.shape = nullableNode(field.shape)
    resolved.functionType = nullableNode(field.functionType)
    return resolved
  }

  return resolveDeclaredType(fieldDeclaredType(field), context)
}

function fieldHasResolvedTypeMetadata(field: LowerTypeNode): boolean {
  const declaredType = field.declaredType
  const valueType = field.valueType

  if (
    typeof declaredType === 'string' &&
    typeof valueType === 'string' &&
    valueType !== declaredType &&
    (field.typeRef === null || typeof field.typeRef === 'undefined')
  ) {
    return false
  }

  return (
    typeof declaredType === 'string' &&
    typeof valueType === 'string' &&
    valueType !== 'unknown' &&
    valueType !== declaredType
  )
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
    resolvedFields.push(resolveWeakTargetObjectShapeField(field, fields, context))
  }

  return {
    kind: 'object',
    builtin,
    baseTypes: resolvedObjectShapeBaseTypes(shape),
    dynamic: shape.dynamic === true || bases.dynamic,
    fields: resolvedFields,
    functionCompanions: shape.functionCompanions === true || bases.functionCompanions
  }
}

function resolvedObjectShapeBaseTypes(shape: LowerTypeNode): string[] {
  const resolved: string[] = []

  for (const name of copyStringArray(shape.baseTypes)) {
    if (genericTypeApplicationFromTypeName(name) === null) {
      resolved.push(name)
    }
  }

  return resolved
}

function resolveWeakTargetObjectShapeField(
  field: LowerTypeNode,
  fields: LowerTypeNode[],
  context: LowerContext
): LowerTypeNode {
  const weakField = field.ownership === 'weak' || hasWeakOwnershipMarker(fields, field.name)
  const declared = resolveWeakTargetShapeFieldType(field, context)

  return {
    name: field.name,
    optional: field.optional === true,
    readonly: field.readonly,
    ownership: field.ownership,
    weakLoc: nullableNode(field.weakLoc),
    weakTypeValidated: weakField || field.weakTypeValidated === true,
    loc: field.loc,
    declaredType: fieldDeclaredType(field),
    typeRef: nullableNode(field.typeRef),
    valueType: resolvedValueType(declared, lowerNodeValueTypeOrUnknown(field)),
    nullable: declared.nullable || field.ownership === 'weak' || field.optional === true,
    asyncResultValueType: nullableString(declared.asyncResultValueType),
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
    return arrayResolvedType(unknownTypeRef(), context)
  }

  if (isArrayTypeName(name)) {
    const arrayElementTypeName = arrayElementTypeNameFromKnownTypeName(name)
    const elementType = resolveWeakTargetShapeTypeName(arrayElementTypeName, context)

    return arrayResolvedType(typeRefForResolvedType(elementType, arrayElementTypeName), context)
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

function collectFunctionVariables(ast: ProgramNode): Map<string, LowerTypeNode> {
  const variables: Map<string, LowerTypeNode> = new Map()

  for (let index = 0; index < ast.body.length; index = index + 1) {
    const item = ast.body[index]

    if (item.type === 'FunctionDeclaration') {
      variables.set(item.name, {
        valueType: 'function',
        functionType: {
          kind: 'function',
          params: item.params ?? [],
          declaredReturnType: item.declaredReturnType ?? item.returnType ?? 'unknown',
          returnType: item.returnType ?? item.declaredReturnType ?? 'unknown',
          returnTypeRef: nullableNode(item.returnTypeRef),
          returnNullable: item.returnNullable === true,
          returnAsyncResultValueType: nullableString(item.returnAsyncResultValueType),
          returnShape: nullableNode(item.returnShape)
        }
      })
      continue
    }

    if (item.type === 'VariableDeclaration' && item.valueType === 'function' && item.functionType !== null) {
      variables.set(item.name, item)
    }
  }

  return variables
}

function collectObjectType(valueType: LowerTypeNode): LowerTypeNode {
  return {
    kind: 'object',
    baseTypes: copyStringArray(valueType.baseTypes),
    dynamic: valueType.dynamic === true,
    fields: collectObjectTypeFields(valueType.fields),
    functionCompanions: valueType.functionCompanions === true
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
      asyncResultValueType: nullableString(field.asyncResultValueType),
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
      runtimeTypeAlternatives: nullableNodeArray(param.runtimeTypeAlternatives),
      valueType: lowerNodeValueTypeOrUnknown(param),
      nullable: param.nullable,
      asyncResultValueType: nullableString(param.asyncResultValueType),
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

function primitiveResolvedType(valueType: string): LowerResolvedType {
  const resolved = namedResolvedType(valueType)
  const typeRef = primitiveTypeRef(valueType)

  if (typeRef !== null) {
    resolved.typeRef = typeRef
  }

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

  let valueType = commonResolvedValueType(resolvedTypes)
  const typeRef = commonLowerResolvedTypeRef(resolvedTypes)

  if (valueType === null || typeof valueType === 'undefined') {
    return unresolvedType()
  }

  if (valueType === 'unknown' || (valueType === 'object' && typeRef === null)) {
    valueType = resolvedUnionValueTypeName(resolvedTypes)
  }

  const resolved = namedResolvedType(valueType)
  resolved.nullable = resolvedTypeListHasNullable(resolvedTypes)
  resolved.typeRef = typeRef
  resolved.runtimeTypeAlternatives = runtimeTypeAlternatives(resolvedTypes)

  if (typeRef !== null) {
    resolved.shape = typeRefCompatibilityMetadata(typeRef, context.libraries, { line: 1, column: 1 }).shape
  }

  if (valueType === 'async-result') {
    resolved.asyncResultValueType = commonResolvedString(resolvedTypes, 'asyncResultValueType')
  }

  return resolved
}

function runtimeTypeAlternatives(values: LowerResolvedType[]): LowerRuntimeTypeAlternative[] {
  const alternatives: LowerRuntimeTypeAlternative[] = []

  for (let index = 0; index < values.length; index = index + 1) {
    const value = values[index]

    alternatives.push({
      nullable: value.nullable,
      shape: value.shape,
      typeRef: value.typeRef,
      valueType: value.valueType ?? 'unknown'
    })
  }

  return alternatives
}

function commonLowerResolvedTypeRef(values: LowerResolvedType[]): TypeRef | null {
  if (values.length === 0 || values[0].typeRef === null) {
    return null
  }

  let result: TypeRef | null = values[0].typeRef

  for (let index = 1; index < values.length; index = index + 1) {
    if (values[index].typeRef === null) {
      return null
    }

    result = commonTypeRef(result, values[index].typeRef)

    if (result === null) {
      return null
    }
  }

  return result
}

function resolvedUnionValueTypeName(values: LowerResolvedType[]): string {
  let valueType = 'union<'

  for (let index = 0; index < values.length; index = index + 1) {
    if (index > 0) {
      valueType = valueType + ','
    }

    valueType = valueType + (values[index].valueType ?? 'unknown')
  }

  return valueType + '>'
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
      return 'unknown'
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

function lowerResolvedStringValue(value: LowerResolvedType, key: LowerResolvedStringKey): string | null {
  if (key === 'asyncResultValueType') {
    if (value.asyncResultValueType !== null && typeof value.asyncResultValueType !== 'undefined') {
      return value.asyncResultValueType
    }

    return null
  }

  return null
}

function arrayResolvedType(elementTypeRef: TypeRef, context: LowerContext): LowerResolvedType {
  const resolved = unresolvedType()
  const provider = compilerLibraryNativeTypeForIntrinsic(context.libraries, 'array-literal', 'construct')

  if (provider === null || (provider.typeParameters ?? []).length !== 1) {
    return resolved
  }

  const typeRef = instantiateNativeTypeRef(provider, [elementTypeRef])
  const metadata = typeRefCompatibilityMetadata(typeRef, context.libraries, { line: 1, column: 1 })

  resolved.valueType = metadata.valueType
  resolved.typeRef = typeRef
  resolved.shape = metadata.shape
  resolved.libraryRuntimeRequirements = provider.runtimeRequirements
  return resolved
}

function typeRefForResolvedType(resolved: LowerResolvedType, declaredType: string): TypeRef {
  if (resolved.typeRef !== null) {
    return resolved.typeRef
  }

  return primitiveTypeRef(resolved.valueType ?? declaredType) ?? unknownTypeRef()
}

function resolvedTypeFromTypeRef(typeRef: TypeRef, context: LowerContext): LowerResolvedType {
  if (typeRef.kind === 'parameter') {
    const resolved = unresolvedType()
    resolved.typeRef = typeRef
    resolved.nullable = typeRef.nullable === true
    return resolved
  }

  const metadata = typeRefCompatibilityMetadata(typeRef, context.libraries, { line: 1, column: 1 })
  const resolved = namedResolvedType(metadata.valueType)

  resolved.typeRef = typeRef
  resolved.nullable = metadata.nullable
  resolved.shape = metadata.shape
  resolved.asyncResultValueType = metadata.asyncResultValueType

  if (typeRef.kind === 'function') {
    const params: LowerTypeNode[] = []

    for (let index = 0; index < typeRef.params.length; index = index + 1) {
      const parameter = resolvedTypeFromTypeRef(typeRef.params[index], context)

      params.push({
        name: `arg${index}`,
        valueType: parameter.valueType ?? 'unknown',
        typeRef: typeRef.params[index],
        nullable: parameter.nullable,
        asyncResultValueType: nullableString(parameter.asyncResultValueType),
        shape: nullableNode(parameter.shape)
      })
    }

    const result = resolvedTypeFromTypeRef(typeRef.result, context)
    resolved.functionType = {
      kind: 'function',
      resolved: true,
      params,
      returnType: result.valueType ?? 'unknown',
      returnTypeRef: typeRef.result,
      returnNullable: result.nullable,
      returnAsyncResultValueType: nullableString(result.asyncResultValueType),
      returnShape: nullableNode(result.shape)
    }
  }

  return resolved
}

function primitiveTypeRef(valueType: string): TypeRef | null {
  if (
    valueType !== 'boolean' &&
    valueType !== 'bytes' &&
    valueType !== 'null' &&
    valueType !== 'number' &&
    valueType !== 'string' &&
    valueType !== 'void'
  ) {
    return null
  }

  return {
    kind: 'primitive',
    name: valueType as CorePrimitiveType,
    nullable: false,
    ownership: 'value',
    traits: []
  }
}

function unknownTypeRef(): TypeRef {
  return {
    kind: 'unknown',
    nullable: false,
    ownership: 'value',
    traits: []
  }
}

function cloneResolvedType(source: LowerResolvedType): LowerResolvedType {
  const resolved: LowerResolvedType = {
    valueType: source.valueType,
    nullable: source.nullable,
    libraryRuntimeRequirements: copyStringArray(source.libraryRuntimeRequirements),
    runtimeTypeAlternatives: cloneRuntimeTypeAlternatives(source.runtimeTypeAlternatives),
    asyncResultValueType: nullableString(source.asyncResultValueType),
    shape: nullableNode(source.shape),
    functionType: nullableNode(source.functionType),
    typeRef: source.typeRef
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
    runtimeTypeAlternatives: null,
    asyncResultValueType: null,
    shape: null,
    functionType: null,
    typeRef: null
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

function nullableNodeArray(value: LowerTypeNode[] | null | undefined): LowerTypeNode[] | null {
  if (value === null || typeof value === 'undefined') {
    return null
  }

  return value
}

function cloneRuntimeTypeAlternatives(
  values: LowerRuntimeTypeAlternative[] | null
): LowerRuntimeTypeAlternative[] | null {
  if (values === null) {
    return null
  }

  const copy: LowerRuntimeTypeAlternative[] = []

  for (let index = 0; index < values.length; index = index + 1) {
    copy.push({ ...values[index] })
  }

  return copy
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
