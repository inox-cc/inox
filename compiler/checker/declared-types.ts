import { diagnostic } from '../diagnostics.ts'
import {
  arrayElementTypeNameFromKnownTypeName,
  functionTypeNamesFromTypeName,
  genericTypeApplicationFromTypeName,
  inlineObjectTypeFieldsFromTypeName,
  indexedAccessTypeNameFromTypeName,
  isArrayTypeName,
  isBuiltinValueType,
  isNullableTypeName,
  nullableTypeNameFromKnownTypeName,
  recordTypeNamesFromTypeName,
  typeNameDependencyNames,
  typeQueryTargetNameFromTypeName,
  unionTypeNamesFromTypeName,
  weakTypeNameFromTypeName
} from '../type-names.ts'
import type { InlineObjectTypeField } from '../type-names.ts'
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
  commonResolvedObjectShape,
  commonResolvedAsyncResultValueType,
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
import {
  compilerLibraryNativeTypeForIntrinsic,
  compilerLibraryNativeTypeForName,
  compilerLibraryTypeOperatorForName
} from '../extensions/library-set.ts'
import { instantiateNativeTypeRef } from '../extensions/type-ref-substitution.ts'
import {
  commonTypeRef,
  refineTypeRefUnknowns,
  typeRefCompatibilityMetadata,
  typeRefTraitArgument
} from '../extensions/type-ref-compatibility.ts'
import type {
  CompilerLibrarySet,
  CorePrimitiveType,
  ObjectTypeRefField,
  TypeOwnership,
  TypeRef
} from '../extensions/types.ts'
import type { LibraryResultShapeFieldDescriptor } from '../extensions/types.ts'

export type DeclaredTypeResolverContext = {
  classNames: Set<string>
  diagnostics: Diagnostic[]
  incompleteDeclaredTypeDependencies: Map<string, Set<string>>
  incompleteDeclaredTypes: Set<string>
  libraries: CompilerLibrarySet
  resolvedDeclaredTypes: Map<string, ResolvedTypeInfo>
  resolvingDeclaredTypes: Set<string>
  retriedIncompleteDeclaredTypes: Set<string>
  symbols: Map<string, SymbolInfo>
  types: Map<string, TypeAliasInfo>
  typeSubstitutionNames: Map<string, string>
  typeSubstitutions: Map<string, ResolvedTypeInfo>
}

export function declareTypeAlias(context: DeclaredTypeResolverContext, item: TypeAliasDeclarationNode): void {
  if (item.name === 'AnyNode' && item.valueType.kind === 'object') {
    item.valueType.compilerBuiltin = 'compiler.AnyNode'
  }

  if (context.types.has(item.name)) {
    context.diagnostics.push(diagnostic('INOX_REDECLARED_NAME', `type ${item.name} is already declared`, item.loc))
    return
  }

  if (item.valueType.kind === 'alias' || item.valueType.kind === 'object' || item.valueType.kind === 'function') {
    context.types.set(item.name, typeAliasInfoFromDeclaration(item))
  }
}

export function typeAliasInfoFromDeclaration(item: TypeAliasDeclarationNode): TypeAliasInfo {
  const info: TypeAliasInfo = { ...item.valueType }
  const typeParameters = item.typeParameters ?? []

  if (typeParameters.length > 0) {
    info.typeParameters = typeParameters
  }

  return info
}

export function resolveDeclaredType(
  context: DeclaredTypeResolverContext,
  name: string | null | undefined,
  loc: SourceLocation
): ResolvedTypeInfo {
  if (name === null || typeof name === 'undefined' || name === 'unknown' || name === 'any') {
    return unresolvedTypeInfo()
  }

  const substitution = context.typeSubstitutions.get(name)

  if (substitution !== null && typeof substitution !== 'undefined') {
    return cloneResolvedTypeInfo(substitution)
  }

  const typeQueryTarget = typeQueryTargetNameFromTypeName(name)

  if (typeQueryTarget !== null) {
    return resolveTypeQueryDeclaredType(context, typeQueryTarget, loc)
  }

  const functionTypeNames = functionTypeNamesFromTypeName(name)

  if (functionTypeNames !== null) {
    return resolveInlineFunctionDeclaredType(context, functionTypeNames.params, functionTypeNames.result, loc)
  }

  if (name === 'AnyNode') {
    return resolveAnyNodeDeclaredType(context, loc)
  }

  const inlineObjectFields = inlineObjectTypeFieldsFromTypeName(name)

  if (inlineObjectFields !== null) {
    return resolveInlineObjectDeclaredType(context, inlineObjectFields, loc)
  }

  const rootResolution = context.resolvingDeclaredTypes.size === 0

  if (rootResolution) {
    context.retriedIncompleteDeclaredTypes.clear()
  }

  if (name === 'ValueType') {
    const info = unresolvedTypeInfo()
    info.valueType = 'string'

    return info
  }

  if (name === 'array') {
    const info = unresolvedTypeInfo()
    info.typeRef = compilerLibraryArrayTypeRef(context, unknownTypeRef(false))

    if (info.typeRef !== null) {
      const metadata = typeRefCompatibilityMetadata(info.typeRef, context.libraries, loc)
      info.valueType = metadata.valueType
      info.shape = metadata.shape
    }

    return info
  }

  if (isArrayTypeName(name)) {
    const arrayElementTypeName = arrayElementTypeNameFromKnownTypeName(name)
    const elementInfo = resolveDeclaredType(context, arrayElementTypeName, loc)
    const info = unresolvedTypeInfo()
    const providerType = compilerLibraryNativeTypeForIntrinsic(context.libraries, 'array-literal', 'construct')

    if (providerType !== null && (providerType.typeParameters ?? []).length === 1) {
      const typeRef = instantiateNativeTypeRef(providerType, [
        typeRefFromResolvedType(elementInfo, arrayElementTypeName)
      ])
      const metadata = typeRefCompatibilityMetadata(typeRef, context.libraries, loc)

      info.typeRef = typeRef
      info.valueType = metadata.valueType
      info.shape = metadata.shape
    }

    return info
  }

  const indexedAccess = indexedAccessTypeNameFromTypeName(name)

  if (indexedAccess !== null) {
    return resolveIndexedAccessDeclaredType(context, indexedAccess.base, indexedAccess.indexes, loc)
  }

  const genericApplication = genericTypeApplicationFromTypeName(name)

  if (genericApplication !== null) {
    const typeOperator = compilerLibraryTypeOperatorForName(context.libraries, genericApplication.name)

    if (typeOperator !== null) {
      if (genericApplication.args.length !== 1) {
        context.diagnostics.push(
          diagnostic(
            'INOX_TYPE_ARGUMENT_COUNT',
            `type operator ${genericApplication.name} expects 1 type argument, got ${genericApplication.args.length}`,
            loc
          )
        )
        return unresolvedTypeInfo()
      }

      const operand = resolveDeclaredType(context, genericApplication.args[0], loc)

      if (typeOperator.kind === 'function-result') {
        return resolveFunctionResultTypeOperator(context, genericApplication.name, operand, loc)
      }
    }

    if (genericApplication.name === 'NonNullable' && genericApplication.args.length === 1) {
      const resolved = resolveDeclaredType(context, genericApplication.args[0], loc)

      resolved.nullable = false
      resolved.typeRef = qualifiedTypeRef(resolved.typeRef, false, null)
      return resolved
    }

    const genericNativeType = compilerLibraryNativeTypeForName(context.libraries, genericApplication.name)
    const nativeTypeParameters = genericNativeType?.typeParameters

    if (nativeTypeParameters !== null && typeof nativeTypeParameters !== 'undefined') {
      if (nativeTypeParameters.length !== genericApplication.args.length) {
        context.diagnostics.push(
          diagnostic(
            'INOX_TYPE_ARGUMENT_COUNT',
            `generic type ${genericApplication.name} expects ${nativeTypeParameters.length} type argument(s), got ${genericApplication.args.length}`,
            loc
          )
        )
        return unresolvedTypeInfo()
      }

      const resolved = unresolvedTypeInfo()
      applyGenericNativeType(context, name, genericApplication.args, resolved, loc)
      return resolved
    }

    const definition = context.types.get(genericApplication.name)

    if (definition !== null && typeof definition !== 'undefined' && (definition.typeParameters ?? []).length > 0) {
      return resolveGenericDeclaredType(context, name, definition, genericApplication.args, loc)
    }
  }

  const nativeType = compilerLibraryNativeTypeForName(context.libraries, name)

  if (nativeType !== null) {
    const info = unresolvedTypeInfo()
    const fields: AnyNode[] = []
    const nativeFields = nativeType.fields ?? []

    for (let index = 0; index < nativeFields.length; index = index + 1) {
      fields.push(libraryNativeTypeField(nativeFields[index], loc))
    }

    info.valueType = nativeType.valueType as ValueType
    info.typeRef = {
      kind: 'nominal',
      typeId: nativeType.typeId,
      args: [],
      nullable: false,
      ownership: 'value',
      traits: []
    }
    info.shape = {
      kind: 'object',
      baseTypes: nativeType.baseTypeIds,
      fields,
      libraryCValueAdapter: nativeType.cValueAdapter ?? null,
      libraryTypeId: nativeType.typeId,
      libraryCppType: nativeType.cppType
    }

    return info
  }

  if (isNullableTypeName(name)) {
    const nullableTypeName = nullableTypeNameFromKnownTypeName(name)
    const inner = resolveDeclaredType(context, nullableTypeName, loc)

    return {
      valueType: inner.valueType,
      nullable: true,
      typeRef: qualifiedTypeRef(inner.typeRef, true, null),
      functionType: inner.functionType,
      shape: inner.shape,
      asyncResultValueType: inner.asyncResultValueType
    }
  }

  const unionTypeNames = unionTypeNamesFromTypeName(name)

  if (unionTypeNames !== null && typeof unionTypeNames !== 'undefined') {
    return resolveUnionDeclaredType(context, unionTypeNames, loc)
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
        typeRef: valueInfo.typeRef,
        asyncResultValueType: valueInfo.asyncResultValueType,
        functionType: valueInfo.functionType,
        shape: valueInfo.shape,
        loc
      },
      fields: []
    }

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

  if (classKnown || (classSymbol !== null && typeof classSymbol !== 'undefined' && classSymbol.kind === 'class')) {
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
    const retryIncomplete =
      !context.resolvingDeclaredTypes.has(name) &&
      context.incompleteDeclaredTypes.has(name) &&
      !context.retriedIncompleteDeclaredTypes.has(name)
    const refreshCached = rootResolution || retryIncomplete
    let staleCached: ResolvedTypeInfo | null = null

    if (
      cached !== null &&
      typeof cached !== 'undefined' &&
      !context.resolvingDeclaredTypes.has(name) &&
      (!context.incompleteDeclaredTypes.has(name) || !retryIncomplete)
    ) {
      return cloneResolvedTypeInfo(cached)
    }

    if (refreshCached) {
      if (retryIncomplete) {
        context.retriedIncompleteDeclaredTypes.add(name)
      }

      if (cached !== null && typeof cached !== 'undefined') {
        staleCached = cached
      }

      context.incompleteDeclaredTypeDependencies.delete(name)
      context.incompleteDeclaredTypes.delete(name)
      context.resolvedDeclaredTypes.delete(name)
    }

    if (context.resolvingDeclaredTypes.has(name)) {
      markIncompleteDeclaredTypeResolutions(context, name)
      const recursiveInfo = unresolvedTypeInfo()
      recursiveInfo.valueType = recursiveDeclaredValueType(context, shape, new Set<string>())

      return recursiveInfo
    }

    if (shape.kind === 'alias') {
      context.resolvingDeclaredTypes.add(name)

      try {
        const resolved = resolveDeclaredType(context, shape.valueType, loc)
        cacheResolvedDeclaredType(context, name, resolved, staleCached)

        if (refreshCached) {
          finalizeIncompleteDeclaredTypeResolution(context, name, retryIncomplete)
        }

        return resolved
      } finally {
        context.resolvingDeclaredTypes.delete(name)
      }
    }

    if (shape.kind === 'function') {
      const resolved = resolveDeclaredFunctionAlias(context, name, shape, loc, staleCached)

      if (refreshCached) {
        finalizeIncompleteDeclaredTypeResolution(context, name, retryIncomplete)
      }

      return resolved
    }

    const placeholder = objectResolvedTypePlaceholder(staleCached)
    context.resolvedDeclaredTypes.set(name, placeholder)
    context.resolvingDeclaredTypes.add(name)

    try {
      const resolvedShape = resolveObjectShape(context, shape)
      const resolved = unresolvedTypeInfo()
      resolved.valueType = 'object'
      resolved.shape = resolvedShape
      cacheResolvedDeclaredType(context, name, resolved, placeholder)

      if (refreshCached) {
        finalizeIncompleteDeclaredTypeResolution(context, name, retryIncomplete)
      }

      return resolved
    } finally {
      context.resolvingDeclaredTypes.delete(name)
    }
  }

  context.diagnostics.push(diagnostic('INOX_UNKNOWN_TYPE', `unknown type ${name}`, loc))

  return unresolvedTypeInfo()
}

function resolveTypeQueryDeclaredType(
  context: DeclaredTypeResolverContext,
  targetName: string,
  loc: SourceLocation
): ResolvedTypeInfo {
  const symbol = context.symbols.get(targetName)

  if (symbol === null || typeof symbol === 'undefined') {
    context.diagnostics.push(diagnostic('INOX_UNKNOWN_TYPE_QUERY', `unknown value ${targetName} in type query`, loc))
    return unresolvedTypeInfo()
  }

  const info = unresolvedTypeInfo()
  info.valueType = symbol.valueType
  info.nullable = symbol.nullable === true
  info.typeRef = symbol.typeRef ?? null
  info.functionType = symbol.functionType ?? null
  info.shape = symbol.shape ?? null
  info.asyncResultValueType = symbol.asyncResultValueType ?? null

  if (
    info.functionType === null &&
    symbol.returnType !== null &&
    typeof symbol.returnType !== 'undefined'
  ) {
    const params: FunctionTypeParamMetadata[] = []
    const symbolParams = symbol.params ?? []

    for (let index = 0; index < symbolParams.length; index = index + 1) {
      params.push(symbolParams[index] as FunctionTypeParamMetadata)
    }

    info.valueType = 'function'
    info.functionType = {
      kind: 'function',
      resolved: true,
      params,
      paramTemplates: symbol.paramTemplates ?? symbol.params ?? [],
      typeParameters: symbol.typeParameters ?? [],
      returnType: symbol.returnType,
      declaredReturnType: symbol.declaredReturnType ?? symbol.returnType,
      returnTypeRef: symbol.returnTypeRef ?? null,
      returnNullable: symbol.returnNullable === true,
      returnAsyncResultValueType: symbol.returnAsyncResultValueType ?? null,
      returnShape: symbol.returnShape ?? null,
      loc
    }
  }

  if (info.typeRef === null) {
    info.typeRef = typeRefFromResolvedType(info)
  }

  return info
}

function resolveInlineFunctionDeclaredType(
  context: DeclaredTypeResolverContext,
  parameterTypeNames: string[],
  resultTypeName: string,
  loc: SourceLocation
): ResolvedTypeInfo {
  const params: FunctionTypeParamMetadata[] = []

  for (let index = 0; index < parameterTypeNames.length; index = index + 1) {
    const parameterTypeName = parameterTypeNames[index]
    const parameterInfo = resolveDeclaredType(context, parameterTypeName, loc)

    params.push({
      name: `arg${index}`,
      loc,
      declaredType: parameterTypeName,
      valueType: parameterInfo.valueType,
      typeRef: typeRefFromResolvedType(parameterInfo, parameterTypeName),
      nullable: parameterInfo.nullable,
      asyncResultValueType: parameterInfo.asyncResultValueType,
      functionType: parameterInfo.functionType,
      shape: parameterInfo.shape
    })
  }

  const resultInfo = resolveDeclaredType(context, resultTypeName, loc)
  const info = unresolvedTypeInfo()
  info.valueType = 'function'
  info.functionType = {
    kind: 'function',
    resolved: true,
    params,
    paramTemplates: params,
    returnType: resultInfo.valueType,
    declaredReturnType: resultTypeName,
    returnTypeRef: typeRefFromResolvedType(resultInfo, resultTypeName),
    returnNullable: resultInfo.nullable,
    returnAsyncResultValueType: resultInfo.asyncResultValueType,
    returnShape: resultInfo.shape,
    loc
  }
  info.typeRef = typeRefFromResolvedType(info)
  return info
}

function resolveFunctionResultTypeOperator(
  context: DeclaredTypeResolverContext,
  operatorName: string,
  operand: ResolvedTypeInfo,
  loc: SourceLocation
): ResolvedTypeInfo {
  const operandTypeRef = operand.typeRef ?? typeRefFromResolvedType(operand)

  if (operandTypeRef.kind !== 'function') {
    context.diagnostics.push(
      diagnostic('INOX_TYPE_OPERATOR_OPERAND', `${operatorName} requires a function type`, loc)
    )
    return unresolvedTypeInfo()
  }

  return resolvedTypeInfoFromTypeRef(context, operandTypeRef.result, loc)
}

function resolveInlineObjectDeclaredType(
  context: DeclaredTypeResolverContext,
  inlineFields: InlineObjectTypeField[],
  loc: SourceLocation
): ResolvedTypeInfo {
  const fields: AnyNode[] = []

  for (const inlineField of inlineFields) {
    const weakTarget = weakTypeNameFromTypeName(inlineField.typeName)
    const declaredType = weakTarget ?? inlineField.typeName

    fields.push({
      name: inlineField.name,
      optional: inlineField.optional,
      readonly: false,
      ownership: weakTarget === null ? 'strong' : 'weak',
      weakLoc: null,
      declaredType,
      valueType: declaredType,
      loc
    })
  }

  const info = unresolvedTypeInfo()
  info.valueType = 'object'
  info.shape = resolveObjectShape(context, {
    kind: 'object',
    baseTypes: [],
    dynamic: false,
    dynamicField: null,
    fields
  })

  return info
}

function recursiveDeclaredValueType(
  context: DeclaredTypeResolverContext,
  definition: TypeAliasInfo,
  seen: Set<string>
): ValueType {
  if (definition.kind === 'function') {
    return 'function'
  }

  if (definition.kind === 'object') {
    return 'object'
  }

  const targetName = definition.valueType

  if (seen.has(targetName)) {
    return 'unknown'
  }

  seen.add(targetName)
  const genericApplication = genericTypeApplicationFromTypeName(targetName)
  const targetDefinition = context.types.get(genericApplication?.name ?? targetName)

  if (targetDefinition === null || typeof targetDefinition === 'undefined') {
    return 'unknown'
  }

  return recursiveDeclaredValueType(context, targetDefinition, seen)
}

function resolveGenericDeclaredType(
  context: DeclaredTypeResolverContext,
  applicationName: string,
  definition: TypeAliasInfo,
  argumentNames: string[],
  loc: SourceLocation
): ResolvedTypeInfo {
  const substitutedApplicationName = resolvedTypeSubstitutionName(context, applicationName)

  if (substitutedApplicationName !== applicationName) {
    return resolveDeclaredType(context, substitutedApplicationName, loc)
  }

  const rootResolution = context.resolvingDeclaredTypes.size === 0
  const typeParameters = definition.typeParameters ?? []

  if (typeParameters.length !== argumentNames.length) {
    context.diagnostics.push(
      diagnostic(
        'INOX_TYPE_ARGUMENT_COUNT',
        `generic type ${applicationName} expects ${typeParameters.length} type argument(s), got ${argumentNames.length}`,
        loc
      )
    )
    return unresolvedTypeInfo()
  }

  const cached = context.resolvedDeclaredTypes.get(applicationName)
  const retryIncomplete =
    !context.resolvingDeclaredTypes.has(applicationName) &&
    context.incompleteDeclaredTypes.has(applicationName) &&
    !context.retriedIncompleteDeclaredTypes.has(applicationName)
  const refreshCached = rootResolution || retryIncomplete
  let staleCached: ResolvedTypeInfo | null = null

  if (
    cached !== null &&
    typeof cached !== 'undefined' &&
    !context.resolvingDeclaredTypes.has(applicationName) &&
    (!context.incompleteDeclaredTypes.has(applicationName) || !retryIncomplete)
  ) {
    return cloneResolvedTypeInfo(cached)
  }

  if (refreshCached) {
    if (retryIncomplete) {
      context.retriedIncompleteDeclaredTypes.add(applicationName)
    }

    if (cached !== null && typeof cached !== 'undefined') {
      staleCached = cached
    }

    context.incompleteDeclaredTypeDependencies.delete(applicationName)
    context.incompleteDeclaredTypes.delete(applicationName)
    context.resolvedDeclaredTypes.delete(applicationName)
  }

  if (context.resolvingDeclaredTypes.has(applicationName)) {
    markIncompleteDeclaredTypeResolutions(context, applicationName)
    const recursive = unresolvedTypeInfo()

    if (definition.kind === 'object') {
      recursive.valueType = 'object'
    } else if (definition.kind === 'function') {
      recursive.valueType = 'function'
    }

    return recursive
  }

  let placeholder = staleCached

  if (definition.kind === 'object') {
    placeholder = objectResolvedTypePlaceholder(staleCached)
    context.resolvedDeclaredTypes.set(applicationName, placeholder)
  }

  context.resolvingDeclaredTypes.add(applicationName)

  try {
    const substitutionNames = new Map(context.typeSubstitutionNames)
    const substitutions = new Map(context.typeSubstitutions)

    for (let index = 0; index < typeParameters.length; index = index + 1) {
      const argumentName = argumentNames[index]

      if (argumentName === undefined) {
        return unresolvedTypeInfo()
      }

      substitutionNames.set(typeParameters[index].name, resolvedTypeSubstitutionName(context, argumentName))
      substitutions.set(typeParameters[index].name, resolveDeclaredType(context, argumentName, loc))
    }

    const child: DeclaredTypeResolverContext = {
      ...context,
      typeSubstitutionNames: substitutionNames,
      typeSubstitutions: substitutions
    }
    let resolved = unresolvedTypeInfo()

    if (definition.kind === 'alias') {
      resolved = resolveDeclaredType(child, definition.valueType, loc)
    } else if (definition.kind === 'function') {
      resolved = resolveDeclaredFunctionAlias(child, applicationName, definition, loc, null)
    } else {
      resolved.valueType = 'object'
      resolved.shape = resolveObjectShape(child, definition)
    }

    applyGenericNativeType(context, applicationName, argumentNames, resolved, loc)
    cacheResolvedDeclaredType(context, applicationName, resolved, placeholder)

    if (refreshCached) {
      finalizeIncompleteDeclaredTypeResolution(context, applicationName, retryIncomplete)
    }

    return resolved
  } finally {
    context.resolvingDeclaredTypes.delete(applicationName)
  }
}

function markIncompleteDeclaredTypeResolutions(context: DeclaredTypeResolverContext, recursiveName: string): void {
  for (const name of context.resolvingDeclaredTypes) {
    context.incompleteDeclaredTypes.add(name)
    let dependencies = context.incompleteDeclaredTypeDependencies.get(name)

    if (dependencies === null || typeof dependencies === 'undefined') {
      dependencies = new Set()
      context.incompleteDeclaredTypeDependencies.set(name, dependencies)
    }

    dependencies.add(recursiveName)
  }
}

function finalizeIncompleteDeclaredTypeResolution(
  context: DeclaredTypeResolverContext,
  name: string,
  retriedIncomplete: boolean
): void {
  if (!context.incompleteDeclaredTypes.has(name)) {
    return
  }

  if (hasOuterDeclaredTypeResolution(context, name)) {
    return
  }

  const dependencies = context.incompleteDeclaredTypeDependencies.get(name)

  if (dependencies !== null && typeof dependencies !== 'undefined') {
    for (const dependency of dependencies) {
      if (dependency !== name && context.incompleteDeclaredTypes.has(dependency)) {
        return
      }
    }

    if (dependencies.has(name) && !retriedIncomplete) {
      return
    }
  }

  for (const resolvingName of context.resolvingDeclaredTypes) {
    if (
      resolvingName !== name &&
      context.incompleteDeclaredTypes.has(resolvingName) &&
      (dependencies === null || typeof dependencies === 'undefined' || dependencies.has(resolvingName))
    ) {
      return
    }
  }

  context.incompleteDeclaredTypeDependencies.delete(name)
  context.incompleteDeclaredTypes.delete(name)
}

function hasOuterDeclaredTypeResolution(context: DeclaredTypeResolverContext, name: string): boolean {
  for (const resolvingName of context.resolvingDeclaredTypes) {
    if (resolvingName !== name) {
      return true
    }
  }

  return false
}

function cacheResolvedDeclaredType(
  context: DeclaredTypeResolverContext,
  name: string,
  resolved: ResolvedTypeInfo,
  stale: ResolvedTypeInfo | null
): void {
  if (stale !== null) {
    refreshResolvedTypeInfo(stale, resolved)
    context.resolvedDeclaredTypes.set(name, stale)
    return
  }

  context.resolvedDeclaredTypes.set(name, cloneResolvedTypeInfo(resolved))
}

function objectResolvedTypePlaceholder(stale: ResolvedTypeInfo | null): ResolvedTypeInfo {
  if (stale !== null) {
    stale.valueType = 'object'

    if (stale.shape === null) {
      stale.shape = emptyObjectShapeInfo()
    }

    return stale
  }

  const placeholder = unresolvedTypeInfo()
  placeholder.valueType = 'object'
  placeholder.shape = emptyObjectShapeInfo()

  return placeholder
}

function emptyObjectShapeInfo(): ObjectShapeInfo {
  return {
    kind: 'object',
    typeParameters: undefined,
    baseTypes: undefined,
    builtin: undefined,
    dynamic: undefined,
    dynamicField: undefined,
    fields: [],
    functionCompanions: undefined,
    libraryTypeId: undefined,
    libraryCppType: undefined,
    libraryCValueAdapter: undefined
  }
}

function refreshResolvedTypeInfo(target: ResolvedTypeInfo, source: ResolvedTypeInfo): void {
  target.valueType = source.valueType
  target.nullable = source.nullable
  target.typeRef = source.typeRef
  target.functionType = refreshFunctionTypeMetadata(target.functionType, source.functionType)
  target.shape = refreshObjectShape(target.shape, source.shape)
  target.asyncResultValueType = source.asyncResultValueType
}

function refreshObjectShape(target: ObjectShapeInfo | null, source: ObjectShapeInfo | null): ObjectShapeInfo | null {
  if (target === null || source === null) {
    return source
  }

  target.kind = source.kind
  target.typeParameters = source.typeParameters
  target.baseTypes = source.baseTypes
  target.builtin = source.builtin
  target.dynamic = source.dynamic
  target.dynamicField = source.dynamicField
  target.fields = source.fields
  target.functionCompanions = source.functionCompanions
  target.libraryTypeId = source.libraryTypeId
  target.libraryCppType = source.libraryCppType
  target.libraryCValueAdapter = source.libraryCValueAdapter

  return target
}

function refreshFunctionTypeMetadata(
  target: FunctionTypeMetadata | null,
  source: FunctionTypeMetadata | null
): FunctionTypeMetadata | null {
  if (target === null || source === null) {
    return source
  }

  const previousReturnShape = target.returnShape ?? null

  for (const key of Object.keys(source)) {
    target[key] = source[key]
  }

  target.returnShape = refreshObjectShape(previousReturnShape, source.returnShape ?? null)
  return target
}

function applyGenericNativeType(
  context: DeclaredTypeResolverContext,
  applicationName: string,
  argumentNames: string[],
  resolved: ResolvedTypeInfo,
  loc: SourceLocation
): void {
  const application = genericTypeApplicationFromTypeName(applicationName)

  if (application === null) {
    return
  }

  const nativeType = compilerLibraryNativeTypeForName(context.libraries, application.name)

  if (nativeType === null || nativeType.typeParameters === null || typeof nativeType.typeParameters === 'undefined') {
    return
  }

  const typeArguments: TypeRef[] = []

  for (let index = 0; index < argumentNames.length; index = index + 1) {
    typeArguments.push(
      typeRefFromResolvedType(resolveDeclaredType(context, argumentNames[index], loc), argumentNames[index])
    )
  }

  const typeRef = instantiateNativeTypeRef(nativeType, typeArguments)
  const metadata = typeRefCompatibilityMetadata(typeRef, context.libraries, loc)

  resolved.valueType = metadata.valueType
  resolved.typeRef = typeRef
  resolved.asyncResultValueType = metadata.asyncResultValueType

  if (resolved.shape === null) {
    resolved.shape = metadata.shape
  } else {
    resolved.shape.baseTypes = nativeType.baseTypeIds
    resolved.shape.libraryCValueAdapter = nativeType.cValueAdapter ?? null
    resolved.shape.libraryTypeId = nativeType.typeId
    resolved.shape.libraryCppType = nativeType.cppType
  }
}

export function typeRefFromResolvedType(info: ResolvedTypeInfo, declaredName: string | null = null): TypeRef {
  return typeRefFromResolvedTypeInScope(info, new Set<ObjectShapeInfo>(), declaredName)
}

function typeRefFromResolvedTypeInScope(
  info: ResolvedTypeInfo,
  resolvingShapes: Set<ObjectShapeInfo>,
  declaredName: string | null = null
): TypeRef {
  if (info.typeRef !== null) {
    if (info.typeRef.kind === 'object' && declaredName !== null) {
      return { ...info.typeRef, declaredName }
    }

    return info.typeRef
  }

  if (info.valueType === 'function' && info.functionType !== null) {
    return typeRefFromFunctionTypeMetadata(info.functionType, info.nullable, resolvingShapes)
  }

  const primitive = corePrimitiveTypeName(info.valueType)

  if (primitive !== null) {
    return {
      kind: 'primitive',
      name: primitive,
      nullable: info.nullable,
      ownership: 'value',
      traits: []
    }
  }

  if (info.valueType === 'object' && info.shape !== null) {
    if (resolvingShapes.has(info.shape)) {
      return unknownTypeRef(info.nullable)
    }

    const fields = []
    resolvingShapes.add(info.shape)

    try {
      for (let index = 0; index < info.shape.fields.length; index = index + 1) {
        const field = info.shape.fields[index]
        const fieldTypeRef =
          field.typeRef ??
          typeRefFromResolvedTypeInScope(resolvedTypeInfoFromField(field), resolvingShapes, field.declaredType ?? null)

        const typeRefField: ObjectTypeRefField = {
          name: field.name,
          typeRef: fieldTypeRef,
          readonly: field.readonly === true
        }

        if (field.optional === true) {
          typeRefField.optional = true
        }

        fields.push(typeRefField)
      }
    } finally {
      resolvingShapes.delete(info.shape)
    }

    const objectTypeRef: TypeRef = {
      kind: 'object',
      fields,
      nullable: info.nullable,
      ownership: 'value',
      traits: []
    }

    if (declaredName !== null) {
      objectTypeRef.declaredName = declaredName
    }

    if (info.shape.dynamic === true) {
      objectTypeRef.dynamic = true
    }

    const dynamicField = info.shape.dynamicField

    if (dynamicField !== null && typeof dynamicField !== 'undefined') {
      objectTypeRef.dynamicField = typeRefFromResolvedTypeInScope(
        resolvedTypeInfoFromField(dynamicField),
        resolvingShapes,
        dynamicField.declaredType ?? null
      )
    }

    return objectTypeRef
  }

  if (info.valueType === 'object') {
    const objectTypeRef: TypeRef = {
      kind: 'object',
      fields: [],
      dynamic: true,
      nullable: info.nullable,
      ownership: 'value',
      traits: []
    }

    if (declaredName !== null) {
      objectTypeRef.declaredName = declaredName
    }

    return objectTypeRef
  }

  return unknownTypeRef(info.nullable)
}

function typeRefFromFunctionTypeMetadata(
  functionType: FunctionTypeMetadata,
  nullable: boolean,
  resolvingShapes: Set<ObjectShapeInfo>
): TypeRef {
  const params: TypeRef[] = []

  for (let index = 0; index < functionType.params.length; index = index + 1) {
    const param = functionType.params[index]
    params.push(
      param.typeRef ??
        typeRefFromResolvedTypeInScope(resolvedTypeInfoFromField(param), resolvingShapes, param.declaredType ?? null)
    )
  }

  const resultInfo = unresolvedTypeInfo()
  resultInfo.valueType = functionType.returnType
  resultInfo.nullable = functionType.returnNullable === true
  resultInfo.typeRef = functionType.returnTypeRef ?? null
  resultInfo.shape = functionType.returnShape ?? null
  resultInfo.asyncResultValueType = functionType.returnAsyncResultValueType ?? null

  return {
    kind: 'function',
    params,
    result: typeRefFromResolvedTypeInScope(resultInfo, resolvingShapes),
    nullable,
    ownership: 'value',
    traits: []
  }
}

export function functionTypeMetadataFromTypeRef(
  context: DeclaredTypeResolverContext,
  typeRef: TypeRef | null | undefined,
  loc: SourceLocation
): FunctionTypeMetadata | null {
  if (typeRef === null || typeof typeRef === 'undefined' || typeRef.kind !== 'function') {
    return null
  }

  const params: FunctionTypeParamMetadata[] = []

  for (let index = 0; index < typeRef.params.length; index = index + 1) {
    const paramTypeRef = typeRef.params[index]
    const info = resolvedTypeInfoFromTypeRef(context, paramTypeRef, loc)
    const param: FunctionTypeParamMetadata = {
      name: `arg${index}`,
      loc,
      valueType: info.valueType,
      typeRef: paramTypeRef,
      nullable: info.nullable,
      asyncResultValueType: info.asyncResultValueType,
      functionType: info.functionType,
      shape: info.shape
    }

    params.push(param)
  }

  const result = resolvedTypeInfoFromTypeRef(context, typeRef.result, loc)

  return {
    kind: 'function',
    resolved: true,
    params,
    returnType: result.valueType,
    returnTypeRef: typeRef.result,
    returnNullable: result.nullable,
    returnAsyncResultValueType: result.asyncResultValueType,
    returnShape: result.shape,
    loc
  }
}

function resolvedTypeInfoFromTypeRef(
  context: DeclaredTypeResolverContext,
  typeRef: TypeRef,
  loc: SourceLocation
): ResolvedTypeInfo {
  const info = unresolvedTypeInfo()
  info.typeRef = typeRef

  if (typeRef.kind === 'parameter') {
    info.nullable = typeRef.nullable === true
    return info
  }

  const metadata = typeRefCompatibilityMetadata(typeRef, context.libraries, loc)
  info.valueType = metadata.valueType
  info.nullable = metadata.nullable
  info.functionType = functionTypeMetadataFromTypeRef(context, typeRef, loc)
  info.shape = metadata.shape
  info.asyncResultValueType = metadata.asyncResultValueType
  return info
}

function resolvedTypeInfoFromField(field: AnyNode): ResolvedTypeInfo {
  return {
    valueType: field.valueType ?? 'unknown',
    nullable: field.nullable === true,
    typeRef: field.typeRef ?? null,
    functionType: field.functionType ?? null,
    shape: field.shape ?? null,
    asyncResultValueType: field.asyncResultValueType ?? null
  }
}

function compilerLibraryArrayTypeRef(context: DeclaredTypeResolverContext, elementTypeRef: TypeRef): TypeRef | null {
  const providerType = compilerLibraryNativeTypeForIntrinsic(context.libraries, 'array-literal', 'construct')

  if (providerType === null || (providerType.typeParameters ?? []).length !== 1) {
    return null
  }

  return instantiateNativeTypeRef(providerType, [elementTypeRef])
}

function unknownTypeRef(nullable: boolean): TypeRef {
  return {
    kind: 'unknown',
    nullable,
    ownership: 'value',
    traits: []
  }
}

function corePrimitiveTypeName(valueType: ValueType): CorePrimitiveType | null {
  if (
    valueType === 'boolean' ||
    valueType === 'bytes' ||
    valueType === 'null' ||
    valueType === 'number' ||
    valueType === 'string' ||
    valueType === 'void'
  ) {
    return valueType
  }

  return null
}

function resolveIndexedAccessDeclaredType(
  context: DeclaredTypeResolverContext,
  baseName: string,
  indexes: string[],
  loc: SourceLocation
): ResolvedTypeInfo {
  let current = resolveDeclaredType(context, baseName, loc)

  for (let index = 0; index < indexes.length; index = index + 1) {
    current = resolveDeclaredTypeIndex(context, current, indexes[index], loc)
  }

  return current
}

function resolveDeclaredTypeIndex(
  context: DeclaredTypeResolverContext,
  source: ResolvedTypeInfo,
  indexName: string,
  loc: SourceLocation
): ResolvedTypeInfo {
  if (indexName === 'number') {
    const elementTypeRef = typeRefTraitArgument(source.typeRef, 'indexable', 1, context.libraries)

    if (elementTypeRef !== null) {
      return resolvedTypeInfoFromTypeRef(context, elementTypeRef, loc)
    }

    return unresolvedTypeInfo()
  }

  const shape = source.shape

  if (shape === null || typeof shape === 'undefined') {
    return unresolvedTypeInfo()
  }

  if (indexName === 'string') {
    const dynamicField = shape.dynamicField

    if (dynamicField !== null && typeof dynamicField !== 'undefined') {
      return resolveIndexedAccessField(context, dynamicField)
    }

    return unresolvedTypeInfo()
  }

  const propertyName = indexedAccessPropertyName(indexName)

  if (propertyName === null) {
    return unresolvedTypeInfo()
  }

  for (let index = 0; index < shape.fields.length; index = index + 1) {
    const field = shape.fields[index]

    if (field.name === propertyName) {
      return resolveIndexedAccessField(context, field)
    }
  }

  if (shape.dynamicField !== null && typeof shape.dynamicField !== 'undefined') {
    return resolveIndexedAccessField(context, shape.dynamicField)
  }

  return unresolvedTypeInfo()
}

function resolveIndexedAccessField(context: DeclaredTypeResolverContext, field: AnyNode): ResolvedTypeInfo {
  const resolved = resolveFieldDeclaredType(context, field)

  if (field.optional === true || field.nullable === true) {
    resolved.nullable = true
  }

  return resolved
}

function indexedAccessPropertyName(indexName: string): string | null {
  if (indexName.length < 2 || indexName.slice(0, 1) !== "'" || indexName.slice(indexName.length - 1) !== "'") {
    return null
  }

  let value = ''
  let escaped = false

  for (let index = 1; index < indexName.length - 1; index = index + 1) {
    const unit = indexName.slice(index, index + 1)

    if (escaped) {
      value = value + unit
      escaped = false
    } else if (unit === '\\') {
      escaped = true
    } else {
      value = value + unit
    }
  }

  if (escaped) {
    return null
  }

  return value
}

function libraryNativeTypeField(field: LibraryResultShapeFieldDescriptor, loc: SourceLocation): AnyNode {
  const result: AnyNode = {
    name: field.name,
    valueType: field.valueType,
    readonly: field.readonly,
    nullable: field.nullable ?? false,
    libraryCMember: field.cMember ?? null,
    libraryCGetter: field.cGetter ?? null,
    libraryCppType: field.cppType ?? null,
    loc
  }
  const nestedFields = field.resultShapeFields
  const nestedTypeId = field.resultTypeId

  if (
    (nestedFields !== null && typeof nestedFields !== 'undefined') ||
    (nestedTypeId !== null && typeof nestedTypeId !== 'undefined')
  ) {
    const fields: AnyNode[] = []
    const sourceFields = nestedFields ?? []

    for (let index = 0; index < sourceFields.length; index = index + 1) {
      const nestedField = sourceFields[index]
      fields.push({
        name: nestedField.name,
        valueType: nestedField.valueType,
        readonly: nestedField.readonly,
        nullable: nestedField.nullable ?? false,
        libraryCMember: nestedField.cMember ?? null,
        libraryCGetter: nestedField.cGetter ?? null,
        libraryCppType: nestedField.cppType ?? null,
        loc
      })
    }

    result.shape = {
      kind: 'object',
      fields,
      libraryTypeId: nestedTypeId ?? null,
      libraryCppType: field.cppType ?? null
    }
  }

  return result
}

function resolveDeclaredFunctionAlias(
  context: DeclaredTypeResolverContext,
  name: string,
  shape: FunctionTypeInfo,
  loc: SourceLocation,
  staleCached: ResolvedTypeInfo | null
): ResolvedTypeInfo {
  context.resolvingDeclaredTypes.add(name)

  try {
    const returnInfo = resolveDeclaredType(context, shape.returnType, loc)
    const params = resolveFunctionTypeParams(context, shape.params, loc)
    const resolved = unresolvedTypeInfo()
    let returnAsyncResultValueType: ValueType | null = null

    if (returnInfo.asyncResultValueType !== null && typeof returnInfo.asyncResultValueType !== 'undefined') {
      returnAsyncResultValueType = returnInfo.asyncResultValueType
    }

    resolved.valueType = 'function'
    resolved.functionType = {
      kind: 'function',
      resolved: true,
      params,
      declaredReturnType: shape.returnType,
      returnType: returnInfo.valueType,
      returnTypeRef: returnInfo.typeRef,
      returnNullable: returnInfo.nullable,
      returnAsyncResultValueType,
      returnShape: returnInfo.shape
    }
    cacheResolvedDeclaredType(context, name, resolved, staleCached)

    return resolved
  } finally {
    context.resolvingDeclaredTypes.delete(name)
  }
}

function resolveFunctionTypeParams(
  context: DeclaredTypeResolverContext,
  params: AnyNode[],
  loc: SourceLocation
): FunctionTypeParamMetadata[] {
  const resolvedParams: FunctionTypeParamMetadata[] = []

  for (const param of params) {
    const declaredType = nodeDeclaredTypeOrValueType(param)
    const paramLoc: SourceLocation = param.loc ?? loc
    const paramInfo = resolveDeclaredType(context, declaredType, paramLoc)
    let paramAsyncResultValueType: ValueType | null = null

    if (paramInfo.asyncResultValueType !== null && typeof paramInfo.asyncResultValueType !== 'undefined') {
      paramAsyncResultValueType = paramInfo.asyncResultValueType
    }

    resolvedParams.push({
      name: param.name,
      loc: paramLoc,
      optional: isOptionalParam(param),
      rest: param.rest === true,
      declaredType,
      valueType: paramInfo.valueType,
      typeRef: paramInfo.typeRef,
      nullable:
        paramInfo.nullable ||
        (param.optional === true && (param.defaultValue === null || typeof param.defaultValue === 'undefined')),
      asyncResultValueType: paramAsyncResultValueType,
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
  const typeRef = commonResolvedTypeRef(infos)
  const result = unresolvedTypeInfo()

  if (valueType === 'unknown') {
    return result
  }

  result.valueType = valueType
  result.nullable = resolvedTypeListHasNullable(infos)
  result.typeRef = typeRef

  if (valueType === 'async-result') {
    result.asyncResultValueType = commonResolvedAsyncResultValueType(infos)
  } else if (valueType === 'object') {
    if (result.typeRef !== null) {
      result.shape = typeRefCompatibilityMetadata(result.typeRef, context.libraries, loc).shape
    } else {
      result.shape = commonResolvedObjectShape(infos)
    }
  }

  return result
}

function commonResolvedTypeRef(infos: ResolvedTypeInfo[]): TypeRef | null {
  if (infos.length === 0 || infos[0].typeRef === null) {
    return null
  }

  let result: TypeRef | null = infos[0].typeRef

  for (let index = 1; index < infos.length; index = index + 1) {
    if (infos[index].typeRef === null) {
      return null
    }

    result = commonTypeRef(result, infos[index].typeRef)

    if (result === null) {
      return null
    }
  }

  return result
}

function resolveAnyNodeDeclaredType(context: DeclaredTypeResolverContext, loc: SourceLocation): ResolvedTypeInfo {
  const info = anyNodeResolvedTypeInfo(loc)
  const resolvingName = 'compiler.AnyNode'
  const shape = info.shape

  if (shape === null) {
    return info
  }

  if (context.resolvingDeclaredTypes.has(resolvingName)) {
    info.typeRef = compilerAnyNodeTypeRef()
    return info
  }

  context.resolvingDeclaredTypes.add(resolvingName)

  try {
    info.shape = resolveObjectShape(context, shape, false)
    info.typeRef = compilerAnyNodeTypeRef()
    return info
  } finally {
    context.resolvingDeclaredTypes.delete(resolvingName)
  }
}

function compilerAnyNodeTypeRef(): TypeRef {
  return {
    kind: 'object',
    declaredName: 'AnyNode',
    fields: [],
    dynamic: true,
    nullable: false,
    ownership: 'value',
    traits: []
  }
}

export function resolveObjectShape(
  context: DeclaredTypeResolverContext,
  shape: ObjectShapeInfo,
  optionalFieldsAreNullable: boolean = true
): ObjectShapeInfo {
  const bases = resolveObjectShapeBases(context, shape)
  const fields: AnyNode[] = []
  const resolvedFields: AnyNode[] = []

  mergeShapeFields(fields, bases.fields)
  mergeShapeFields(fields, shape.fields)

  for (const field of fields) {
    resolvedFields.push(resolveObjectShapeField(context, field, fields, optionalFieldsAreNullable))
  }

  const resolvedBaseTypes = resolvedObjectShapeBaseTypes(shape)

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
  } else if (bases.builtin !== null) {
    resolvedShape.builtin = bases.builtin
  }

  return resolvedShape
}

export function resolveObjectShapeField(
  context: DeclaredTypeResolverContext,
  field: AnyNode,
  fields: AnyNode[],
  optionalFieldsAreNullable: boolean = true
): AnyNode {
  const weakField = field.ownership === 'weak' || hasWeakOwnershipMarker(fields, field.name)
  const originalDeclaredType = nodeDeclaredTypeOrValueType(field)
  const declaredType = resolvedTypeSubstitutionName(context, originalDeclaredType)

  let fieldInfo = resolveFieldDeclaredType(context, field)

  if (weakField) {
    fieldInfo = resolveWeakTargetShapeFieldType(context, field)
  }

  let asyncResultValueType: ValueType | null = null
  let functionType = fieldInfo.functionType
  const functionOverloads: FunctionTypeMetadata[] = []

  if (functionType === null || typeof functionType === 'undefined') {
    const fieldFunctionType = field.functionType

    if (fieldFunctionType !== null && typeof fieldFunctionType !== 'undefined') {
      functionType = resolveFunctionTypeMetadata(context, fieldFunctionType, field.loc)
    } else {
      functionType = null
    }
  }

  if (fieldInfo.asyncResultValueType !== null && typeof fieldInfo.asyncResultValueType !== 'undefined') {
    asyncResultValueType = fieldInfo.asyncResultValueType
  }

  const sourceFunctionOverloads: FunctionTypeMetadata[] = field.functionOverloads ?? []

  for (const overload of sourceFunctionOverloads) {
    const resolved = resolveFunctionTypeMetadata(context, overload, field.loc)

    if (resolved !== null && typeof resolved !== 'undefined') {
      functionOverloads.push(resolved)
    }
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
    weakTypeValidated: weakField || field.weakTypeValidated === true,
    literalValue: field.literalValue ?? null,
    loc: field.loc,
    declaredType,
    typeRef: qualifiedFieldTypeRef(fieldInfo.typeRef, weakField, optionalFieldsAreNullable && field.optional === true),
    valueType: fieldInfo.valueType,
    nullable:
      fieldInfo.nullable ||
      field.nullable === true ||
      weakField ||
      (optionalFieldsAreNullable && field.optional === true),
    asyncResultValueType,
    functionType,
    functionOverloads,
    shape: fieldInfo.shape ?? field.shape ?? null
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
  const declaredReturnType = functionType.declaredReturnType ?? functionType.returnType
  const paramTemplates = functionType.paramTemplates ?? functionType.params
  const returnInfo = resolveDeclaredType(context, declaredReturnType, typeLoc)
  const params = resolveFunctionTypeParams(context, paramTemplates, typeLoc)
  let returnAsyncResultValueType: ValueType | null = null

  if (returnInfo.asyncResultValueType !== null && typeof returnInfo.asyncResultValueType !== 'undefined') {
    returnAsyncResultValueType = returnInfo.asyncResultValueType
  }

  return {
    kind: 'function',
    resolved: true,
    params,
    paramTemplates,
    typeParameters: functionType.typeParameters ?? [],
    declaredReturnType,
    returnType: returnInfo.valueType,
    returnTypeRef: returnInfo.typeRef,
    returnNullable: returnInfo.nullable,
    returnAsyncResultValueType,
    returnShape: returnInfo.shape
  }
}

export function resolveObjectShapeBases(
  context: DeclaredTypeResolverContext,
  shape: ObjectShapeInfo
): ObjectShapeBases {
  const fields: AnyNode[] = []
  let builtin: string | null = null
  let dynamic = false
  let dynamicField: AnyNode | null = null

  const baseTypes: string[] = shape.baseTypes ?? []

  for (const name of baseTypes) {
    const base = resolveObjectShapeBase(context, name)

    if (base === null || typeof base === 'undefined') {
      continue
    }

    for (const field of base.fields) {
      fields.push(field)
    }

    dynamic = dynamic || base.dynamic === true

    if (base.builtin !== null && typeof base.builtin !== 'undefined') {
      builtin = base.builtin
    }

    if (base.dynamicField !== null && typeof base.dynamicField !== 'undefined') {
      dynamicField = base.dynamicField
    }
  }

  return {
    builtin,
    dynamic,
    dynamicField,
    fields
  }
}

function resolveObjectShapeBase(context: DeclaredTypeResolverContext, name: string): ObjectShapeInfo | null {
  const seen: Set<string> = new Set()
  let currentName = name

  while (!seen.has(currentName)) {
    seen.add(currentName)

    if (genericTypeApplicationFromTypeName(currentName) !== null) {
      const resolved = resolveDeclaredType(context, currentName, { line: 1, column: 1 })

      if (resolved.valueType === 'object' && resolved.shape !== null) {
        return resolved.shape
      }

      return null
    }

    if (currentName === 'AnyNode') {
      return anyNodeResolvedTypeInfo({ line: 1, column: 1 }).shape
    }

    const current = context.types.get(currentName)

    if (current === null || typeof current === 'undefined') {
      return null
    }

    if (current.kind === 'object') {
      return resolveObjectShape(context, current)
    }

    if (current.kind !== 'alias') {
      return null
    }

    currentName = current.valueType
  }

  return null
}

export function resolveFieldDeclaredType(context: DeclaredTypeResolverContext, field: AnyNode): ResolvedTypeInfo {
  if (field.ownership === 'weak' || field.weakTypeValidated === true) {
    return resolveWeakFieldDeclaredType(context, field)
  }

  const declaredType = nodeDeclaredTypeOrValueType(field)
  const substitution = context.typeSubstitutions.get(declaredType)

  if (substitution !== null && typeof substitution !== 'undefined') {
    return shallowGenericFieldTypeInfo(substitution)
  }

  if (fieldHasResolvedTypeMetadata(field)) {
    return resolvedSyntheticFieldType(context, field)
  }

  if (
    (field.declaredType === null || typeof field.declaredType === 'undefined') &&
    (field.loc === null || typeof field.loc === 'undefined')
  ) {
    return resolvedSyntheticFieldType(context, field)
  }

  return resolveDeclaredType(context, declaredType, fieldSourceLocation(field))
}

function fieldSourceLocation(field: AnyNode): SourceLocation {
  let loc: SourceLocation = { line: 1, column: 1 }
  const fieldLoc = field.loc

  if (fieldLoc !== null && typeof fieldLoc !== 'undefined') {
    loc = fieldLoc
  }

  return loc
}

function fieldHasResolvedTypeMetadata(field: AnyNode): boolean {
  const declaredType = field.declaredType
  const valueType = field.valueType

  if (
    typeof declaredType === 'string' &&
    isArrayTypeName(declaredType) &&
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

function resolvedSyntheticFieldType(context: DeclaredTypeResolverContext, field: AnyNode): ResolvedTypeInfo {
  let typeRef: TypeRef | null = field.typeRef ?? null
  const declaredType = field.declaredType

  if (
    typeRef !== null &&
    typeof declaredType === 'string' &&
    typeRefContainsUnknown(typeRef, 0) &&
    syntheticDeclaredTypeDependenciesAreAvailable(context, declaredType)
  ) {
    const declared = resolveDeclaredType(context, declaredType, fieldSourceLocation(field))

    if (declared.typeRef !== null) {
      typeRef = refineTypeRefUnknowns(typeRef, declared.typeRef)
    }
  }

  const info =
    typeRef !== null && typeRef.kind !== 'parameter' && typeRef.kind !== 'object'
      ? resolvedTypeInfoFromTypeRef(context, typeRef, fieldSourceLocation(field))
      : unresolvedTypeInfo()

  if (field.valueType !== null && typeof field.valueType !== 'undefined') {
    info.valueType = field.valueType
  }

  info.nullable = info.nullable || field.nullable === true
  info.typeRef = typeRef
  info.functionType = field.functionType ?? info.functionType
  info.shape = field.shape ?? info.shape
  info.asyncResultValueType = field.asyncResultValueType ?? info.asyncResultValueType

  return info
}

function syntheticDeclaredTypeDependenciesAreAvailable(
  context: DeclaredTypeResolverContext,
  declaredType: string
): boolean {
  const dependencies = typeNameDependencyNames(declaredType)

  for (const dependency of dependencies) {
    if (
      dependency === 'AnyNode' ||
      dependency === 'NonNullable' ||
      dependency === 'ValueType' ||
      dependency === 'array'
    ) {
      continue
    }

    if (
      context.typeSubstitutions.has(dependency) ||
      context.types.has(dependency) ||
      context.classNames.has(dependency) ||
      compilerLibraryNativeTypeForName(context.libraries, dependency) !== null
    ) {
      continue
    }

    return false
  }

  return true
}

function typeRefContainsUnknown(typeRef: TypeRef, depth: number): boolean {
  if (typeRef.kind === 'unknown') {
    return true
  }

  if (typeRef.kind === 'parameter' || typeRef.kind === 'primitive' || depth >= 64) {
    return false
  }

  if (typeRef.kind === 'nominal') {
    return typeRefListContainsUnknown(typeRef.args, depth + 1) || typeRefTraitsContainUnknown(typeRef, depth + 1)
  }

  if (typeRef.kind === 'function') {
    return (
      typeRefListContainsUnknown(typeRef.params, depth + 1) ||
      typeRefContainsUnknown(typeRef.result, depth + 1) ||
      typeRefTraitsContainUnknown(typeRef, depth + 1)
    )
  }

  for (const field of typeRef.fields) {
    if (typeRefContainsUnknown(field.typeRef, depth + 1)) {
      return true
    }
  }

  if (
    typeRef.dynamicField !== null &&
    typeof typeRef.dynamicField !== 'undefined' &&
    typeRefContainsUnknown(typeRef.dynamicField, depth + 1)
  ) {
    return true
  }

  return typeRefTraitsContainUnknown(typeRef, depth + 1)
}

function typeRefListContainsUnknown(typeRefs: TypeRef[], depth: number): boolean {
  for (const typeRef of typeRefs) {
    if (typeRefContainsUnknown(typeRef, depth)) {
      return true
    }
  }

  return false
}

function typeRefTraitsContainUnknown(typeRef: TypeRef, depth: number): boolean {
  if (typeRef.kind === 'parameter') {
    return false
  }

  for (const trait of typeRef.traits) {
    if (typeRefListContainsUnknown(trait.args, depth)) {
      return true
    }
  }

  return false
}

export function resolveWeakFieldDeclaredType(context: DeclaredTypeResolverContext, field: AnyNode): ResolvedTypeInfo {
  const declaredName = nodeDeclaredTypeOrValueType(field)

  let targetName = declaredName

  if (isNullableTypeName(declaredName)) {
    const nullableName = nullableTypeNameFromKnownTypeName(declaredName)

    if (nullableName !== null && typeof nullableName !== 'undefined') {
      targetName = nullableName
    }
  }

  const fieldInfo = resolveWeakTargetDeclaredType(context, targetName, fieldSourceLocation(field))

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
  fieldInfo.typeRef = qualifiedTypeRef(fieldInfo.typeRef, true, 'weak')

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
    const weakField = field.ownership === 'weak' || hasWeakOwnershipMarker(fields, field.name)
    const declared = resolveWeakTargetShapeFieldType(context, field)
    let declaredType = nodeDeclaredTypeOrValueType(field)
    const fieldDeclaredType = field.declaredType
    let asyncResultValueType: ValueType | null = null
    const functionType = resolvedFunctionTypeMetadataValue(declared.functionType, field.functionType)

    if (fieldDeclaredType !== null && typeof fieldDeclaredType !== 'undefined') {
      declaredType = fieldDeclaredType
    }

    if (declared.asyncResultValueType !== null && typeof declared.asyncResultValueType !== 'undefined') {
      asyncResultValueType = declared.asyncResultValueType
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
      weakTypeValidated: weakField || field.weakTypeValidated === true,
      loc: field.loc,
      declaredType,
      typeRef: declared.typeRef,
      valueType: declared.valueType,
      nullable: declared.nullable || field.ownership === 'weak' || field.optional === true,
      asyncResultValueType,
      functionType,
      shape: null
    })
  }

  const resolvedBaseTypes = resolvedObjectShapeBaseTypes(shape)

  const resolvedShape: ObjectShapeInfo = {
    kind: 'object',
    baseTypes: resolvedBaseTypes,
    dynamic: shape.dynamic === true || bases.dynamic,
    fields: resolvedFields
  }

  if (shape.builtin !== null && typeof shape.builtin !== 'undefined') {
    resolvedShape.builtin = shape.builtin
  } else if (bases.builtin !== null) {
    resolvedShape.builtin = bases.builtin
  }

  return resolvedShape
}

function resolvedObjectShapeBaseTypes(shape: ObjectShapeInfo): string[] {
  const resolved: string[] = []

  for (const name of shape.baseTypes ?? []) {
    if (genericTypeApplicationFromTypeName(name) === null) {
      resolved.push(name)
    }
  }

  return resolved
}

export function resolveWeakTargetShapeFieldType(
  context: DeclaredTypeResolverContext,
  field: AnyNode
): ResolvedTypeInfo {
  const declaredType = nodeDeclaredTypeOrValueType(field)

  return resolveWeakTargetShapeTypeName(context, declaredType, fieldSourceLocation(field))
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
      typeRef: qualifiedTypeRef(inner.typeRef, true, null),
      functionType: inner.functionType,
      shape: inner.shape,
      asyncResultValueType: inner.asyncResultValueType
    }
  }

  if (name === 'array') {
    const info = unresolvedTypeInfo()
    info.typeRef = compilerLibraryArrayTypeRef(context, unknownTypeRef(false))

    if (info.typeRef !== null) {
      const metadata = typeRefCompatibilityMetadata(info.typeRef, context.libraries, loc)
      info.valueType = metadata.valueType
      info.shape = metadata.shape
    }

    return info
  }

  if (isArrayTypeName(name)) {
    const arrayElementTypeName = arrayElementTypeNameFromKnownTypeName(name)
    const elementInfo = resolveWeakTargetShapeTypeName(context, arrayElementTypeName, loc)
    const info = unresolvedTypeInfo()

    const providerType = compilerLibraryNativeTypeForIntrinsic(context.libraries, 'array-literal', 'construct')

    if (providerType !== null && (providerType.typeParameters ?? []).length === 1) {
      const typeRef = instantiateNativeTypeRef(providerType, [
        typeRefFromResolvedType(elementInfo, arrayElementTypeName)
      ])
      const metadata = typeRefCompatibilityMetadata(typeRef, context.libraries, loc)

      info.typeRef = typeRef
      info.valueType = metadata.valueType
      info.shape = metadata.shape
    }

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
    typeRef: info.typeRef,
    functionType: info.functionType,
    shape: info.shape,
    asyncResultValueType: info.asyncResultValueType
  }
}

function resolvedTypeSubstitutionName(context: DeclaredTypeResolverContext, name: string): string {
  return resolvedTypeSubstitutionNameInScope(context, name, new Set<string>())
}

function resolvedTypeSubstitutionNameInScope(
  context: DeclaredTypeResolverContext,
  name: string,
  seen: Set<string>
): string {
  if (seen.has(name)) {
    return name
  }

  seen.add(name)
  const direct = context.typeSubstitutionNames.get(name)

  if (direct !== null && typeof direct !== 'undefined') {
    const resolved = resolvedTypeSubstitutionNameInScope(context, direct, seen)

    seen.delete(name)
    return resolved
  }

  const application = genericTypeApplicationFromTypeName(name)

  if (application === null) {
    seen.delete(name)
    return name
  }

  const args: string[] = []
  let changed = false

  for (const argument of application.args) {
    const resolved = resolvedTypeSubstitutionNameInScope(context, argument, seen)

    args.push(resolved)
    changed = changed || resolved !== argument
  }

  seen.delete(name)

  if (!changed) {
    return name
  }

  return `${application.name}<${args.join(',')}>`
}

function shallowGenericFieldTypeInfo(info: ResolvedTypeInfo): ResolvedTypeInfo {
  const cloned = cloneResolvedTypeInfo(info)

  cloned.shape = shallowGenericFieldShape(info.shape)
  cloned.functionType = shallowGenericFunctionType(info.functionType, new Set<FunctionTypeMetadata>())
  return cloned
}

function shallowGenericFieldShape(shape: ObjectShapeInfo | null): ObjectShapeInfo | null {
  if (shape === null) {
    return null
  }

  const fields: AnyNode[] = []

  for (const field of shape.fields) {
    fields.push({
      ...field,
      functionType: shallowGenericFunctionType(
        field.functionType ?? null,
        new Set<FunctionTypeMetadata>(),
        new Set<ObjectShapeInfo>(),
        new Set<string>()
      ),
      shape: shallowGenericShapeMetadata(
        field.shape ?? null,
        new Set<ObjectShapeInfo>(),
        new Set<string>(),
        field.declaredType ?? null
      )
    })
  }

  return {
    ...shape,
    dynamicField:
      shape.dynamicField === null || typeof shape.dynamicField === 'undefined'
        ? shape.dynamicField
        : { ...shape.dynamicField, functionType: null, shape: null },
    fields
  }
}

function shallowGenericShapeMetadata(
  shape: ObjectShapeInfo | null,
  seenShapes: Set<ObjectShapeInfo>,
  seenTypes: Set<string>,
  declaredType: string | null = null
): ObjectShapeInfo | null {
  if (shape === null) {
    return null
  }

  const functionCompanions = objectShapeHasFunctionCompanions(shape, new Set<ObjectShapeInfo>())

  if (seenShapes.has(shape) || (declaredType !== null && seenTypes.has(declaredType))) {
    return {
      ...shape,
      dynamicField: null,
      fields: [],
      functionCompanions
    }
  }

  seenShapes.add(shape)

  if (declaredType !== null) {
    seenTypes.add(declaredType)
  }

  const fields: AnyNode[] = []

  for (const field of shape.fields) {
    if (field.valueType === 'function') {
      fields.push({
        ...field,
        functionType: shallowGenericFunctionType(
          field.functionType ?? null,
          new Set<FunctionTypeMetadata>(),
          seenShapes,
          seenTypes
        ),
        shape: null
      })
      continue
    }

    const fieldShape: ObjectShapeInfo | null | undefined = field.shape

    if (
      field.valueType !== 'object' ||
      fieldShape === null ||
      typeof fieldShape === 'undefined' ||
      !objectShapeHasFunctionCompanions(fieldShape, new Set<ObjectShapeInfo>())
    ) {
      continue
    }

    fields.push({
      ...field,
      functionType: null,
      shape: shallowGenericShapeMetadata(fieldShape, seenShapes, seenTypes, field.declaredType ?? null)
    })
  }

  seenShapes.delete(shape)

  if (declaredType !== null) {
    seenTypes.delete(declaredType)
  }

  return {
    ...shape,
    dynamicField: null,
    fields,
    functionCompanions
  }
}

function objectShapeHasFunctionCompanions(shape: ObjectShapeInfo, seen: Set<ObjectShapeInfo>): boolean {
  if (shape.functionCompanions === true) {
    return true
  }

  if (seen.has(shape)) {
    return false
  }

  seen.add(shape)

  for (const field of shape.fields) {
    if (field.valueType === 'function') {
      seen.delete(shape)
      return true
    }

    const fieldShape: ObjectShapeInfo | null | undefined = field.shape

    if (
      field.valueType === 'object' &&
      fieldShape !== null &&
      typeof fieldShape !== 'undefined' &&
      objectShapeHasFunctionCompanions(fieldShape, seen)
    ) {
      seen.delete(shape)
      return true
    }
  }

  seen.delete(shape)
  return false
}

function shallowGenericFunctionType(
  functionType: FunctionTypeMetadata | null,
  seen: Set<FunctionTypeMetadata>,
  seenShapes: Set<ObjectShapeInfo> = new Set<ObjectShapeInfo>(),
  seenTypes: Set<string> = new Set<string>()
): FunctionTypeMetadata | null {
  if (functionType === null || seen.has(functionType)) {
    return null
  }

  seen.add(functionType)
  const params: FunctionTypeParamMetadata[] = []

  for (const param of functionType.params) {
    params.push({
      ...param,
      functionType: shallowGenericFunctionType(param.functionType ?? null, seen, seenShapes, seenTypes),
      shape: shallowGenericShapeMetadata(param.shape ?? null, seenShapes, seenTypes, param.declaredType ?? null)
    })
  }

  seen.delete(functionType)
  return {
    ...functionType,
    params,
    returnShape: shallowGenericShapeMetadata(
      functionType.returnShape ?? null,
      seenShapes,
      seenTypes,
      functionType.declaredReturnType ?? null
    )
  }
}

export function unresolvedTypeInfo(): ResolvedTypeInfo {
  return {
    valueType: 'unknown',
    nullable: false,
    typeRef: null,
    functionType: null,
    shape: null,
    asyncResultValueType: null
  }
}

function qualifiedFieldTypeRef(typeRef: TypeRef | null, weak: boolean, optional: boolean): TypeRef | null {
  if (weak) {
    return qualifiedTypeRef(typeRef, true, 'weak')
  }

  if (optional) {
    return qualifiedTypeRef(typeRef, true, null)
  }

  return typeRef
}

function qualifiedTypeRef(typeRef: TypeRef | null, nullable: boolean, ownership: TypeOwnership | null): TypeRef | null {
  if (typeRef === null) {
    return null
  }

  if (typeRef.kind === 'parameter') {
    return {
      kind: 'parameter',
      name: typeRef.name,
      nullable: nullable || typeRef.nullable === true
    }
  }

  const resolvedOwnership = ownership ?? typeRef.ownership

  if (typeRef.kind === 'primitive') {
    return {
      kind: 'primitive',
      name: typeRef.name,
      nullable,
      ownership: resolvedOwnership,
      traits: typeRef.traits
    }
  }

  if (typeRef.kind === 'nominal') {
    return {
      kind: 'nominal',
      typeId: typeRef.typeId,
      args: typeRef.args,
      nullable,
      ownership: resolvedOwnership,
      traits: typeRef.traits
    }
  }

  if (typeRef.kind === 'function') {
    return {
      kind: 'function',
      params: typeRef.params,
      result: typeRef.result,
      nullable,
      ownership: resolvedOwnership,
      traits: typeRef.traits
    }
  }

  if (typeRef.kind === 'object') {
    return {
      ...typeRef,
      nullable,
      ownership: resolvedOwnership
    }
  }

  return {
    kind: 'unknown',
    nullable,
    ownership: resolvedOwnership,
    traits: typeRef.traits
  }
}
