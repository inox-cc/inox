import type {
  CompilerLibraryPackageDescriptor,
  LibraryOperationDescriptor
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'global:crypto'
const runtimeRequirement = libraryId
const uint8ArrayTypeId = 'global:binary#Uint8Array'

const operations: LibraryOperationDescriptor[] = [
  {
    libraryId,
    bindingId: 'global:crypto.getRandomValues',
    operationId: `${libraryId}#getRandomValues`,
    kind: 'call',
    runtimeRequirements: [runtimeRequirement],
    cExpression: 'crypto.getRandomValues',
    cArgumentKinds: ['value'],
    cArgumentAdapters: ['Uint8Array($value)'],
    cResultMode: 'value',
    resultTypeId: uint8ArrayTypeId,
    cFailureMode: 'thrown',
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [{ valueTypes: ['bytes'] }],
    cppType: 'Uint8Array',
    valueType: 'bytes',
    owned: false,
    nullable: false
  }
]

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: ['global:binary'],
  operations,
  intrinsicBindings: [],
  runtimeRequirements: [
    {
      id: runtimeRequirement,
      dependencies: [],
      cPreludeIncludes: ['inox/crypto.h'],
      capabilities: ['entropy']
    }
  ]
}
