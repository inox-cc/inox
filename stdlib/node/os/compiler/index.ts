import type {
  CompilerLibraryPackageDescriptor,
  LibraryCResultMappingDescriptor,
  LibraryOperationDescriptor,
  PrimitiveTypeRef
} from '../../../../compiler/extensions/types.ts'
const nodeOsLibraryId = 'node:os'
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
  'freemem',
  'getPriority',
  'loadavg',
  'networkInterfaces',
  'setPriority',
  'totalmem',
  'uptime',
  'userInfo'
]

const operations: LibraryOperationDescriptor[] = [
  operation('EOL', 'member-read'),
  operation('devNull', 'member-read'),
  operation('availableParallelism', 'call', numberTypeRef),
  operation('arch', 'call'),
  operation('endianness', 'call'),
  operation('homedir', 'call'),
  operation('hostname', 'call'),
  operation('machine', 'call'),
  operation('platform', 'call'),
  operation('release', 'call'),
  operation('tmpdir', 'call'),
  operation('type', 'call'),
  operation('version', 'call')
]

for (const name of unsupportedOsRuntimeMethods) {
  operations.push(unsupportedOperation(name))
}

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: nodeOsLibraryId,
  dependencies: [],
  operations,
  intrinsicBindings: [],
  runtimeRequirements: [
    {
      id: nodeOsRuntimeRequirement,
      dependencies: ['managed-values', 'string-bytes'],
      cPreludeIncludes: ['inox/os.h'],
      capabilities: ['node:os']
    }
  ]
}

function operation(
  name: string,
  kind: 'call' | 'member-read',
  resultTypeRef: PrimitiveTypeRef = stringTypeRef
): LibraryOperationDescriptor {
  const cExpression = `os.${name}`
  const returnsString = resultTypeRef.name === 'string'

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
