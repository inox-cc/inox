export type LibraryId = string
export type LibraryBindingId = string
export type LibraryOperationId = string
export type LibraryObjectTypeId = string
export type LibraryNativeTypeId = string
export type RuntimeRequirementId = string
export type PlatformCapabilityId = string

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
  | 'variadic-count'
  | 'result-shape'
  | 'string-view-or-value'
  | 'object-boolean-field'
  | 'object-string-field'
  | 'object-number-field'
  | 'runtime-callback'
  | 'optional-runtime-callback'

export type LibraryCArgumentSourceDescriptor = {
  argumentIndex: number
  objectFieldName?: string
}

export type LibraryCallbackLifetime = 'call' | 'event-loop'

export type LibraryCResultMode = 'value' | 'borrowed'

export type LibraryBackendConstraintDescriptor = {
  option: 'loopBackend' | 'tlsBackend'
  allowedValues: string[]
  diagnosticCode: string
  diagnosticMessage: string
}

export type LibraryResultShapeFieldDescriptor = {
  name: string
  valueType: string
  readonly: boolean
  cMember?: string | null
  resultTypeId?: LibraryObjectTypeId | null
  resultShapeFields?: LibraryNestedResultShapeFieldDescriptor[]
  cppType?: string | null
}

export type LibraryNestedResultShapeFieldDescriptor = {
  name: string
  valueType: string
  readonly: boolean
  cMember?: string | null
  resultTypeId?: LibraryObjectTypeId | null
  cppType?: string | null
}

export type LibraryArgumentCheckDescriptor = {
  valueTypes: string[]
  objectTypeIds?: LibraryObjectTypeId[]
  objectFieldValueType?: string | null
  arrayLiteralRequired?: boolean
  arrayElementValueTypes?: string[]
  stringLiterals?: string[]
  literalDiagnosticCode?: string | null
  literalDiagnosticMessage?: string | null
  objectLiteralFields?: LibraryObjectLiteralFieldDescriptor[]
  functionParameters?: LibraryCallbackParameterDescriptor[]
  functionReturnType?: string | null
  functionAsync?: boolean | null
  functionAsyncDiagnosticCode?: string | null
  functionAsyncDiagnosticMessage?: string | null
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
  optional?: boolean
}

export type LibraryOperationVariantDescriptor = {
  minArgs?: number | null
  maxArgs?: number | null
  argumentChecks?: LibraryArgumentCheckDescriptor[]
  argumentIndex?: number | null
  argumentValueTypes?: string[]
  stringLiterals?: string[]
  objectFieldName?: string | null
  booleanLiterals?: boolean[]
  cExpression?: string | null
  cArgumentKinds?: LibraryCArgumentKind[]
  cArgumentAdapters?: string[]
  cArgumentSources?: Array<LibraryCArgumentSourceDescriptor | null>
  cReceiverAdapter?: string | null
  cResultMode?: LibraryCResultMode | null
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
  cArgumentKinds?: LibraryCArgumentKind[]
  cArgumentAdapters?: string[]
  cArgumentSources?: Array<LibraryCArgumentSourceDescriptor | null>
  cReceiverAdapter?: string | null
  cResultMode?: LibraryCResultMode | null
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
  backendConstraints?: LibraryBackendConstraintDescriptor[]
  cEntrypointAdapter?: RuntimeEntrypointAdapterDescriptor | null
}

export type CompilerLibraryDescriptor = {
  id: LibraryId
  dependencies: LibraryId[]
  declarations: LibraryDeclarationDescriptor[]
  nativeTypes?: LibraryNativeTypeDescriptor[]
  operations: LibraryOperationDescriptor[]
  intrinsicBindings: IntrinsicRoleBinding[]
  runtimeRequirements: RuntimeRequirementDescriptor[]
}

export type CompilerLibraryPackageDescriptor = {
  id: LibraryId
  dependencies: LibraryId[]
  nativeTypes?: LibraryNativeTypeDescriptor[]
  operations: LibraryOperationDescriptor[]
  intrinsicBindings: IntrinsicRoleBinding[]
  runtimeRequirements: RuntimeRequirementDescriptor[]
}

export type CompilerLibrarySet = {
  fingerprint: string
  declarations: LibraryDeclarationDescriptor[]
  nativeTypes: LibraryNativeTypeDescriptor[]
  operations: LibraryOperationDescriptor[]
  intrinsicBindings: IntrinsicRoleBinding[]
  runtimeRequirements: RuntimeRequirementDescriptor[]
}
