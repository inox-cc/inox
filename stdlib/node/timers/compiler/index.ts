import type {
  CompilerLibraryPackageDescriptor,
  LibraryArgumentCheckDescriptor,
  LibraryNativeTypeDescriptor,
  LibraryOperationDescriptor,
  NominalTypeRef,
  PrimitiveTypeRef
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'node:timers'
const runtimeRequirement = libraryId
const runtimeRequirements = [runtimeRequirement]
const voidTypeRef: PrimitiveTypeRef = {
  kind: 'primitive',
  name: 'void',
  nullable: false,
  ownership: 'value',
  traits: []
}

const handleTypes = [
  ['ImmediateHandle', 'clearImmediate'],
  ['IntervalHandle', 'clearInterval'],
  ['TimeoutHandle', 'clearTimeout']
] as const

const operations: LibraryOperationDescriptor[] = [
  startOperation('setImmediate', 'ImmediateHandle', false),
  startOperation('setInterval', 'IntervalHandle', true),
  startOperation('setTimeout', 'TimeoutHandle', true),
  clearOperation('clearImmediate', 'ImmediateHandle'),
  clearOperation('clearInterval', 'IntervalHandle'),
  clearOperation('clearTimeout', 'TimeoutHandle')
]

for (const [handleName] of handleTypes) {
  operations.push(unsupportedHandleOperation(handleName, 'ref'))
  operations.push(unsupportedHandleOperation(handleName, 'unref'))
}

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: [],
  nativeTypes: [
    handleNativeType('ImmediateHandle'),
    handleNativeType('IntervalHandle'),
    handleNativeType('TimeoutHandle')
  ],
  operations,
  intrinsicBindings: [],
  runtimeRequirements: [
    {
      id: runtimeRequirement,
      dependencies: ['async-runtime', 'callback-values', 'managed-values', 'objects'],
      cPreludeIncludes: ['inox/timers.h'],
      capabilities: ['timers']
    }
  ]
}

function handleNativeType(
  handleName: 'ImmediateHandle' | 'IntervalHandle' | 'TimeoutHandle'
): LibraryNativeTypeDescriptor {
  return {
    libraryId,
    typeId: handleTypeId(handleName),
    declarationNames: [handleName],
    valueType: 'object',
    cppType: handleName,
    baseTypeIds: [],
    runtimeRequirements
  }
}

function startOperation(
  name: 'setImmediate' | 'setInterval' | 'setTimeout',
  handleName: 'ImmediateHandle' | 'IntervalHandle' | 'TimeoutHandle',
  hasDelay: boolean
): LibraryOperationDescriptor {
  const argumentChecks = [callbackArgument()]
  const cArgumentKinds: Array<'runtime-callback' | 'number'> = ['runtime-callback']

  if (hasDelay) {
    argumentChecks.push({ valueTypes: ['number'] })
    cArgumentKinds.push('number')
  }

  const operation: LibraryOperationDescriptor = {
    libraryId,
    bindingId: moduleBinding(name),
    bindingAliases: [moduleBinding(`default.${name}`), `global:${name}`],
    operationId: `${libraryId}#${name}`,
    kind: 'call',
    runtimeRequirements,
    cExpression: `timers.${name}`,
    cArgumentKinds,
    callbackLifetime: 'event-loop',
    cFailureMode: 'thrown',
    minArgs: 1,
    maxArgs: argumentChecks.length,
    argumentChecks,
    resultTypeRef: handleTypeRef(handleName)
  }

  if (hasDelay) {
    operation.variants = [
      {
        minArgs: 1,
        maxArgs: 1,
        cExpression: `timers.${name}`,
        cArgumentKinds: ['runtime-callback']
      },
      {
        minArgs: 2,
        maxArgs: 2,
        cExpression: `timers.${name}`,
        cArgumentKinds: ['runtime-callback', 'number']
      }
    ]
  }

  return operation
}

function clearOperation(
  name: 'clearImmediate' | 'clearInterval' | 'clearTimeout',
  handleName: 'ImmediateHandle' | 'IntervalHandle' | 'TimeoutHandle'
): LibraryOperationDescriptor {
  const typeId = handleTypeId(handleName)

  return {
    libraryId,
    bindingId: moduleBinding(name),
    bindingAliases: [moduleBinding(`default.${name}`), `global:${name}`],
    operationId: `${libraryId}#${name}`,
    kind: 'call',
    runtimeRequirements,
    cExpression: `timers.${name}`,
    cArgumentKinds: ['value'],
    cArgumentAdapters: [`${handleName}(inox::Value($value))`],
    cArgumentAdapterTypeIds: [typeId],
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [{ valueTypes: ['object'], objectTypeIds: [typeId] }],
    resultTypeRef: voidTypeRef
  }
}

function unsupportedHandleOperation(
  handleName: 'ImmediateHandle' | 'IntervalHandle' | 'TimeoutHandle',
  name: 'ref' | 'unref'
): LibraryOperationDescriptor {
  const typeId = handleTypeId(handleName)

  return {
    libraryId,
    bindingId: `${typeId}.${name}`,
    operationId: `${typeId}.${name}`,
    kind: 'call',
    runtimeRequirements: [],
    receiverTypeId: typeId,
    cExpression: null,
    minArgs: 0,
    maxArgs: 0,
    argumentChecks: [],
    diagnosticCode: 'INOX_TIMER_REF_UNREF',
    diagnosticMessage:
      'timer handle ref() and unref() are not supported in the MVP; timer handles are referenced by default'
  }
}

function callbackArgument(): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['function'],
    functionParameters: [],
    functionReturnType: 'void',
    functionAsync: true
  }
}

function handleTypeId(handleName: string): string {
  return `${libraryId}#${handleName}`
}

function handleTypeRef(handleName: string): NominalTypeRef {
  return {
    kind: 'nominal',
    typeId: handleTypeId(handleName),
    args: [],
    nullable: false,
    ownership: 'value',
    traits: []
  }
}

function moduleBinding(name: string): string {
  return `${libraryId}#module:${libraryId}:${name}`
}
