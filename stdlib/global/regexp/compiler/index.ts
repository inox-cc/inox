import type {
  CompilerLibraryPackageDescriptor,
  LibraryOperationDescriptor
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'global:regexp'
const runtimeRequirement = libraryId
const regexpTypeId = `${libraryId}#RegExp`
const literalBindingId = `${libraryId}#literal`

const operations: LibraryOperationDescriptor[] = [
  {
    libraryId,
    bindingId: literalBindingId,
    operationId: `${libraryId}#literal.construct`,
    kind: 'construct',
    runtimeRequirements: [runtimeRequirement],
    cExpression: 'RegExp',
    cArgumentKinds: ['string-view', 'string-view'],
    minArgs: 2,
    maxArgs: 2,
    argumentChecks: [
      { valueTypes: ['string'] },
      {
        valueTypes: ['string'],
        stringLiterals: ['', 'i'],
        literalDiagnosticCode: 'INOX_REGEXP_FLAG',
        literalDiagnosticMessage: 'regular expression flags must contain only i at most once'
      }
    ],
    resultTypeRef: {
      kind: 'nominal',
      typeId: regexpTypeId,
      args: [],
      nullable: false,
      ownership: 'value',
      traits: []
    },
    cResultMode: 'value'
  },
  {
    libraryId,
    bindingId: `${regexpTypeId}.test`,
    operationId: `${libraryId}#test`,
    kind: 'call',
    runtimeRequirements: [runtimeRequirement],
    cExpression: 'test',
    cArgumentKinds: ['receiver', 'string-view'],
    receiverTypeId: regexpTypeId,
    cCallStyle: 'member',
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [{ valueTypes: ['string'] }],
    resultTypeRef: {
      kind: 'primitive',
      name: 'boolean',
      nullable: false,
      ownership: 'value',
      traits: []
    }
  }
]

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: [],
  nativeTypes: [
    {
      libraryId,
      typeId: regexpTypeId,
      declarationNames: ['RegExp'],
      valueType: 'object',
      cppType: 'RegExp',
      baseTypeIds: [],
      runtimeRequirements: [runtimeRequirement]
    }
  ],
  operations,
  intrinsicBindings: [
    {
      role: 'regexp-literal',
      bindingId: literalBindingId
    }
  ],
  runtimeRequirements: [
    {
      id: runtimeRequirement,
      dependencies: ['string-bytes'],
      cPreludeIncludes: ['inox/regexp.h'],
      capabilities: []
    }
  ]
}
