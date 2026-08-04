import type {
  CompilerLibraryPackageDescriptor,
  CorePrimitiveType,
  LibraryArgumentCheckDescriptor,
  LibraryCArgumentKind,
  LibraryCResultMappingDescriptor,
  LibraryNativeTypeDescriptor,
  LibraryOperationDescriptor,
  LibraryOperationKind,
  LibraryResultShapeFieldDescriptor,
  NominalTypeRef,
  PrimitiveTypeRef,
  TypeRef
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'node:process'
const collectionsLibraryId = 'global:collections'
const arrayRuntimeRequirement = `${collectionsLibraryId}#array`
const arrayTypeId = `${collectionsLibraryId}#Array`
const runtimeRequirement = 'node:process'
const processTypeId = `${libraryId}#Process`
const argvTypeId = `${libraryId}#ProcessArgv`
const envTypeId = `${libraryId}#ProcessEnv`
const versionsTypeId = `${libraryId}#ProcessVersions`
const memoryUsageTypeId = `${libraryId}#ProcessMemoryUsage`
const stringTypeRef = primitiveTypeRef('string')
const numberTypeRef = primitiveTypeRef('number')
const voidTypeRef = primitiveTypeRef('void')
const stringResultMapping = cResultMapping('inox::String')

const versionsFields: LibraryResultShapeFieldDescriptor[] = [
  resultField('inox', 'string', 'inoxVersion', 'inox::String')
]
const argvFields: LibraryResultShapeFieldDescriptor[] = [resultField('length', 'number', 'length', 'double')]
const processFields: LibraryResultShapeFieldDescriptor[] = [
  resultField('arch', 'string', 'arch', 'inox::String'),
  objectResultField('argv', argvTypeId, 'ProcessArgv', 'argv', argvFields),
  resultField('argv0', 'string', 'argv0', 'inox::String'),
  objectResultField('env', envTypeId, 'ProcessEnv', 'env'),
  resultField('execPath', 'string', 'execPath', 'inox::String'),
  { name: 'exitCode', valueType: 'number', readonly: false, cMember: 'exitCode', cppType: 'double' },
  resultField('pid', 'number', 'pid', 'double'),
  resultField('platform', 'string', 'platform', 'inox::String'),
  resultField('version', 'string', 'version', 'inox::String'),
  objectResultField('versions', versionsTypeId, 'ProcessVersions', 'versions', versionsFields)
]
const memoryUsageFields: LibraryResultShapeFieldDescriptor[] = [
  resultField('rss', 'number', 'rss', 'double'),
  resultField('heapTotal', 'number', 'heapTotal', 'double'),
  resultField('heapUsed', 'number', 'heapUsed', 'double'),
  resultField('external', 'number', 'external', 'double'),
  resultField('arrayBuffers', 'number', 'arrayBuffers', 'double')
]

const operations: LibraryOperationDescriptor[] = [
  objectRead('process', 'process', nominalTypeRef(processTypeId), rootBindings()),
  propertyRead('arch', 'process.arch', stringTypeRef, stringResultMapping),
  objectRead('argv', 'process.argv', nominalTypeRef(argvTypeId)),
  propertyRead('argv.length', 'process.argv.length', numberTypeRef),
  propertyRead('argv0', 'process.argv0', stringTypeRef, stringResultMapping),
  objectRead('env', 'process.env', nominalTypeRef(envTypeId)),
  propertyRead('execPath', 'process.execPath', stringTypeRef, stringResultMapping),
  propertyRead('exitCode', 'process.exitCode', numberTypeRef),
  propertyRead('pid', 'process.pid', numberTypeRef),
  propertyRead('platform', 'process.platform', stringTypeRef, stringResultMapping),
  propertyRead('version', 'process.version', stringTypeRef, stringResultMapping),
  objectRead('versions', 'process.versions', nominalTypeRef(versionsTypeId)),
  propertyRead('versions.inox', 'process.versions.inoxVersion', stringTypeRef, stringResultMapping),
  callOperation('cwd', [], 'process.cwd', stringTypeRef, 0, 0, [], {
    cResultMapping: stringResultMapping
  }),
  callOperation('exit', ['optional-number'], 'process.exit', voidTypeRef, 0, 1, [numberArgument()]),
  callOperation('hrtime', ['optional-argument'], 'process.hrtime', arrayTypeRef(numberTypeRef), 0, 1, [
    arrayArgument()
  ]),
  callOperation('memoryUsage', [], 'process.memoryUsage', nominalTypeRef(memoryUsageTypeId), 0, 0, [], {
    cFailureMode: 'thrown'
  }),
  {
    libraryId,
    bindingId: moduleBinding('exitCode'),
    bindingAliases: memberBindingAliases('exitCode'),
    operationId: `${libraryId}#write:exitCode`,
    kind: 'member-write',
    runtimeRequirements: [runtimeRequirement],
    receiverTypeId: processTypeId,
    cExpression: 'exitCode',
    cArgumentKinds: ['receiver', 'number'],
    cCallStyle: 'member-assignment',
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [numberArgument()],
    resultTypeRef: numberTypeRef
  },
  {
    libraryId,
    bindingId: receiverBinding(argvTypeId, '*'),
    operationId: `${argvTypeId}#index-read`,
    kind: 'index-read',
    runtimeRequirements: [runtimeRequirement],
    receiverTypeId: argvTypeId,
    cExpression: 'operator[]',
    cArgumentKinds: ['receiver', 'number'],
    cCallStyle: 'index',
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [numberArgument()],
    resultTypeRef: stringTypeRef,
    cResultMapping: stringResultMapping
  },
  {
    libraryId,
    bindingId: receiverBinding(envTypeId, '*'),
    operationId: `${envTypeId}#member-read`,
    kind: 'member-read',
    runtimeRequirements: [runtimeRequirement],
    receiverTypeId: envTypeId,
    cExpression: 'operator[]',
    cArgumentKinds: ['receiver', 'member-name-string-view'],
    cCallStyle: 'index',
    resultTypeRef: stringTypeRef,
    cResultMapping: stringResultMapping
  },
  {
    libraryId,
    bindingId: receiverBinding(envTypeId, '*'),
    operationId: `${envTypeId}#index-read`,
    kind: 'index-read',
    runtimeRequirements: [runtimeRequirement],
    receiverTypeId: envTypeId,
    cExpression: 'operator[]',
    cArgumentKinds: ['receiver', 'member-name-string-view'],
    cCallStyle: 'index',
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [{ valueTypes: ['string'] }],
    resultTypeRef: stringTypeRef,
    cResultMapping: stringResultMapping
  },
  ...unsupportedMethods().map((name) => unsupportedOperation(name, 'call')),
  ...unsupportedProperties().map((name) => unsupportedOperation(name, 'member-read'))
]

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: [collectionsLibraryId],
  nativeTypes: [
    nativeType(processTypeId, ['ProcessModule', 'Process'], 'Process', processFields),
    nativeType(argvTypeId, ['ProcessArgv'], 'ProcessArgv', argvFields),
    nativeType(envTypeId, ['ProcessEnv'], 'ProcessEnv', []),
    nativeType(versionsTypeId, ['ProcessVersions'], 'ProcessVersions', versionsFields),
    nativeType(memoryUsageTypeId, ['ProcessMemoryUsage'], 'ProcessMemoryUsage', memoryUsageFields)
  ],
  operations,
  intrinsicBindings: [],
  runtimeRequirements: [
    {
      id: runtimeRequirement,
      dependencies: [arrayRuntimeRequirement, 'managed-values', 'objects', 'string-bytes'],
      cPreludeIncludes: ['inox/process.h'],
      capabilities: [],
      cEntrypointAdapter: {
        cFunction: 'inox::process_main',
        acceptsEntryPath: true
      }
    }
  ]
}

type CallResultOptions = {
  cResultMapping?: LibraryCResultMappingDescriptor
  cFailureMode?: LibraryOperationDescriptor['cFailureMode']
}

function callOperation(
  name: string,
  cArgumentKinds: LibraryCArgumentKind[],
  cExpression: string,
  resultTypeRef: TypeRef,
  minArgs: number,
  maxArgs: number,
  argumentChecks: LibraryArgumentCheckDescriptor[],
  options: CallResultOptions = {}
): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: moduleBinding(name),
    bindingAliases: memberBindingAliases(name),
    operationId: `${libraryId}#${name}`,
    kind: 'call',
    runtimeRequirements: [runtimeRequirement],
    cExpression,
    cArgumentKinds,
    resultTypeRef,
    cResultMapping: options.cResultMapping,
    cCallStyle: 'function',
    cFailureMode: options.cFailureMode ?? null,
    minArgs,
    maxArgs,
    argumentChecks
  }
}

function propertyRead(
  name: string,
  cExpression: string,
  resultTypeRef: TypeRef,
  cResultMapping?: LibraryCResultMappingDescriptor
): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: moduleBinding(name),
    bindingAliases: memberBindingAliases(name),
    operationId: `${libraryId}#read:${name}`,
    kind: 'member-read',
    runtimeRequirements: [runtimeRequirement],
    cExpression,
    resultTypeRef,
    cResultMapping
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

function objectRead(
  name: string,
  cExpression: string,
  resultTypeRef: NominalTypeRef,
  bindingAliases?: string[]
): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: name === 'process' ? moduleDefaultBinding() : moduleBinding(name),
    bindingAliases: bindingAliases ?? memberBindingAliases(name),
    operationId: `${libraryId}#read:${name}`,
    kind: 'member-read',
    runtimeRequirements: [runtimeRequirement],
    cExpression,
    resultTypeRef
  }
}

function nativeType(
  typeId: string,
  declarationNames: string[],
  cppType: string,
  fields: LibraryResultShapeFieldDescriptor[]
): LibraryNativeTypeDescriptor {
  return {
    libraryId,
    typeId,
    declarationNames,
    valueType: 'object',
    cppType,
    baseTypeIds: [],
    runtimeRequirements: [runtimeRequirement],
    fields
  }
}

function primitiveTypeRef(name: CorePrimitiveType): PrimitiveTypeRef {
  return {
    kind: 'primitive',
    name,
    nullable: false,
    ownership: 'value',
    traits: []
  }
}

function nominalTypeRef(typeId: string): NominalTypeRef {
  return {
    kind: 'nominal',
    typeId,
    args: [],
    nullable: false,
    ownership: 'value',
    traits: []
  }
}

function cResultMapping(cppType: string): LibraryCResultMappingDescriptor {
  return { cppType, fields: [] }
}

function unsupportedOperation(name: string, kind: LibraryOperationKind): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: moduleBinding(name),
    bindingAliases: memberBindingAliases(name),
    operationId: `${libraryId}#unsupported:${name}`,
    kind,
    runtimeRequirements: [],
    cExpression: null,
    diagnosticCode: 'INOX_NOT_IMPLEMENTED',
    diagnosticMessage: `node:process ${name} is not implemented by the current C++ backend`
  }
}

function resultField(
  name: string,
  valueType: string,
  cMember: string,
  cppType: string
): LibraryResultShapeFieldDescriptor {
  return { name, valueType, readonly: true, cMember, cppType }
}

function objectResultField(
  name: string,
  resultTypeId: string,
  cppType: string,
  cMember: string,
  resultShapeFields: LibraryResultShapeFieldDescriptor[] = []
): LibraryResultShapeFieldDescriptor {
  return {
    name,
    valueType: 'object',
    readonly: true,
    cMember,
    resultTypeId,
    resultShapeFields,
    cppType
  }
}

function numberArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['number'] }
}

function arrayArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['object'] }
}

function moduleBinding(name: string): string {
  return `${libraryId}#module:${libraryId}:${name}`
}

function moduleDefaultBinding(): string {
  return `${libraryId}#module:${libraryId}:default`
}

function memberBindingAliases(name: string): string[] {
  return [
    `${moduleDefaultBinding()}.${name}`,
    `${libraryId}#module:${libraryId}:process.${name}`,
    `global:process.${name}`
  ]
}

function rootBindings(): string[] {
  return [`${libraryId}#module:${libraryId}:process`, 'global:process']
}

function receiverBinding(receiverTypeId: string, name: string): string {
  return `${receiverTypeId}.${name}`
}

function unsupportedMethods(): string[] {
  return [
    'abort',
    'addListener',
    'chdir',
    'cpuUsage',
    'emit',
    'kill',
    'listenerCount',
    'nextTick',
    'off',
    'on',
    'once',
    'removeListener',
    'uptime'
  ]
}

function unsupportedProperties(): string[] {
  return ['stderr', 'stdin', 'stdout']
}
