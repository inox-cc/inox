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
const stringCResultMapping: LibraryCResultMappingDescriptor = {
  cppType: 'inox::String',
  fields: []
}
const unsupportedOsRuntimeMethods = [
  'availableParallelism',
  'cpus',
  'freemem',
  'getPriority',
  'loadavg',
  'machine',
  'networkInterfaces',
  'setPriority',
  'totalmem',
  'uptime',
  'userInfo',
  'version'
]

const operations: LibraryOperationDescriptor[] = [
  operation('EOL', 'member-read'),
  operation('arch', 'call'),
  operation('homedir', 'call'),
  operation('hostname', 'call'),
  operation('platform', 'call'),
  operation('release', 'call'),
  operation('tmpdir', 'call'),
  operation('type', 'call')
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

function operation(name: string, kind: 'call' | 'member-read'): LibraryOperationDescriptor {
  const cExpression = `os.${name}`
  let constantValue: string | null = null

  if (kind === 'member-read') {
    constantValue = '\n'
  }

  const descriptor: LibraryOperationDescriptor = {
    libraryId: nodeOsLibraryId,
    bindingId: `${nodeOsLibraryId}#module:${nodeOsLibraryId}:${name}`,
    bindingAliases: [`${nodeOsLibraryId}#module:${nodeOsLibraryId}:default.${name}`],
    operationId: `${nodeOsLibraryId}#${name}`,
    kind,
    runtimeRequirements: [nodeOsRuntimeRequirement],
    cExpression,
    resultTypeRef: stringTypeRef,
    cResultMapping: stringCResultMapping,
    constantValue
  }

  if (kind === 'call') {
    descriptor.cArgumentKinds = []
    descriptor.cFailureMode = 'thrown'
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
