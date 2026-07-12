import type {
  CompilerLibraryPackageDescriptor,
  LibraryCArgumentKind,
  LibraryOperationDescriptor
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'node:path'
const runtimeRequirement = 'node:path'
const resultShapeFields = [
  resultStringField('root'),
  resultStringField('dir'),
  resultStringField('base'),
  resultStringField('ext'),
  resultStringField('name')
]
const operations: LibraryOperationDescriptor[] = [
  constantOperation('delimiter', ':'),
  constantOperation('sep', '/'),
  callOperation('basename', ['string-view', 'optional-string-view', 'argument-presence'], 'inox::String', 'string'),
  callOperation('dirname', ['string-view'], 'inox::String', 'string'),
  callOperation('extname', ['string-view'], 'inox::String', 'string'),
  callOperation('format', ['value'], 'inox::String', 'string'),
  callOperation('isAbsolute', ['string-view'], 'bool', 'boolean'),
  callOperation('join', ['variadic-string-view-array', 'variadic-count'], 'inox::String', 'string'),
  callOperation('normalize', ['string-view'], 'inox::String', 'string'),
  callOperation('parse', ['string-view', 'result-shape'], 'inox::Value', 'object', resultShapeFields),
  callOperation('relative', ['string-view', 'string-view'], 'inox::String', 'string'),
  callOperation('resolve', ['variadic-string-view-array', 'variadic-count'], 'inox::String', 'string'),
  unsupportedOperation('matchesGlob', 'call'),
  unsupportedOperation('toNamespacedPath', 'call'),
  unsupportedOperation('win32', 'member-read')
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
      cPreludeIncludes: ['inox/path.h'],
      capabilities: []
    }
  ]
}

function callOperation(
  name: string,
  cArgumentKinds: LibraryCArgumentKind[],
  cppType: string,
  valueType: string,
  resultShapeFields?: { name: string; valueType: string; readonly: boolean }[]
): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: binding(name),
    bindingAliases: bindingAliases(name),
    operationId: `${libraryId}#${name}`,
    kind: 'call',
    runtimeRequirements: [runtimeRequirement],
    cExpression: `path.${name}`,
    cArgumentKinds,
    resultShapeFields,
    cppType,
    valueType,
    owned: false,
    constantValue: null
  }
}

function resultStringField(name: string): { name: string; valueType: string; readonly: boolean } {
  return {
    name,
    valueType: 'string',
    readonly: true
  }
}

function constantOperation(name: string, value: string): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: binding(name),
    bindingAliases: bindingAliases(name),
    operationId: `${libraryId}#${name}`,
    kind: 'member-read',
    runtimeRequirements: [runtimeRequirement],
    cExpression: `path.${name}`,
    cppType: 'inox::String',
    valueType: 'string',
    owned: false,
    constantValue: value
  }
}

function unsupportedOperation(name: string, kind: 'call' | 'member-read'): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: binding(name),
    bindingAliases: bindingAliases(name),
    operationId: `${libraryId}#${name}`,
    kind,
    runtimeRequirements: [],
    cExpression: null,
    cppType: null,
    valueType: null,
    owned: false,
    constantValue: null,
    diagnosticCode: 'INOX_NOT_IMPLEMENTED',
    diagnosticMessage: `node:path ${name} is not implemented by the current C backend`
  }
}

function binding(name: string): string {
  return `${libraryId}#module:${libraryId}:${name}`
}

function bindingAliases(name: string): string[] {
  return [
    `${libraryId}#module:${libraryId}:default.${name}`,
    `${libraryId}#module:${libraryId}:posix.${name}`,
    `${libraryId}#module:${libraryId}:default.posix.${name}`
  ]
}
