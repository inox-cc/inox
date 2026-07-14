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
    resultTypeId: regexpTypeId,
    cResultMode: 'value',
    cppType: 'RegExp',
    valueType: 'object',
    nullable: false,
    owned: false
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
    cppType: 'bool',
    valueType: 'boolean',
    nullable: false,
    owned: false
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
