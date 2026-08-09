import type {
  CompilerLibraryNativeBuildDescriptor,
  CompilerLibraryPackageDescriptor,
  LibraryOperationDescriptor,
  NominalTypeRef
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'node:zlib'
const runtimeRequirement = libraryId
const bufferTypeId = 'node:buffer#Buffer'
const bufferTypeRef: NominalTypeRef = {
  kind: 'nominal',
  typeId: bufferTypeId,
  args: [],
  nullable: false,
  ownership: 'value',
  traits: []
}
const methodNames = ['deflateSync', 'inflateSync', 'deflateRawSync', 'inflateRawSync', 'gzipSync', 'gunzipSync']

export const compilerLibraryNativeBuild: CompilerLibraryNativeBuildDescriptor = {
  cmakePackages: ['ZLIB'],
  cmakeLinkLibraries: ['ZLIB::ZLIB'],
  linkerArguments: ['-lz']
}

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: ['global:binary', 'node:buffer'],
  operations: methodNames.map(operation),
  intrinsicBindings: [],
  runtimeRequirements: [
    {
      id: runtimeRequirement,
      dependencies: ['node:buffer'],
      cPreludeIncludes: ['inox/zlib.h'],
      capabilities: []
    }
  ]
}

function operation(name: string): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: moduleBinding(name),
    bindingAliases: [moduleBinding(`default.${name}`)],
    operationId: `${libraryId}#${name}`,
    kind: 'call',
    runtimeRequirements: [runtimeRequirement],
    cExpression: `zlib.${name}`,
    cArgumentKinds: ['value'],
    cResultMode: 'value',
    cFailureMode: 'thrown',
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [{ valueTypes: ['string', 'bytes'] }],
    resultTypeRef: bufferTypeRef
  }
}

function moduleBinding(name: string): string {
  return `${libraryId}#module:${libraryId}:${name}`
}
