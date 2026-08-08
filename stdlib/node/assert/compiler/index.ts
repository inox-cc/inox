import type {
  CompilerLibraryPackageDescriptor,
  LibraryArgumentCheckDescriptor,
  LibraryCArgumentKind,
  LibraryOperationDescriptor,
  LibraryOperationVariantDescriptor,
  PrimitiveTypeRef,
  UnknownTypeRef
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'node:assert'
const runtimeRequirement = libraryId
const runtimeRequirements = [runtimeRequirement]
const voidTypeRef = primitiveTypeRef('void')

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: ['global:binary', 'global:collections', 'global:error', 'global:strings'],
  operations: createAssertOperations(libraryId),
  intrinsicBindings: [],
  runtimeRequirements: [
    {
      id: runtimeRequirement,
      dependencies: [
        'callback-values',
        'global:binary',
        'global:collections#array',
        'global:collections#map',
        'global:collections#set',
        'global:error',
        'managed-values',
        'objects',
        'string-bytes'
      ],
      cPreludeIncludes: ['inox/assert.h'],
      capabilities: []
    }
  ]
}

export function createAssertOperations(ownerLibraryId: string): LibraryOperationDescriptor[] {
  return [
    assertionOperation(ownerLibraryId, null, 'nodeAssert', 1, [runtimeValueArgument()]),
    assertionOperation(ownerLibraryId, 'ok', 'nodeAssert.ok', 1, [runtimeValueArgument()]),
    assertionOperation(ownerLibraryId, 'strictEqual', 'nodeAssert.strictEqual', 2, [
      runtimeValueArgument(),
      runtimeValueArgument()
    ]),
    assertionOperation(ownerLibraryId, 'notStrictEqual', 'nodeAssert.notStrictEqual', 2, [
      runtimeValueArgument(),
      runtimeValueArgument()
    ]),
    assertionOperation(ownerLibraryId, 'deepStrictEqual', 'nodeAssert.deepStrictEqual', 2, [
      runtimeValueArgument(),
      runtimeValueArgument()
    ]),
    assertionOperation(ownerLibraryId, 'notDeepStrictEqual', 'nodeAssert.notDeepStrictEqual', 2, [
      runtimeValueArgument(),
      runtimeValueArgument()
    ]),
    assertionOperation(ownerLibraryId, 'fail', 'nodeAssert.fail', 0, []),
    assertionOperation(ownerLibraryId, 'throws', 'nodeAssert.throws', 1, [callbackArgument()]),
    assertionOperation(ownerLibraryId, 'doesNotThrow', 'nodeAssert.doesNotThrow', 1, [callbackArgument()])
  ]
}

function assertionOperation(
  ownerLibraryId: string,
  name: string | null,
  cExpression: string,
  requiredArgs: number,
  argumentChecks: LibraryArgumentCheckDescriptor[]
): LibraryOperationDescriptor {
  const bindingId = name === null ? moduleBinding(ownerLibraryId, 'default') : moduleBinding(ownerLibraryId, name)
  const bindingAliases = name === null ? [] : [moduleBinding(ownerLibraryId, `default.${name}`)]
  const cArgumentKinds: LibraryCArgumentKind[] = []

  for (const argument of argumentChecks) {
    cArgumentKinds.push(argument.valueTypes.includes('function') ? 'runtime-callback' : 'runtime-value')
  }

  return {
    libraryId: ownerLibraryId,
    bindingId,
    bindingAliases,
    operationId: `${ownerLibraryId}#${name ?? 'default'}`,
    kind: 'call',
    runtimeRequirements,
    cExpression,
    cFailureMode: 'thrown',
    minArgs: requiredArgs,
    maxArgs: requiredArgs + 1,
    argumentChecks: [...argumentChecks, stringArgument()],
    variants: messageVariants(cExpression, requiredArgs, cArgumentKinds, argumentChecks),
    resultTypeRef: voidTypeRef,
    callbackLifetime: name === 'throws' || name === 'doesNotThrow' ? 'call' : null
  }
}

function messageVariants(
  cExpression: string,
  requiredArgs: number,
  cArgumentKinds: LibraryCArgumentKind[],
  argumentChecks: LibraryArgumentCheckDescriptor[]
): LibraryOperationVariantDescriptor[] {
  return [
    {
      minArgs: requiredArgs,
      maxArgs: requiredArgs,
      cExpression,
      cArgumentKinds,
      argumentChecks
    },
    {
      minArgs: requiredArgs + 1,
      maxArgs: requiredArgs + 1,
      cExpression,
      cArgumentKinds: [...cArgumentKinds, 'string-view'],
      argumentChecks: [...argumentChecks, stringArgument()]
    }
  ]
}

function runtimeValueArgument(): LibraryArgumentCheckDescriptor {
  const typeRef: UnknownTypeRef = {
    kind: 'unknown',
    nullable: true,
    ownership: 'value',
    traits: []
  }

  return { valueTypes: [], typeRef }
}

function callbackArgument(): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['function'],
    functionParameters: [],
    functionReturnType: 'void',
    functionAsync: false
  }
}

function stringArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['string'] }
}

function primitiveTypeRef(name: 'void'): PrimitiveTypeRef {
  return { kind: 'primitive', name, nullable: false, ownership: 'value', traits: [] }
}

function moduleBinding(ownerLibraryId: string, name: string): string {
  return `${ownerLibraryId}#module:${ownerLibraryId}:${name}`
}
