import type {
  CompilerLibraryPackageDescriptor,
  LibraryArgumentCheckDescriptor,
  LibraryCArgumentKind,
  LibraryOperationDescriptor,
  LibraryOperationKind,
  LibraryResultShapeFieldDescriptor
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'node:url'
const runtimeRequirement = 'node:url'
const urlTypeId = `${libraryId}#URL`
const searchParamsTypeId = `${libraryId}#URLSearchParams`
const urlFields: LibraryResultShapeFieldDescriptor[] = [
  stringField('href', true),
  stringField('protocol', true),
  stringField('hostname', true),
  stringField('port', true),
  stringField('pathname', false),
  stringField('search', false),
  stringField('hash', false)
]

const operations: LibraryOperationDescriptor[] = [
  moduleCall('fileURLToPath', ['value'], 'url.fileURLToPath', 'inox::String', 'string', {
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [{ valueTypes: ['string', 'object'], objectTypeIds: [urlTypeId] }]
  }),
  moduleCall('pathToFileURL', ['value', 'result-shape'], 'url.pathToFileURL', 'URL', 'object', {
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [stringArgument()],
    resultTypeId: urlTypeId,
    resultShapeFields: urlFields
  }),
  constructorOperation('URL', ['value', 'optional-value', 'argument-presence', 'result-shape'], 'URL::from', 'URL', urlTypeId, urlFields, 1, 2, [
    stringArgument(),
    { valueTypes: ['string', 'object'], objectTypeIds: [urlTypeId] }
  ]),
  constructorOperation('URLSearchParams', ['optional-value'], 'URLSearchParams::from', 'URLSearchParams', searchParamsTypeId, [], 0, 1, [
    { valueTypes: ['string', 'object'], objectFieldValueType: 'string' }
  ]),
  receiverCall(searchParamsTypeId, 'append', ['receiver', 'string-view', 'string-view'], 'append', 'void', null, false, [stringArgument(), stringArgument()]),
  receiverCall(searchParamsTypeId, 'delete', ['receiver', 'string-view'], 'remove', 'void', null, false, [stringArgument()]),
  receiverCall(searchParamsTypeId, 'get', ['receiver', 'string-view'], 'get', 'string', 'inox::Value', true, [stringArgument()]),
  receiverCall(searchParamsTypeId, 'has', ['receiver', 'string-view'], 'has', 'boolean', 'bool', false, [stringArgument()]),
  receiverCall(searchParamsTypeId, 'set', ['receiver', 'string-view', 'string-view'], 'set', 'void', null, false, [stringArgument(), stringArgument()]),
  receiverCall(searchParamsTypeId, 'toString', ['receiver'], 'toString', 'string', 'inox::String', false, []),
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
  resultTypeId?: string
  resultShapeFields?: LibraryResultShapeFieldDescriptor[]
}

function moduleCall(
  name: string,
  cArgumentKinds: LibraryCArgumentKind[],
  cExpression: string,
  cppType: string,
  valueType: string,
  options: ModuleCallOptions = {}
): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: moduleBinding(name),
    bindingAliases: [moduleDefaultBinding(name)],
    operationId: `${libraryId}#${name}`,
    kind: 'call',
    runtimeRequirements: [runtimeRequirement],
    cExpression,
    cArgumentKinds,
    resultShapeFields: options.resultShapeFields,
    resultTypeId: options.resultTypeId,
    cCallStyle: 'function',
    cFailureMode: 'thrown',
    minArgs: options.minArgs,
    maxArgs: options.maxArgs,
    argumentChecks: options.argumentChecks,
    cppType,
    valueType,
    owned: false,
    nullable: false
  }
}

function constructorOperation(
  name: string,
  cArgumentKinds: LibraryCArgumentKind[],
  cExpression: string,
  cppType: string,
  resultTypeId: string,
  resultShapeFields: LibraryResultShapeFieldDescriptor[],
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
    runtimeRequirements: [runtimeRequirement],
    cExpression,
    cArgumentKinds,
    resultShapeFields,
    resultTypeId,
    cCallStyle: 'function',
    cFailureMode: name === 'URLSearchParams' ? 'invalid-result' : 'thrown',
    minArgs,
    maxArgs,
    argumentChecks,
    cppType,
    valueType: 'object',
    owned: false,
    nullable: false
  }
}

function receiverCall(
  receiverTypeId: string,
  name: string,
  cArgumentKinds: LibraryCArgumentKind[],
  cExpression: string,
  valueType: string,
  cppType: string | null = null,
  nullable = false,
  argumentChecks: LibraryArgumentCheckDescriptor[] = []
): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: receiverBinding(receiverTypeId, name),
    operationId: `${receiverTypeId}#${name}`,
    kind: 'call',
    runtimeRequirements: [runtimeRequirement],
    receiverTypeId,
    cExpression,
    cArgumentKinds,
    cCallStyle: 'member',
    cFailureMode: 'thrown',
    minArgs: argumentChecks.length,
    maxArgs: argumentChecks.length,
    argumentChecks,
    cppType: cppType ?? (valueType === 'void' ? 'void' : null),
    valueType,
    owned: false,
    nullable
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
    runtimeRequirements: [runtimeRequirement],
    receiverTypeId,
    cExpression: null,
    cppType: 'inox::String',
    valueType: field.valueType,
    owned: false,
    nullable: false
  }
}

function receiverMemberWrite(
  receiverTypeId: string,
  field: string,
  cExpression: string
): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: receiverBinding(receiverTypeId, field),
    operationId: `${receiverTypeId}#write:${field}`,
    kind: 'member-write',
    runtimeRequirements: [runtimeRequirement],
    receiverTypeId,
    cExpression,
    cArgumentKinds: ['receiver', 'value'],
    cCallStyle: 'member',
    cFailureMode: 'thrown',
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [stringArgument()],
    cppType: 'void',
    valueType: 'string',
    owned: false,
    nullable: false
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
    cppType: null,
    valueType: null,
    owned: false,
    diagnosticCode: 'INOX_NOT_IMPLEMENTED',
    diagnosticMessage: `node:url ${name} is not implemented by the current C backend`
  }
}

function stringField(name: string, readonly: boolean): LibraryResultShapeFieldDescriptor {
  return { name, valueType: 'string', readonly }
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
