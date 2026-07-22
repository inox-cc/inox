import type {
  CompilerLibraryPackageDescriptor,
  LibraryCArgumentKind,
  LibraryCResultMappingDescriptor,
  LibraryOperationDescriptor,
  ObjectTypeRef,
  PrimitiveTypeRef,
  TypeRef
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'node:path'
const runtimeRequirement = 'node:path'
const booleanTypeRef: PrimitiveTypeRef = primitiveTypeRef('boolean')
const stringTypeRef: PrimitiveTypeRef = primitiveTypeRef('string')
const stringCResultMapping: LibraryCResultMappingDescriptor = {
  cppType: 'inox::String',
  fields: []
}
const parseTypeRef: ObjectTypeRef = {
  kind: 'object',
  fields: ['root', 'dir', 'base', 'ext', 'name'].map((name) => ({
    name,
    typeRef: stringTypeRef,
    readonly: true
  })),
  nullable: false,
  ownership: 'value',
  traits: []
}
const parseCResultMapping: LibraryCResultMappingDescriptor = {
  cppType: 'inox::Value',
  fields: []
}
const operations: LibraryOperationDescriptor[] = [
  constantOperation('delimiter', ':'),
  constantOperation('sep', '/'),
  callOperation(
    'basename',
    ['string-view', 'optional-string-view', 'argument-presence'],
    stringTypeRef,
    stringCResultMapping
  ),
  callOperation('dirname', ['string-view'], stringTypeRef, stringCResultMapping),
  callOperation('extname', ['string-view'], stringTypeRef, stringCResultMapping),
  callOperation('format', ['value'], stringTypeRef, stringCResultMapping),
  callOperation('isAbsolute', ['string-view'], booleanTypeRef),
  callOperation('join', ['variadic-string-view-array', 'variadic-count'], stringTypeRef, stringCResultMapping),
  callOperation('normalize', ['string-view'], stringTypeRef, stringCResultMapping),
  callOperation('parse', ['string-view', 'result-shape'], parseTypeRef, parseCResultMapping),
  callOperation('relative', ['string-view', 'string-view'], stringTypeRef, stringCResultMapping),
  callOperation('resolve', ['variadic-string-view-array', 'variadic-count'], stringTypeRef, stringCResultMapping),
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
  resultTypeRef: TypeRef,
  cResultMapping?: LibraryCResultMappingDescriptor
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
    resultTypeRef,
    cResultMapping,
    constantValue: null
  }
}

function primitiveTypeRef(name: 'boolean' | 'string'): PrimitiveTypeRef {
  return {
    kind: 'primitive',
    name,
    nullable: false,
    ownership: 'value',
    traits: []
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
    resultTypeRef: stringTypeRef,
    cResultMapping: stringCResultMapping,
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
