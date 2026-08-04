import type {
  CompilerLibraryPackageDescriptor,
  LibraryArgumentCheckDescriptor,
  LibraryCArgumentKind,
  LibraryCResultMappingDescriptor,
  LibraryOperationDescriptor,
  LibraryOperationKind,
  LibraryResultShapeFieldDescriptor,
  NominalTypeRef,
  TypeRef
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'node:url'
const collectionsLibraryId = 'global:collections'
const arrayRuntimeRequirement = `${collectionsLibraryId}#array`
const arrayTypeId = `${collectionsLibraryId}#Array`
const runtimeRequirement = 'node:url'
const urlTypeId = `${libraryId}#URL`
const searchParamsTypeId = `${libraryId}#URLSearchParams`
const searchParamsIteratorTypeId = `${libraryId}#URLSearchParamsIterator`
const runtimeRequirements = [runtimeRequirement]
const urlFields: LibraryResultShapeFieldDescriptor[] = [
  stringField('href', true),
  stringField('protocol', true),
  stringField('hostname', true),
  stringField('port', true),
  stringField('pathname', false),
  stringField('search', false),
  stringField('hash', false)
]
const urlTypeRef = nominalTypeRef(urlTypeId)
const searchParamsTypeRef = nominalTypeRef(searchParamsTypeId)
const booleanTypeRef = primitiveTypeRef('boolean')
const numberTypeRef = primitiveTypeRef('number')
const stringTypeRef = primitiveTypeRef('string')
const nullableStringTypeRef = primitiveTypeRef('string', true)
const voidTypeRef = primitiveTypeRef('void')
const stringCResultMapping = cResultMapping('inox::String')
const valueCResultMapping = cResultMapping('inox::Value')
const voidCResultMapping = cResultMapping('void')
const iteratorParameterTypeRef: TypeRef = { kind: 'parameter', name: 'T' }
const searchParamsEntryTypeRef = arrayTypeRef(stringTypeRef)

const operations: LibraryOperationDescriptor[] = [
  moduleCall('fileURLToPath', ['value'], 'url.fileURLToPath', {
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [{ valueTypes: ['string', 'object'], objectTypeIds: [urlTypeId] }],
    resultTypeRef: stringTypeRef,
    cResultMapping: stringCResultMapping
  }),
  moduleCall('pathToFileURL', ['value'], 'url.pathToFileURL', {
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [stringArgument()],
    resultTypeRef: urlTypeRef
  }),
  constructorOperation(
    'URL',
    ['value', 'optional-value', 'argument-presence'],
    'URL::from',
    urlTypeRef,
    1,
    2,
    [stringArgument(), { valueTypes: ['string', 'object'], objectTypeIds: [urlTypeId] }]
  ),
  urlStringMethod('toJSON'),
  urlStringMethod('toString'),
  constructorOperation(
    'URLSearchParams',
    ['optional-string-record-or-value'],
    'URLSearchParams::from',
    searchParamsTypeRef,
    0,
    1,
    [{ valueTypes: ['string', 'object'], objectFieldValueType: 'string' }]
  ),
  receiverCall(
    searchParamsTypeId,
    'append',
    ['receiver', 'string-view', 'string-view'],
    'append',
    voidTypeRef,
    undefined,
    [stringArgument(), stringArgument()]
  ),
  searchParamsValueFilterOperation('delete', 'remove', voidTypeRef),
  searchParamsIteratorOperation('entries', searchParamsEntryTypeRef),
  searchParamsForEachOperation(),
  receiverCall(
    searchParamsTypeId,
    'get',
    ['receiver', 'string-view'],
    'get',
    nullableStringTypeRef,
    valueCResultMapping,
    [stringArgument()]
  ),
  receiverCall(
    searchParamsTypeId,
    'getAll',
    ['receiver', 'string-view'],
    'getAll',
    arrayTypeRef(stringTypeRef),
    undefined,
    [stringArgument()]
  ),
  searchParamsValueFilterOperation('has', 'has', booleanTypeRef),
  searchParamsIteratorOperation('keys', stringTypeRef),
  receiverMemberRead(searchParamsTypeId, 'size', 'size', numberTypeRef),
  receiverCall(searchParamsTypeId, 'set', ['receiver', 'string-view', 'string-view'], 'set', voidTypeRef, undefined, [
    stringArgument(),
    stringArgument()
  ]),
  receiverCall(searchParamsTypeId, 'sort', ['receiver'], 'sort', voidTypeRef, undefined),
  receiverCall(searchParamsTypeId, 'toString', ['receiver'], 'toString', stringTypeRef, stringCResultMapping, []),
  searchParamsIteratorOperation('values', stringTypeRef),
  receiverMemberWrite(urlTypeId, 'pathname', 'setPathname'),
  receiverMemberWrite(urlTypeId, 'search', 'setSearch'),
  receiverMemberWrite(urlTypeId, 'hash', 'setHash'),
  unsupportedOperation('domainToASCII'),
  unsupportedOperation('domainToUnicode'),
  unsupportedOperation('format'),
  unsupportedOperation('parse'),
  unsupportedOperation('resolve'),
  unsupportedOperation('urlToHttpOptions')
]

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: [collectionsLibraryId],
  nativeTypes: [
    {
      libraryId,
      typeId: urlTypeId,
      declarationNames: ['URL'],
      valueType: 'object',
      cppType: 'URL',
      baseTypeIds: [],
      runtimeRequirements,
      fields: urlFields
    },
    {
      libraryId,
      typeId: searchParamsTypeId,
      declarationNames: ['URLSearchParams'],
      valueType: 'object',
      cppType: 'URLSearchParams',
      baseTypeIds: [],
      runtimeRequirements,
      cValueAdapter: 'URLSearchParams($value)',
      cValueAdapterFailureMode: 'thrown',
      cValueAdapterPreservesPendingException: true,
      cRuntimeValueExpression: '$value.raw()',
      traits: [{ traitId: 'iterable', args: [searchParamsEntryTypeRef] }],
      cIteration: {
        iteratorMethod: 'entries',
        nextMethod: 'next',
        doneMember: 'done',
        valueMember: 'value',
        receiverAdapter: 'URLSearchParams($value)',
        valueAdapter: '$value.raw()',
        nextFailureMode: 'thrown'
      }
    },
    {
      libraryId,
      typeId: searchParamsIteratorTypeId,
      declarationNames: [],
      valueType: 'object',
      cppType: 'URLSearchParamsIterator',
      baseTypeIds: [],
      runtimeRequirements,
      typeParameters: ['T'],
      traits: [{ traitId: 'iterable', args: [iteratorParameterTypeRef] }],
      cIteration: {
        iteratorMethod: null,
        nextMethod: 'next',
        doneMember: 'done',
        valueMember: 'value',
        valueAdapter: '$value.raw()',
        nextFailureMode: 'thrown'
      }
    }
  ],
  operations,
  intrinsicBindings: [],
  runtimeRequirements: [
    {
      id: runtimeRequirement,
      dependencies: [arrayRuntimeRequirement, 'callback-values', 'managed-values', 'objects', 'string-bytes'],
      cPreludeIncludes: ['inox/url.h'],
      capabilities: []
    }
  ]
}

type ModuleCallOptions = {
  minArgs?: number
  maxArgs?: number
  argumentChecks?: LibraryArgumentCheckDescriptor[]
  resultTypeRef: TypeRef
  cResultMapping?: LibraryCResultMappingDescriptor
}

function moduleCall(
  name: string,
  cArgumentKinds: LibraryCArgumentKind[],
  cExpression: string,
  options: ModuleCallOptions
): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: moduleBinding(name),
    bindingAliases: [moduleDefaultBinding(name)],
    operationId: `${libraryId}#${name}`,
    kind: 'call',
    runtimeRequirements,
    cExpression,
    cArgumentKinds,
    resultTypeRef: options.resultTypeRef,
    cResultMapping: options.cResultMapping,
    cCallStyle: 'function',
    cFailureMode: 'thrown',
    minArgs: options.minArgs,
    maxArgs: options.maxArgs,
    argumentChecks: options.argumentChecks
  }
}

function constructorOperation(
  name: string,
  cArgumentKinds: LibraryCArgumentKind[],
  cExpression: string,
  resultTypeRef: TypeRef,
  minArgs: number,
  maxArgs: number,
  argumentChecks: LibraryArgumentCheckDescriptor[]
): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: moduleBinding(name),
    bindingAliases: [moduleDefaultBinding(name)],
    operationId: `${libraryId}#${name}`,
    kind: 'construct',
    runtimeRequirements,
    cExpression,
    cArgumentKinds,
    resultTypeRef,
    cCallStyle: 'function',
    cFailureMode: 'thrown',
    minArgs,
    maxArgs,
    argumentChecks
  }
}

function receiverCall(
  receiverTypeId: string,
  name: string,
  cArgumentKinds: LibraryCArgumentKind[],
  cExpression: string,
  resultTypeRef: TypeRef,
  cResultMapping: LibraryCResultMappingDescriptor | undefined,
  argumentChecks: LibraryArgumentCheckDescriptor[] = []
): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: receiverBinding(receiverTypeId, name),
    operationId: `${receiverTypeId}#${name}`,
    kind: 'call',
    runtimeRequirements,
    receiverTypeId,
    cExpression,
    cArgumentKinds,
    cCallStyle: 'member',
    cFailureMode: 'thrown',
    minArgs: argumentChecks.length,
    maxArgs: argumentChecks.length,
    argumentChecks,
    resultTypeRef,
    cResultMapping
  }
}

function receiverMemberRead(
  receiverTypeId: string,
  name: string,
  cExpression: string,
  resultTypeRef: TypeRef
): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: receiverBinding(receiverTypeId, name),
    operationId: `${receiverTypeId}#read:${name}`,
    kind: 'member-read',
    runtimeRequirements,
    receiverTypeId,
    cExpression,
    cArgumentKinds: ['receiver'],
    cCallStyle: 'member',
    cFailureMode: 'thrown',
    resultTypeRef
  }
}

function searchParamsValueFilterOperation(
  name: 'delete' | 'has',
  cExpression: 'has' | 'remove',
  resultTypeRef: TypeRef
): LibraryOperationDescriptor {
  return {
    ...receiverCall(
      searchParamsTypeId,
      name,
      ['receiver', 'string-view', 'optional-string-view', 'argument-presence'],
      cExpression,
      resultTypeRef,
      undefined,
      [stringArgument(), stringArgument()]
    ),
    minArgs: 1,
    maxArgs: 2
  }
}

function searchParamsIteratorOperation(name: 'entries' | 'keys' | 'values', elementType: TypeRef) {
  return {
    ...receiverCall(
      searchParamsTypeId,
      name,
      ['receiver'],
      name,
      searchParamsIteratorTypeRef(elementType),
      undefined
    ),
    cFailureMode: null,
    cPreservesPendingException: true,
    cResultMode: 'value' as const
  }
}

function searchParamsForEachOperation(): LibraryOperationDescriptor {
  return {
    ...receiverCall(
      searchParamsTypeId,
      'forEach',
      ['receiver', 'runtime-callback'],
      'forEach',
      voidTypeRef,
      undefined,
      [
        {
          valueTypes: ['function'],
          functionParameters: [
            { name: 'value', valueType: 'string', typeRef: stringTypeRef },
            { name: 'key', valueType: 'string', typeRef: stringTypeRef },
            { name: 'searchParams', valueType: 'object', typeRef: searchParamsTypeRef }
          ],
          functionReturnType: 'void',
          functionAsync: false
        }
      ]
    ),
    cResultMode: 'value',
    cHasObservableSideEffects: true
  }
}

function urlStringMethod(name: 'toJSON' | 'toString'): LibraryOperationDescriptor {
  return {
    ...receiverCall(urlTypeId, name, ['receiver'], name, stringTypeRef, stringCResultMapping),
    cFailureMode: null
  }
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

function searchParamsIteratorTypeRef(elementType: TypeRef): NominalTypeRef {
  return {
    kind: 'nominal',
    typeId: searchParamsIteratorTypeId,
    args: [elementType],
    nullable: false,
    ownership: 'value',
    traits: [{ traitId: 'iterable', args: [elementType] }]
  }
}

function receiverMemberWrite(receiverTypeId: string, field: string, cExpression: string): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: receiverBinding(receiverTypeId, field),
    operationId: `${receiverTypeId}#write:${field}`,
    kind: 'member-write',
    runtimeRequirements,
    receiverTypeId,
    cExpression,
    cArgumentKinds: ['receiver', 'value'],
    cCallStyle: 'member',
    cFailureMode: 'thrown',
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [stringArgument()],
    resultTypeRef: stringTypeRef,
    cResultMapping: voidCResultMapping
  }
}

function unsupportedOperation(name: string): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: moduleBinding(name),
    bindingAliases: [moduleDefaultBinding(name)],
    operationId: `${libraryId}#${name}`,
    kind: 'call' as LibraryOperationKind,
    runtimeRequirements: [],
    cExpression: null,
    diagnosticCode: 'INOX_NOT_IMPLEMENTED',
    diagnosticMessage: `node:url ${name} is not implemented by the current C++ backend`
  }
}

function stringField(name: string, readonly: boolean): LibraryResultShapeFieldDescriptor {
  return {
    name,
    valueType: 'string',
    readonly,
    cGetter: name,
    cppType: 'inox::String'
  }
}

function nominalTypeRef(typeId: string): TypeRef {
  return {
    kind: 'nominal',
    typeId,
    args: [],
    nullable: false,
    ownership: 'value',
    traits: []
  }
}

function primitiveTypeRef(name: 'boolean' | 'number' | 'string' | 'void', nullable = false): TypeRef {
  return {
    kind: 'primitive',
    name,
    nullable,
    ownership: 'value',
    traits: []
  }
}

function cResultMapping(cppType: string): LibraryCResultMappingDescriptor {
  return { cppType, fields: [] }
}

function stringArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['string'] }
}

function moduleBinding(name: string): string {
  return `${libraryId}#module:${libraryId}:${name}`
}

function moduleDefaultBinding(name: string): string {
  return `${libraryId}#module:${libraryId}:default.${name}`
}

function receiverBinding(receiverTypeId: string, name: string): string {
  return `${receiverTypeId}.${name}`
}
