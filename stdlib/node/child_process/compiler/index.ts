import type {
  CompilerLibraryPackageDescriptor,
  LibraryArgumentCheckDescriptor,
  LibraryCArgumentKind,
  LibraryCResultMappingDescriptor,
  LibraryOperationDescriptor,
  ObjectTypeRef,
  PrimitiveTypeRef,
  TypeRef
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'node:child_process'
const runtimeRequirement = 'node:child_process'
const numberTypeRef: PrimitiveTypeRef = primitiveTypeRef('number')
const stringTypeRef: PrimitiveTypeRef = primitiveTypeRef('string')
const stringCResultMapping: LibraryCResultMappingDescriptor = {
  cppType: 'inox::String',
  fields: []
}
const spawnSyncTypeRef: ObjectTypeRef = {
  kind: 'object',
  fields: [
    { name: 'status', typeRef: numberTypeRef, readonly: true },
    { name: 'stdout', typeRef: stringTypeRef, readonly: true },
    { name: 'stderr', typeRef: stringTypeRef, readonly: true }
  ],
  nullable: false,
  ownership: 'value',
  traits: []
}
const spawnSyncCResultMapping: LibraryCResultMappingDescriptor = {
  cppType: 'inox::Value',
  fields: []
}

const operations: LibraryOperationDescriptor[] = [
  callOperation('execSync', ['string-view', 'value'], stringTypeRef, stringCResultMapping, 2, 2, [
    stringArgument(),
    objectArgument()
  ]),
  callOperation(
    'execFileSync',
    ['string-view', 'optional-string-view-array', 'string-view-array-count', 'value'],
    stringTypeRef,
    stringCResultMapping,
    2,
    3,
    [stringArgument(), stringArrayOrObjectArgument(), objectArgument()]
  ),
  callOperation(
    'spawnSync',
    ['string-view', 'string-view-array', 'string-view-array-count', 'value'],
    spawnSyncTypeRef,
    spawnSyncCResultMapping,
    3,
    3,
    [stringArgument(), stringArrayArgument(), objectArgument()]
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
  resultTypeRef: TypeRef,
  cResultMapping: LibraryCResultMappingDescriptor,
  minArgs: number,
  maxArgs: number,
  argumentChecks: LibraryArgumentCheckDescriptor[]
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
    cCallStyle: 'function',
    cFailureMode: 'thrown',
    minArgs,
    maxArgs,
    argumentChecks,
    resultTypeRef,
    cResultMapping
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
    valueTypes: ['object'],
    arrayLiteralRequired: true,
    arrayElementValueTypes: ['string']
  }
}

function stringArrayOrObjectArgument(): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['object'],
    arrayLiteralRequired: true,
    arrayElementValueTypes: ['string']
  }
}

function primitiveTypeRef(name: 'number' | 'string'): PrimitiveTypeRef {
  return {
    kind: 'primitive',
    name,
    nullable: false,
    ownership: 'value',
    traits: []
  }
}

function binding(name: string): string {
  return `${libraryId}#module:${libraryId}:${name}`
}

function defaultBinding(name: string): string {
  return `${libraryId}#module:${libraryId}:default.${name}`
}
