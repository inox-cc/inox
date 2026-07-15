export type LibraryId = string
export type LibraryBindingId = string
export type LibraryOperationId = string
export type LibraryObjectTypeId = string
export type LibraryNativeTypeId = string
export type RuntimeRequirementId = string
export type PlatformCapabilityId = string
export type LibraryOptionScalar = string | number | boolean

export type CorePrimitiveType = 'boolean' | 'bytes' | 'null' | 'number' | 'string' | 'void'
export type TypeOwnership = 'value' | 'owned' | 'borrowed' | 'weak'
export type TypeTraitId = 'iterable' | 'indexable' | 'awaitable'

export type TypeTraitRef = {
  traitId: TypeTraitId
  args: TypeRef[]
}

export type PrimitiveTypeRef = {
  kind: 'primitive'
  name: CorePrimitiveType
  nullable: boolean
  ownership: TypeOwnership
  traits: TypeTraitRef[]
}

export type NominalTypeRef = {
  kind: 'nominal'
  typeId: LibraryNativeTypeId
  args: TypeRef[]
  nullable: boolean
  ownership: TypeOwnership
  traits: TypeTraitRef[]
}

export type FunctionTypeRef = {
  kind: 'function'
  params: TypeRef[]
  result: TypeRef
  nullable: boolean
  ownership: TypeOwnership
  traits: TypeTraitRef[]
}

export type ObjectTypeRefField = {
  name: string
  typeRef: TypeRef
  readonly: boolean
}

export type ObjectTypeRef = {
  kind: 'object'
  fields: ObjectTypeRefField[]
  nullable: boolean
  ownership: TypeOwnership
  traits: TypeTraitRef[]
}

export type UnknownTypeRef = {
  kind: 'unknown'
  nullable: boolean
  ownership: TypeOwnership
  traits: TypeTraitRef[]
}

export type TypeRef =
  | PrimitiveTypeRef
  | NominalTypeRef
  | FunctionTypeRef
  | ObjectTypeRef
  | UnknownTypeRef

export type CompilerLibraryOptionValue = {
  optionId: string
  value: LibraryOptionScalar
}

export type LibraryOptionDescriptor = {
  libraryId: LibraryId
  optionId: string
  cliAliases: string[]
  valueType: 'string' | 'number' | 'boolean'
  defaultValue: LibraryOptionScalar
  allowedValues?: LibraryOptionScalar[]
  integer?: boolean
  minimum?: number
  maximum?: number
}

export type LibraryOptionConditionDescriptor = {
  optionId: string
  source: 'value' | 'present'
  values: LibraryOptionScalar[]
}

export type LibraryConditionalCapabilityDescriptor = {
  capability: PlatformCapabilityId
  conditions: LibraryOptionConditionDescriptor[]
}

export type LibraryCValueMappingDescriptor = {
  value: LibraryOptionScalar
  cExpression: string
}

export type LibraryRuntimeInitializerArgumentDescriptor = {
  optionId: string
  source: 'value' | 'present'
  cValueKind: 'boolean' | 'number' | 'uint32-hex' | 'mapped'
  cValueMap?: LibraryCValueMappingDescriptor[]
}

export type LibraryRuntimeInitializerDescriptor = {
  libraryId: LibraryId
  initializerId: string
  runtimeRequirement: RuntimeRequirementId
  cType: string
  cName: string
  arguments: LibraryRuntimeInitializerArgumentDescriptor[]
}

export type LibraryDeclarationKind = 'global' | 'module'

export type LibraryDeclarationDescriptor = {
  libraryId: LibraryId
  kind: LibraryDeclarationKind
  source: string
  declarationSource: string
  compilerImplemented?: boolean
}

export type LibraryNativeTypeDescriptor = {
  libraryId: LibraryId
  typeId: LibraryNativeTypeId
  declarationNames: string[]
  valueType: string
  cppType: string
  baseTypeIds: LibraryNativeTypeId[]
  runtimeRequirements: RuntimeRequirementId[]
  fields?: LibraryResultShapeFieldDescriptor[]
}

export type LibraryOperationKind =
  | 'call'
  | 'construct'
  | 'member-read'
  | 'member-write'
  | 'index-read'
  | 'index-write'

export type LibraryCArgumentKind =
  | 'receiver'
  | 'member-name-string-view'
  | 'string-view'
  | 'optional-string-view'
  | 'optional-argument'
  | 'optional-number'
  | 'optional-value'
  | 'argument-presence'
  | 'value'
  | 'number'
  | 'string-view-array'
  | 'optional-string-view-array'
  | 'string-view-array-count'
  | 'variadic-string-view-array'
  | 'variadic-format-values'
  | 'variadic-count'
  | 'result-shape'
  | 'string-view-or-value'
  | 'object-boolean-field'
  | 'object-string-field'
  | 'object-number-field'
  | 'runtime-callback'
  | 'optional-runtime-callback'

export type LibraryCLoweringKind =
  | 'number-from-string'
  | 'string-conversion'

export type LibraryCArgumentSourceDescriptor = {
  argumentIndex: number
  objectFieldName?: string
}

export type LibraryCallbackLifetime = 'call' | 'event-loop'

export type LibraryCResultMode = 'value' | 'borrowed'

export type LibraryCResultFieldMappingDescriptor = {
  name: string
  cMember: string
  cppType?: string | null
  fields?: LibraryCResultFieldMappingDescriptor[]
  fieldsOwnership?: 'weak'
}

export type LibraryCResultMappingDescriptor = {
  cppType: string
  fields: LibraryCResultFieldMappingDescriptor[]
}

export type LibraryBackendConstraintDescriptor = {
  option: 'loopBackend' | 'tlsBackend'
  allowedValues: string[]
  diagnosticCode: string
  diagnosticMessage: string
}

export type LibraryStringPrefixBackendConstraintDescriptor = LibraryBackendConstraintDescriptor & {
  prefixes: string[]
}

export type LibraryResultShapeFieldDescriptor = {
  name: string
  valueType: string
  readonly: boolean
  nullable?: boolean
  cMember?: string | null
  resultTypeId?: LibraryObjectTypeId | null
  resultShapeFields?: LibraryNestedResultShapeFieldDescriptor[]
  cppType?: string | null
}

export type LibraryNestedResultShapeFieldDescriptor = {
  name: string
  valueType: string
  readonly: boolean
  nullable?: boolean
  cMember?: string | null
  resultTypeId?: LibraryObjectTypeId | null
  cppType?: string | null
}

export type LibraryArgumentCheckDescriptor = {
  valueTypes: string[]
  objectMethods?: LibraryObjectMethodCheckDescriptor[]
  objectTypeIds?: LibraryObjectTypeId[]
  objectFieldValueType?: string | null
  arrayLiteralRequired?: boolean
  arrayElementValueTypes?: string[]
  stringLiterals?: string[]
  stringPrefixBackendConstraints?: LibraryStringPrefixBackendConstraintDescriptor[]
  literalDiagnosticCode?: string | null
  literalDiagnosticMessage?: string | null
  objectLiteralFields?: LibraryObjectLiteralFieldDescriptor[]
  functionParameters?: LibraryCallbackParameterDescriptor[]
  functionReturnType?: string | null
  functionAsync?: boolean | null
  functionAsyncDiagnosticCode?: string | null
  functionAsyncDiagnosticMessage?: string | null
}

export type LibraryObjectMethodCheckDescriptor = {
  name: string
  minArgs: number
  maxArgs: number
  returnValueTypes: string[]
}

export type LibraryCallbackParameterDescriptor = {
  name: string
  valueType: string
  nullable?: boolean
  resultTypeId?: LibraryObjectTypeId | null
  shapeFields?: LibraryResultShapeFieldDescriptor[]
}

export type LibraryObjectLiteralFieldDescriptor = {
  name: string
  valueTypes: string[]
  booleanLiterals?: boolean[]
  stringLiterals?: string[]
  objectLiteralRequired?: boolean
  objectFieldValueType?: string | null
  objectTypeIds?: LibraryObjectTypeId[]
  optional?: boolean
}

export type LibraryOperationVariantDescriptor = {
  runtimeRequirements?: RuntimeRequirementId[]
  minArgs?: number | null
  maxArgs?: number | null
  argumentChecks?: LibraryArgumentCheckDescriptor[]
  argumentIndex?: number | null
  argumentValueTypes?: string[]
  stringLiterals?: string[]
  objectFieldName?: string | null
  booleanLiterals?: boolean[]
  cExpression?: string | null
  cLowering?: LibraryCLoweringKind | null
  cClassFormatExpression?: string | null
  cArgumentKinds?: LibraryCArgumentKind[]
  cArgumentAdapters?: string[]
  cArgumentSources?: Array<LibraryCArgumentSourceDescriptor | null>
  cReceiverAdapter?: string | null
  cResultMode?: LibraryCResultMode | null
  cResultMapping?: LibraryCResultMappingDescriptor | null
  resultTypeRef?: TypeRef | null
  resultShapeFields?: LibraryResultShapeFieldDescriptor[]
  resultArrayElementType?: string | null
  resultArrayElementTypeId?: LibraryNativeTypeId | null
  resultTypeId?: LibraryObjectTypeId | null
  cppType?: string | null
  valueType?: string | null
  promiseValueType?: string | null
  promiseRejectionValueType?: string | null
  nullable?: boolean
  owned?: boolean
  callbackLifetime?: LibraryCallbackLifetime | null
}

export type LibraryOperationDescriptor = {
  libraryId: LibraryId
  bindingId: LibraryBindingId
  bindingAliases?: LibraryBindingId[]
  operationId: LibraryOperationId
  kind: LibraryOperationKind
  runtimeRequirements: RuntimeRequirementId[]
  cExpression?: string | null
  cLowering?: LibraryCLoweringKind | null
  cClassFormatExpression?: string | null
  cArgumentKinds?: LibraryCArgumentKind[]
  cArgumentAdapters?: string[]
  cArgumentSources?: Array<LibraryCArgumentSourceDescriptor | null>
  cReceiverAdapter?: string | null
  cResultMode?: LibraryCResultMode | null
  cResultMapping?: LibraryCResultMappingDescriptor | null
  resultTypeRef?: TypeRef | null
  resultShapeFields?: LibraryResultShapeFieldDescriptor[]
  resultArrayElementType?: string | null
  resultArrayElementTypeId?: LibraryNativeTypeId | null
  receiverTypeId?: LibraryObjectTypeId | null
  resultTypeId?: LibraryObjectTypeId | null
  cCallStyle?: 'function' | 'member' | 'index' | 'index-assignment' | 'member-assignment' | null
  cFailureMode?: 'thrown' | 'invalid-result' | null
  minArgs?: number | null
  maxArgs?: number | null
  argumentChecks?: LibraryArgumentCheckDescriptor[]
  variants?: LibraryOperationVariantDescriptor[]
  cppType?: string | null
  valueType?: string | null
  promiseValueType?: string | null
  promiseRejectionValueType?: string | null
  nullable?: boolean
  owned?: boolean
  constantValue?: string | null
  diagnosticCode?: string | null
  diagnosticMessage?: string | null
  callbackLifetime?: LibraryCallbackLifetime | null
}

export type IntrinsicRole =
  | 'array-literal'
  | 'async-result'
  | 'exception-value'
  | 'dynamic-object'
  | 'regexp-literal'

export type IntrinsicRoleBinding = {
  role: IntrinsicRole
  bindingId: LibraryBindingId
}

export type RuntimeEntrypointAdapterDescriptor = {
  cFunction: string
  acceptsEntryPath: boolean
}

export type RuntimeRequirementDescriptor = {
  id: RuntimeRequirementId
  dependencies: RuntimeRequirementId[]
  cPreludeIncludes: string[]
  capabilities: PlatformCapabilityId[]
  conditionalCapabilities?: LibraryConditionalCapabilityDescriptor[]
  backendConstraints?: LibraryBackendConstraintDescriptor[]
  cEntrypointAdapter?: RuntimeEntrypointAdapterDescriptor | null
}

export type CompilerLibraryDescriptor = {
  id: LibraryId
  dependencies: LibraryId[]
  declarations: LibraryDeclarationDescriptor[]
  options?: LibraryOptionDescriptor[]
  runtimeInitializers?: LibraryRuntimeInitializerDescriptor[]
  nativeTypes?: LibraryNativeTypeDescriptor[]
  operations: LibraryOperationDescriptor[]
  intrinsicBindings: IntrinsicRoleBinding[]
  runtimeRequirements: RuntimeRequirementDescriptor[]
}

export type CompilerLibraryPackageDescriptor = {
  id: LibraryId
  dependencies: LibraryId[]
  options?: LibraryOptionDescriptor[]
  runtimeInitializers?: LibraryRuntimeInitializerDescriptor[]
  nativeTypes?: LibraryNativeTypeDescriptor[]
  operations: LibraryOperationDescriptor[]
  intrinsicBindings: IntrinsicRoleBinding[]
  runtimeRequirements: RuntimeRequirementDescriptor[]
}

export type CompilerLibrarySet = {
  fingerprint: string
  declarations: LibraryDeclarationDescriptor[]
  options?: LibraryOptionDescriptor[]
  runtimeInitializers?: LibraryRuntimeInitializerDescriptor[]
  nativeTypes: LibraryNativeTypeDescriptor[]
  operations: LibraryOperationDescriptor[]
  intrinsicBindings: IntrinsicRoleBinding[]
  runtimeRequirements: RuntimeRequirementDescriptor[]
}
