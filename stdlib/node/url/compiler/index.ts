import type {
  CompilerLibraryPackageDescriptor,
  LibraryArgumentCheckDescriptor,
  LibraryCArgumentKind,
  LibraryCResultMappingDescriptor,
  LibraryOperationDescriptor,
  LibraryOperationKind,
  LibraryResultShapeFieldDescriptor,
  TypeRef
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'node:url'
const runtimeRequirement = 'node:url'
const urlTypeId = `${libraryId}#URL`
const searchParamsTypeId = `${libraryId}#URLSearchParams`
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
const stringTypeRef = primitiveTypeRef('string')
const nullableStringTypeRef = primitiveTypeRef('string', true)
const voidTypeRef = primitiveTypeRef('void')
const stringCResultMapping = cResultMapping('inox::String')
const valueCResultMapping = cResultMapping('inox::Value')
const voidCResultMapping = cResultMapping('void')

const operations: LibraryOperationDescriptor[] = [
  moduleCall('fileURLToPath', ['value'], 'url.fileURLToPath', {
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [{ valueTypes: ['string', 'object'], objectTypeIds: [urlTypeId] }],
    resultTypeRef: stringTypeRef,
    cResultMapping: stringCResultMapping
  }),
  moduleCall('pathToFileURL', ['value', 'result-shape'], 'url.pathToFileURL', {
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [stringArgument()],
    resultTypeRef: urlTypeRef
  }),
  constructorOperation(
    'URL',
    ['value', 'optional-value', 'argument-presence', 'result-shape'],
    'URL::from',
    urlTypeRef,
    1,
    2,
    [stringArgument(), { valueTypes: ['string', 'object'], objectTypeIds: [urlTypeId] }]
  ),
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
  receiverCall(searchParamsTypeId, 'delete', ['receiver', 'string-view'], 'remove', voidTypeRef, undefined, [
    stringArgument()
  ]),
  receiverCall(
    searchParamsTypeId,
    'get',
    ['receiver', 'string-view'],
    'get',
    nullableStringTypeRef,
    valueCResultMapping,
    [stringArgument()]
  ),
  receiverCall(searchParamsTypeId, 'has', ['receiver', 'string-view'], 'has', booleanTypeRef, undefined, [
    stringArgument()
  ]),
  receiverCall(searchParamsTypeId, 'set', ['receiver', 'string-view', 'string-view'], 'set', voidTypeRef, undefined, [
    stringArgument(),
    stringArgument()
  ]),
  receiverCall(searchParamsTypeId, 'toString', ['receiver'], 'toString', stringTypeRef, stringCResultMapping, []),
  ...urlFields.map((field) => receiverMemberRead(urlTypeId, field)),
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
  dependencies: [],
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
      runtimeRequirements
    }
  ],
  operations,
  intrinsicBindings: [],
  runtimeRequirements: [
    {
      id: runtimeRequirement,
      dependencies: ['managed-values', 'objects', 'string-bytes'],
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
    cFailureMode: name === 'URLSearchParams' ? 'invalid-result' : 'thrown',
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
  field: LibraryResultShapeFieldDescriptor
): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: receiverBinding(receiverTypeId, field.name),
    operationId: `${receiverTypeId}#read:${field.name}`,
    kind: 'member-read',
    runtimeRequirements,
    receiverTypeId,
    cExpression: null,
    resultTypeRef: stringTypeRef,
    cResultMapping: stringCResultMapping
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
  return { name, valueType: 'string', readonly }
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

function primitiveTypeRef(name: 'boolean' | 'string' | 'void', nullable = false): TypeRef {
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
