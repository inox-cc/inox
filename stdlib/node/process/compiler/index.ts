import type {
  CompilerLibraryPackageDescriptor,
  LibraryArgumentCheckDescriptor,
  LibraryCArgumentKind,
  LibraryOperationDescriptor,
  LibraryOperationKind,
  LibraryResultShapeFieldDescriptor
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'node:process'
const runtimeRequirement = 'node:process'
const processTypeId = `${libraryId}#Process`
const argvTypeId = `${libraryId}#ProcessArgv`
const envTypeId = `${libraryId}#ProcessEnv`
const versionsTypeId = `${libraryId}#ProcessVersions`
const memoryUsageTypeId = `${libraryId}#ProcessMemoryUsage`

const versionsFields: LibraryResultShapeFieldDescriptor[] = [
  resultField('node', 'string')
]
const processFields: LibraryResultShapeFieldDescriptor[] = [
  resultField('version', 'string'),
  {
    name: 'versions',
    valueType: 'object',
    readonly: true,
    resultTypeId: versionsTypeId,
    resultShapeFields: versionsFields,
    cppType: 'inox::Value'
  }
]
const argvFields: LibraryResultShapeFieldDescriptor[] = [
  resultField('length', 'number')
]
const memoryUsageFields: LibraryResultShapeFieldDescriptor[] = [
  resultField('rss', 'number'),
  resultField('heapTotal', 'number'),
  resultField('heapUsed', 'number'),
  resultField('external', 'number'),
  resultField('arrayBuffers', 'number')
]

const operations: LibraryOperationDescriptor[] = [
  objectRead('process', 'process', 'inox::Value', processTypeId, processFields, rootBindings()),
  propertyRead('arch', 'process.arch', 'inox::String', 'string'),
  objectRead('argv', 'process.argv', 'process_argv', argvTypeId, argvFields),
  propertyRead('argv.length', 'process.argv.length', 'double', 'number'),
  propertyRead('argv0', 'process.argv0', 'inox::String', 'string'),
  objectRead('env', 'process.env', 'process_env', envTypeId, []),
  propertyRead('execPath', 'process.execPath', 'inox::String', 'string'),
  propertyRead('exitCode', 'process.exitCode', 'double', 'number'),
  propertyRead('pid', 'process.pid', 'double', 'number'),
  propertyRead('platform', 'process.platform', 'inox::String', 'string'),
  propertyRead('version', 'process.version', 'inox::String', 'string'),
  objectRead('versions', 'process.versions', 'inox::Value', versionsTypeId, versionsFields),
  propertyRead('versions.node', 'process.versions.node', 'inox::String', 'string'),
  callOperation('cwd', [], 'process.cwd', 'inox::String', 'string', 0, 0, []),
  callOperation('exit', ['optional-number'], 'process.exit', 'void', 'void', 0, 1, [numberArgument()]),
  callOperation(
    'hrtime',
    ['optional-argument'],
    'process.hrtime',
    'inox::Value',
    'array',
    0,
    1,
    [arrayArgument()],
    { resultArrayElementType: 'number' }
  ),
  callOperation(
    'memoryUsage',
    [],
    'process.memoryUsage',
    'inox::Value',
    'object',
    0,
    0,
    [],
    { resultTypeId: memoryUsageTypeId, resultShapeFields: memoryUsageFields }
  ),
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
    cppType: 'double',
    valueType: 'number',
    owned: false,
    nullable: false
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
    cppType: 'inox::String',
    valueType: 'string',
    owned: false,
    nullable: false
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
    cppType: 'inox::String',
    valueType: 'string',
    owned: false,
    nullable: false
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
    cppType: 'inox::String',
    valueType: 'string',
    owned: false,
    nullable: false
  },
  receiverMemberRead(processTypeId, 'version', 'string', 'inox::String'),
  receiverObjectRead(processTypeId, 'versions', versionsTypeId, versionsFields),
  receiverMemberRead(versionsTypeId, 'node', 'string', 'inox::String'),
  receiverMemberRead(argvTypeId, 'length', 'number', 'double'),
  ...unsupportedMethods().map((name) => unsupportedOperation(name, 'call')),
  ...unsupportedProperties().map((name) => unsupportedOperation(name, 'member-read'))
]

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: [],
  operations,
  intrinsicBindings: [],
  runtimeRequirements: [
    {
      id: runtimeRequirement,
      dependencies: ['collections', 'managed-values', 'objects', 'string-bytes'],
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
  resultArrayElementType?: string
  resultTypeId?: string
  resultShapeFields?: LibraryResultShapeFieldDescriptor[]
}

function callOperation(
  name: string,
  cArgumentKinds: LibraryCArgumentKind[],
  cExpression: string,
  cppType: string,
  valueType: string,
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
    resultShapeFields: options.resultShapeFields,
    resultArrayElementType: options.resultArrayElementType,
    resultTypeId: options.resultTypeId,
    cCallStyle: 'function',
    cFailureMode: valueType === 'object' ? 'thrown' : null,
    minArgs,
    maxArgs,
    argumentChecks,
    cppType,
    valueType,
    owned: false,
    nullable: false
  }
}

function propertyRead(
  name: string,
  cExpression: string,
  cppType: string,
  valueType: string
): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: moduleBinding(name),
    bindingAliases: memberBindingAliases(name),
    operationId: `${libraryId}#read:${name}`,
    kind: 'member-read',
    runtimeRequirements: [runtimeRequirement],
    cExpression,
    cppType,
    valueType,
    owned: false,
    nullable: false
  }
}

function objectRead(
  name: string,
  cExpression: string,
  cppType: string,
  resultTypeId: string,
  resultShapeFields: LibraryResultShapeFieldDescriptor[],
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
    resultTypeId,
    resultShapeFields,
    cppType,
    valueType: 'object',
    owned: false,
    nullable: false
  }
}

function receiverMemberRead(
  receiverTypeId: string,
  name: string,
  valueType: string,
  cppType: string
): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: receiverBinding(receiverTypeId, name),
    operationId: `${receiverTypeId}#read:${name}`,
    kind: 'member-read',
    runtimeRequirements: [runtimeRequirement],
    receiverTypeId,
    cExpression: null,
    cppType,
    valueType,
    owned: false,
    nullable: false
  }
}

function receiverObjectRead(
  receiverTypeId: string,
  name: string,
  resultTypeId: string,
  resultShapeFields: LibraryResultShapeFieldDescriptor[]
): LibraryOperationDescriptor {
  return {
    ...receiverMemberRead(receiverTypeId, name, 'object', 'inox::Value'),
    resultTypeId,
    resultShapeFields
  }
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
    cppType: null,
    valueType: null,
    owned: false,
    diagnosticCode: 'INOX_NOT_IMPLEMENTED',
    diagnosticMessage: `node:process ${name} is not implemented by the current C backend`
  }
}

function resultField(name: string, valueType: string): LibraryResultShapeFieldDescriptor {
  return { name, valueType, readonly: true }
}

function numberArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['number'] }
}

function arrayArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['array'] }
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
  return [
    `${libraryId}#module:${libraryId}:process`,
    'global:process'
  ]
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
