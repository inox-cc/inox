import type {
  CompilerLibraryPackageDescriptor,
  LibraryArgumentCheckDescriptor,
  LibraryCArgumentKind,
  LibraryCResultMappingDescriptor,
  LibraryOperationDescriptor,
  LibraryOperationKind,
  LibraryOperationVariantDescriptor,
  NominalTypeRef,
  PrimitiveTypeRef,
  TypeRef
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'node:buffer'
const binaryLibraryId = 'global:binary'
const collectionsLibraryId = 'global:collections'
const runtimeRequirement = libraryId
const arrayTypeId = `${collectionsLibraryId}#Array`
const uint8ArrayTypeId = `${binaryLibraryId}#Uint8Array`
const bufferTypeId = `${libraryId}#Buffer`
const bufferTypeRef: NominalTypeRef = {
  kind: 'nominal',
  typeId: bufferTypeId,
  args: [],
  nullable: false,
  ownership: 'value',
  traits: []
}
const booleanTypeRef: PrimitiveTypeRef = primitiveTypeRef('boolean')
const numberTypeRef: PrimitiveTypeRef = primitiveTypeRef('number')
const nullableNumberTypeRef: PrimitiveTypeRef = {
  ...numberTypeRef,
  nullable: true
}
const stringTypeRef: PrimitiveTypeRef = primitiveTypeRef('string')
const stringCResultMapping: LibraryCResultMappingDescriptor = {
  cppType: 'inox::String',
  fields: []
}

const operations: LibraryOperationDescriptor[] = [
  bufferFromOperation(),
  staticCall('alloc', ['number'], 'Buffer::alloc', bufferTypeRef, null, 1, 1, [numberArgument()]),
  bufferByteLengthOperation(),
  bufferStaticCompareOperation(),
  bufferConcatOperation(),
  {
    ...staticCall('isBuffer', ['value'], 'Buffer::isBuffer', booleanTypeRef, null, 1, 1, []),
    cFailureMode: null
  },
  constantOperation(),
  receiverMemberRead('length', 'length', numberTypeRef, null),
  receiverIndexRead(),
  receiverIndexWrite(),
  bufferReceiverBytesOperation('compare', 'compare', numberTypeRef),
  bufferCopyOperation(),
  bufferReceiverBytesOperation('equals', 'equals', booleanTypeRef),
  receiverCall('slice', ['receiver', 'number', 'optional-number'], 'slice', bufferTypeRef, null, 1, 2, [
    numberArgument(),
    numberArgument()
  ]),
  bufferSubarrayOperation(),
  bufferToStringOperation(),
  ...unsupportedCalls().map((name) => unsupportedOperation(name, 'call')),
  ...unsupportedConstructors().map((name) => unsupportedOperation(name, 'construct')),
  ...unsupportedProperties().map((name) => unsupportedOperation(name, 'member-read'))
]

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: [binaryLibraryId, collectionsLibraryId],
  nativeTypes: [
    {
      libraryId,
      typeId: bufferTypeId,
      declarationNames: ['Buffer'],
      valueType: 'bytes',
      cppType: 'Buffer',
      baseTypeIds: [uint8ArrayTypeId],
      runtimeRequirements: [binaryLibraryId, runtimeRequirement],
      cValueAdapter: 'Buffer($value)',
      cValueAdapterFailureMode: 'thrown',
      cRuntimeValueExpression: '$value.raw()',
      cRuntimeValueValidExpression: 'Buffer(inox::Value($value)).valid()'
    }
  ],
  operations,
  intrinsicBindings: [],
  runtimeRequirements: [
    {
      id: runtimeRequirement,
      dependencies: [binaryLibraryId],
      cPreludeIncludes: ['inox/buffer.h'],
      capabilities: []
    }
  ]
}

function bufferFromOperation(): LibraryOperationDescriptor {
  return {
    ...staticCall('from', ['value'], 'Buffer::from', bufferTypeRef, null, 1, 2, [
      { valueTypes: ['bytes', 'string'] },
      encodingArgument()
    ]),
    variants: [
      {
        ...staticVariant(1, 1, ['string-view']),
        argumentIndex: 0,
        argumentValueTypes: ['string']
      },
      {
        ...staticVariant(1, 1, ['value']),
        argumentIndex: 0,
        argumentValueTypes: ['bytes'],
        cArgumentAdapters: ['Uint8Array($value)'],
        cArgumentAdapterTypeIds: [uint8ArrayTypeId]
      },
      {
        ...staticVariant(2, 2, ['string-view', 'string-view']),
        argumentIndex: 0,
        argumentValueTypes: ['string']
      }
    ]
  }
}

function bufferSubarrayOperation(): LibraryOperationDescriptor {
  return receiverCall(
    'subarray',
    ['receiver', 'optional-number', 'optional-number'],
    'subarray',
    bufferTypeRef,
    null,
    0,
    2,
    [numberArgument(), numberArgument()]
  )
}

function bufferByteLengthOperation(): LibraryOperationDescriptor {
  return {
    ...staticCall('byteLength', ['string-view'], 'Buffer::byteLength', numberTypeRef, null, 1, 2, [
      stringArgument(),
      encodingArgument()
    ]),
    variants: [
      {
        minArgs: 1,
        maxArgs: 1,
        cExpression: 'Buffer::byteLength',
        cArgumentKinds: ['string-view']
      },
      {
        minArgs: 2,
        maxArgs: 2,
        cExpression: 'Buffer::byteLength',
        cArgumentKinds: ['string-view', 'string-view']
      }
    ]
  }
}

function bufferStaticCompareOperation(): LibraryOperationDescriptor {
  return {
    ...staticCall('compare', ['value', 'value'], 'Buffer::compare', numberTypeRef, null, 2, 2, [
      bytesArgument(),
      bytesArgument()
    ]),
    cArgumentAdapters: ['Uint8Array($value)', 'Uint8Array($value)'],
    cArgumentAdapterTypeIds: [uint8ArrayTypeId, uint8ArrayTypeId],
    cFailureMode: null
  }
}

function bufferConcatOperation(): LibraryOperationDescriptor {
  return {
    ...staticCall('concat', ['value', 'optional-number'], 'Buffer::concat', bufferTypeRef, null, 1, 2, [
      { valueTypes: [], typeRef: arrayTypeRef(uint8ArrayTypeRef()) },
      numberArgument()
    ]),
    cArgumentAdapters: ['Array($value)', ''],
    cArgumentAdapterTypeIds: [arrayTypeId, ''],
    variants: [
      {
        minArgs: 1,
        maxArgs: 1,
        cExpression: 'Buffer::concat',
        cArgumentKinds: ['value'],
        cArgumentAdapters: ['Array($value)'],
        cArgumentAdapterTypeIds: [arrayTypeId]
      },
      {
        minArgs: 2,
        maxArgs: 2,
        cExpression: 'Buffer::concat',
        cArgumentKinds: ['value', 'number'],
        cArgumentAdapters: ['Array($value)', ''],
        cArgumentAdapterTypeIds: [arrayTypeId, '']
      }
    ]
  }
}

function bufferCopyOperation(): LibraryOperationDescriptor {
  return {
    ...receiverCall(
      'copy',
      ['receiver', 'value', 'optional-number', 'optional-number', 'optional-number'],
      'copy',
      numberTypeRef,
      null,
      1,
      4,
      [bytesArgument(), numberArgument(), numberArgument(), numberArgument()]
    ),
    cArgumentAdapters: ['Uint8Array($value)', '', '', ''],
    cArgumentAdapterTypeIds: [uint8ArrayTypeId, '', '', ''],
    cHasObservableSideEffects: true
  }
}

function bufferReceiverBytesOperation(
  sourceName: 'compare' | 'equals',
  cName: 'compare' | 'equals',
  resultTypeRef: TypeRef
): LibraryOperationDescriptor {
  return {
    ...receiverCall(sourceName, ['receiver', 'value'], cName, resultTypeRef, null, 1, 1, [bytesArgument()]),
    cArgumentAdapters: ['', 'Uint8Array($value)'],
    cArgumentAdapterTypeIds: ['', uint8ArrayTypeId],
    cFailureMode: null
  }
}

function bufferToStringOperation(): LibraryOperationDescriptor {
  return {
    ...receiverCall('toString', ['receiver'], 'toString', stringTypeRef, stringCResultMapping, 0, 1, [
      encodingArgument()
    ]),
    variants: [receiverVariant(0, 0, ['receiver']), receiverVariant(1, 1, ['receiver', 'string-view'])]
  }
}

function staticCall(
  name: string,
  cArgumentKinds: LibraryCArgumentKind[],
  cExpression: string,
  resultTypeRef: TypeRef,
  cResultMapping: LibraryCResultMappingDescriptor | null,
  minArgs: number,
  maxArgs: number,
  argumentChecks: LibraryArgumentCheckDescriptor[]
): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: `global:Buffer.${name}`,
    bindingAliases: staticBindingAliases(name),
    operationId: `${libraryId}#Buffer.${name}`,
    kind: 'call',
    runtimeRequirements: [runtimeRequirement],
    cExpression,
    cArgumentKinds,
    cResultMode: resultTypeRef.kind === 'nominal' ? 'value' : null,
    cFailureMode: 'thrown',
    minArgs,
    maxArgs,
    argumentChecks,
    resultTypeRef,
    cResultMapping
  }
}

function staticVariant(
  minArgs: number,
  maxArgs: number,
  cArgumentKinds: LibraryCArgumentKind[]
): LibraryOperationVariantDescriptor {
  return {
    minArgs,
    maxArgs,
    cExpression: 'Buffer::from',
    cArgumentKinds,
    cResultMode: 'value'
  }
}

function receiverMemberRead(
  name: string,
  cExpression: string,
  resultTypeRef: TypeRef,
  cResultMapping: LibraryCResultMappingDescriptor | null
): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: receiverBinding(name),
    operationId: `${bufferTypeId}#read:${name}`,
    kind: 'member-read',
    runtimeRequirements: [runtimeRequirement],
    receiverTypeId: bufferTypeId,
    cExpression,
    cArgumentKinds: ['receiver'],
    cReceiverAdapter: 'Buffer($value)',
    cCallStyle: 'member',
    cFailureMode: null,
    resultTypeRef,
    cResultMapping
  }
}

function receiverCall(
  name: string,
  cArgumentKinds: LibraryCArgumentKind[],
  cExpression: string,
  resultTypeRef: TypeRef,
  cResultMapping: LibraryCResultMappingDescriptor | null,
  minArgs: number,
  maxArgs: number,
  argumentChecks: LibraryArgumentCheckDescriptor[]
): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: receiverBinding(name),
    operationId: `${bufferTypeId}#${name}`,
    kind: 'call',
    runtimeRequirements: [runtimeRequirement],
    receiverTypeId: bufferTypeId,
    cExpression,
    cArgumentKinds,
    cReceiverAdapter: 'Buffer($value)',
    cResultMode: resultTypeRef.kind === 'nominal' ? 'value' : null,
    cCallStyle: 'member',
    cFailureMode: 'thrown',
    minArgs,
    maxArgs,
    argumentChecks,
    resultTypeRef,
    cResultMapping
  }
}

function receiverVariant(
  minArgs: number,
  maxArgs: number,
  cArgumentKinds: LibraryCArgumentKind[]
): LibraryOperationVariantDescriptor {
  return {
    minArgs,
    maxArgs,
    cExpression: 'toString',
    cArgumentKinds,
    cReceiverAdapter: 'Buffer($value)'
  }
}

function receiverIndexRead(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: receiverBinding('*'),
    operationId: `${bufferTypeId}#index-read`,
    kind: 'index-read',
    runtimeRequirements: [runtimeRequirement],
    receiverTypeId: bufferTypeId,
    cExpression: 'get',
    cArgumentKinds: ['receiver', 'number'],
    cReceiverAdapter: 'Buffer($value)',
    cCallStyle: 'member',
    cFailureMode: null,
    cResultMapping: { cppType: 'inox::Value', fields: [] },
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [numberArgument()],
    resultTypeRef: nullableNumberTypeRef
  }
}

function receiverIndexWrite(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: receiverBinding('*'),
    operationId: `${bufferTypeId}#index-write`,
    kind: 'index-write',
    runtimeRequirements: [runtimeRequirement],
    receiverTypeId: bufferTypeId,
    cExpression: 'set',
    cArgumentKinds: ['receiver', 'number', 'number'],
    cReceiverAdapter: 'Buffer($value)',
    cCallStyle: 'member',
    cFailureMode: null,
    minArgs: 2,
    maxArgs: 2,
    argumentChecks: [numberArgument(), numberArgument()],
    resultTypeRef: numberTypeRef
  }
}

function constantOperation(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: moduleBinding('constants.MAX_LENGTH'),
    bindingAliases: [defaultBinding('constants.MAX_LENGTH'), namedModuleObjectBinding('constants.MAX_LENGTH')],
    operationId: `${libraryId}#constants.MAX_LENGTH`,
    kind: 'member-read',
    runtimeRequirements: [runtimeRequirement],
    cExpression: 'Buffer::maximumLength()',
    resultTypeRef: numberTypeRef
  }
}

function unsupportedOperation(name: string, kind: LibraryOperationKind): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: moduleBinding(name),
    bindingAliases: [defaultBinding(name), namedModuleObjectBinding(name)],
    operationId: `${libraryId}#unsupported:${name}`,
    kind,
    runtimeRequirements: [],
    cExpression: null,
    diagnosticCode: 'INOX_NOT_IMPLEMENTED',
    diagnosticMessage: `node:buffer ${name} is not implemented by the current C++ backend`
  }
}

function numberArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['number'] }
}

function stringArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['string'] }
}

function bytesArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['bytes'] }
}

function arrayTypeRef(elementType: TypeRef): NominalTypeRef {
  return {
    kind: 'nominal',
    typeId: arrayTypeId,
    args: [elementType],
    nullable: false,
    ownership: 'value',
    traits: [{ traitId: 'iterable', args: [elementType] }]
  }
}

function uint8ArrayTypeRef(): NominalTypeRef {
  return {
    kind: 'nominal',
    typeId: uint8ArrayTypeId,
    args: [],
    nullable: false,
    ownership: 'value',
    traits: []
  }
}

function encodingArgument(): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['string']
  }
}

function primitiveTypeRef(name: 'boolean' | 'number' | 'string'): PrimitiveTypeRef {
  return {
    kind: 'primitive',
    name,
    nullable: false,
    ownership: 'value',
    traits: []
  }
}

function staticBindingAliases(name: string): string[] {
  return [moduleBinding(`Buffer.${name}`), defaultBinding(`Buffer.${name}`), namedModuleObjectBinding(`Buffer.${name}`)]
}

function moduleBinding(path: string): string {
  return `${libraryId}#module:${libraryId}:${path}`
}

function defaultBinding(path: string): string {
  return `${libraryId}#module:${libraryId}:default.${path}`
}

function namedModuleObjectBinding(path: string): string {
  return `${libraryId}#module:${libraryId}:buffer.${path}`
}

function receiverBinding(name: string): string {
  return `${bufferTypeId}.${name}`
}

function unsupportedCalls(): string[] {
  return ['atob', 'btoa', 'isAscii', 'isUtf8', 'resolveObjectURL', 'transcode']
}

function unsupportedConstructors(): string[] {
  return ['Blob', 'File']
}

function unsupportedProperties(): string[] {
  return ['constants.MAX_STRING_LENGTH', 'kMaxLength', 'kStringMaxLength']
}
