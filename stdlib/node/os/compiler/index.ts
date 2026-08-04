import type {
  CompilerLibraryPackageDescriptor,
  LibraryCResultMappingDescriptor,
  LibraryOperationDescriptor,
  NominalTypeRef,
  PrimitiveTypeRef,
  TypeRef
} from '../../../../compiler/extensions/types.ts'
const nodeOsLibraryId = 'node:os'
const collectionsLibraryId = 'global:collections'
const arrayRuntimeRequirement = `${collectionsLibraryId}#array`
const arrayTypeId = `${collectionsLibraryId}#Array`
const nodeOsRuntimeRequirement = 'node:os'
const stringTypeRef: PrimitiveTypeRef = {
  kind: 'primitive',
  name: 'string',
  nullable: false,
  ownership: 'value',
  traits: []
}
const numberTypeRef: PrimitiveTypeRef = {
  kind: 'primitive',
  name: 'number',
  nullable: false,
  ownership: 'value',
  traits: []
}
const stringCResultMapping: LibraryCResultMappingDescriptor = {
  cppType: 'inox::String',
  fields: []
}
const unsupportedOsRuntimeMethods = [
  'cpus',
  'getPriority',
  'networkInterfaces',
  'setPriority',
  'userInfo'
]

const operations: LibraryOperationDescriptor[] = [
  operation('EOL', 'member-read'),
  operation('devNull', 'member-read'),
  operation('availableParallelism', 'call', numberTypeRef),
  operation('arch', 'call'),
  operation('endianness', 'call'),
  operation('freemem', 'call', numberTypeRef),
  operation('homedir', 'call'),
  operation('hostname', 'call'),
  {
    ...operation('loadavg', 'call', arrayTypeRef(numberTypeRef)),
    cFailureMode: 'thrown'
  },
  operation('machine', 'call'),
  operation('platform', 'call'),
  operation('release', 'call'),
  operation('tmpdir', 'call'),
  operation('totalmem', 'call', numberTypeRef),
  operation('type', 'call'),
  operation('uptime', 'call', numberTypeRef),
  operation('version', 'call')
]

for (const name of unsupportedOsRuntimeMethods) {
  operations.push(unsupportedOperation(name))
}

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: nodeOsLibraryId,
  dependencies: [collectionsLibraryId],
  operations,
  intrinsicBindings: [],
  runtimeRequirements: [
    {
      id: nodeOsRuntimeRequirement,
      dependencies: [arrayRuntimeRequirement, 'managed-values', 'string-bytes'],
      cPreludeIncludes: ['inox/os.h'],
      capabilities: ['node:os']
    }
  ]
}

function operation(
  name: string,
  kind: 'call' | 'member-read',
  resultTypeRef: TypeRef = stringTypeRef
): LibraryOperationDescriptor {
  const cExpression = `os.${name}`
  const returnsString = resultTypeRef.kind === 'primitive' && resultTypeRef.name === 'string'

  const descriptor: LibraryOperationDescriptor = {
    libraryId: nodeOsLibraryId,
    bindingId: `${nodeOsLibraryId}#module:${nodeOsLibraryId}:${name}`,
    bindingAliases: [`${nodeOsLibraryId}#module:${nodeOsLibraryId}:default.${name}`],
    operationId: `${nodeOsLibraryId}#${name}`,
    kind,
    runtimeRequirements: [nodeOsRuntimeRequirement],
    cExpression,
    resultTypeRef,
    cResultMapping: returnsString ? stringCResultMapping : undefined,
    constantValue: null
  }

  if (kind === 'call') {
    descriptor.cArgumentKinds = []
    descriptor.cFailureMode = returnsString ? 'thrown' : null
    descriptor.cPreservesPendingException = true
  }

  return descriptor
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

function unsupportedOperation(name: string): LibraryOperationDescriptor {
  return {
    libraryId: nodeOsLibraryId,
    bindingId: `${nodeOsLibraryId}#module:${nodeOsLibraryId}:${name}`,
    bindingAliases: [`${nodeOsLibraryId}#module:${nodeOsLibraryId}:default.${name}`],
    operationId: `${nodeOsLibraryId}#${name}`,
    kind: 'call',
    runtimeRequirements: [],
    cExpression: null,
    constantValue: null,
    diagnosticCode: 'INOX_NOT_IMPLEMENTED',
    diagnosticMessage: `node:os ${name} is not implemented by the current C++ backend`
  }
}
