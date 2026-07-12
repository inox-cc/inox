import type {
  CompilerLibraryPackageDescriptor,
  LibraryArgumentCheckDescriptor,
  LibraryCArgumentKind,
  LibraryOperationDescriptor,
  LibraryResultShapeFieldDescriptor
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'node:child_process'
const runtimeRequirement = 'node:child_process'
const spawnSyncResultFields: LibraryResultShapeFieldDescriptor[] = [
  resultField('status', 'number'),
  resultField('stdout', 'string'),
  resultField('stderr', 'string')
]

const operations: LibraryOperationDescriptor[] = [
  callOperation('execSync', ['string-view', 'value'], 'inox::String', 'string', 2, 2, [
    stringArgument(),
    objectArgument()
  ]),
  callOperation(
    'execFileSync',
    ['string-view', 'optional-string-view-array', 'string-view-array-count', 'value'],
    'inox::String',
    'string',
    2,
    3,
    [stringArgument(), stringArrayOrObjectArgument(), objectArgument()]
  ),
  callOperation(
    'spawnSync',
    ['string-view', 'string-view-array', 'string-view-array-count', 'value'],
    'inox::Value',
    'object',
    3,
    3,
    [stringArgument(), stringArrayArgument(), objectArgument()],
    spawnSyncResultFields
  ),
  unsupportedOperation('exec'),
  unsupportedOperation('execFile'),
  unsupportedOperation('fork'),
  unsupportedOperation('spawn')
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
      cPreludeIncludes: ['inox/child_process.h'],
      capabilities: []
    }
  ]
}

function callOperation(
  name: string,
  cArgumentKinds: LibraryCArgumentKind[],
  cppType: string,
  valueType: string,
  minArgs: number,
  maxArgs: number,
  argumentChecks: LibraryArgumentCheckDescriptor[],
  resultShapeFields?: LibraryResultShapeFieldDescriptor[]
): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: binding(name),
    bindingAliases: [defaultBinding(name)],
    operationId: `${libraryId}#${name}`,
    kind: 'call',
    runtimeRequirements: [runtimeRequirement],
    cExpression: `child_process.${name}`,
    cArgumentKinds,
    resultShapeFields,
    cCallStyle: 'function',
    cFailureMode: 'thrown',
    minArgs,
    maxArgs,
    argumentChecks,
    cppType,
    valueType,
    owned: false,
    nullable: false
  }
}

function unsupportedOperation(name: string): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: binding(name),
    bindingAliases: [defaultBinding(name)],
    operationId: `${libraryId}#${name}`,
    kind: 'call',
    runtimeRequirements: [],
    cExpression: null,
    cppType: null,
    valueType: null,
    owned: false,
    diagnosticCode: 'INOX_NOT_IMPLEMENTED',
    diagnosticMessage: `node:child_process ${name} is not implemented by the current C backend`
  }
}

function stringArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['string'] }
}

function objectArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['object'] }
}

function stringArrayArgument(): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['array'],
    arrayLiteralRequired: true,
    arrayElementValueTypes: ['string']
  }
}

function stringArrayOrObjectArgument(): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['array', 'object'],
    arrayLiteralRequired: true,
    arrayElementValueTypes: ['string']
  }
}

function resultField(name: string, valueType: string): LibraryResultShapeFieldDescriptor {
  return { name, valueType, readonly: true }
}

function binding(name: string): string {
  return `${libraryId}#module:${libraryId}:${name}`
}

function defaultBinding(name: string): string {
  return `${libraryId}#module:${libraryId}:default.${name}`
}
