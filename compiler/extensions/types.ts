export type LibraryId = string
export type LibraryBindingId = string
export type LibraryOperationId = string
export type RuntimeRequirementId = string
export type PlatformCapabilityId = string

export type LibraryDeclarationKind = 'global' | 'module'

export type LibraryDeclarationDescriptor = {
  libraryId: LibraryId
  kind: LibraryDeclarationKind
  source: string
  declarationSource: string
}

export type LibraryOperationKind =
  | 'call'
  | 'construct'
  | 'member-read'
  | 'member-write'
  | 'index-read'
  | 'index-write'

export type LibraryOperationDescriptor = {
  libraryId: LibraryId
  bindingId: LibraryBindingId
  operationId: LibraryOperationId
  kind: LibraryOperationKind
  runtimeRequirements: RuntimeRequirementId[]
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

export type CompilerLibrarySet = {
  fingerprint: string
  declarations: LibraryDeclarationDescriptor[]
  operations: LibraryOperationDescriptor[]
  intrinsicBindings: IntrinsicRoleBinding[]
  runtimeRequirements: RuntimeRequirementDescriptor[]
}
