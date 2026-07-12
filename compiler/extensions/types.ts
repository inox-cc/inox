export type LibraryId = string
export type LibraryBindingId = string
export type LibraryOperationId = string
export type LibraryObjectTypeId = string
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

export type LibraryOperationKind =
  | 'call'
  | 'construct'
  | 'member-read'
  | 'member-write'
  | 'index-read'
  | 'index-write'

export type LibraryCArgumentKind =
  | 'receiver'
  | 'string-view'
  | 'optional-string-view'
  | 'optional-value'
  | 'argument-presence'
  | 'value'
  | 'variadic-string-view-array'
  | 'variadic-count'
  | 'result-shape'

export type LibraryResultShapeFieldDescriptor = {
  name: string
  valueType: string
  readonly: boolean
}

export type LibraryArgumentCheckDescriptor = {
  valueTypes: string[]
  objectTypeIds?: LibraryObjectTypeId[]
  objectFieldValueType?: string | null
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
  resultShapeFields?: LibraryResultShapeFieldDescriptor[]
  receiverTypeId?: LibraryObjectTypeId | null
  resultTypeId?: LibraryObjectTypeId | null
  cCallStyle?: 'function' | 'member' | null
  cFailureMode?: 'thrown' | 'invalid-result' | null
  minArgs?: number | null
  maxArgs?: number | null
  argumentChecks?: LibraryArgumentCheckDescriptor[]
  cppType?: string | null
  valueType?: string | null
  nullable?: boolean
  owned?: boolean
  constantValue?: string | null
  diagnosticCode?: string | null
  diagnosticMessage?: string | null
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

export type RuntimeRequirementDescriptor = {
  id: RuntimeRequirementId
  dependencies: RuntimeRequirementId[]
  cPreludeIncludes: string[]
  capabilities: PlatformCapabilityId[]
}

export type CompilerLibraryDescriptor = {
  id: LibraryId
  dependencies: LibraryId[]
  declarations: LibraryDeclarationDescriptor[]
  operations: LibraryOperationDescriptor[]
  intrinsicBindings: IntrinsicRoleBinding[]
  runtimeRequirements: RuntimeRequirementDescriptor[]
}

export type CompilerLibraryPackageDescriptor = {
  id: LibraryId
  dependencies: LibraryId[]
  operations: LibraryOperationDescriptor[]
  intrinsicBindings: IntrinsicRoleBinding[]
  runtimeRequirements: RuntimeRequirementDescriptor[]
}

export type CompilerLibrarySet = {
  fingerprint: string
  declarations: LibraryDeclarationDescriptor[]
  operations: LibraryOperationDescriptor[]
  intrinsicBindings: IntrinsicRoleBinding[]
  runtimeRequirements: RuntimeRequirementDescriptor[]
}
