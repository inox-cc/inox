import type {
  CompilerLibraryPackageDescriptor,
  LibraryOperationDescriptor,
  NominalTypeRef,
  PrimitiveTypeRef,
  TypeRef
} from '../../../../../compiler/extensions/types.ts'

const libraryId = 'node:timers/promises'
const promiseTypeId = 'global:promise#Promise'
const runtimeRequirement = libraryId
const runtimeRequirements = [runtimeRequirement]
const valueParameterTypeRef: TypeRef = { kind: 'parameter', name: 'T' }
const unknownTypeRef: TypeRef = {
  kind: 'unknown',
  nullable: false,
  ownership: 'value',
  traits: []
}
const voidTypeRef: PrimitiveTypeRef = {
  kind: 'primitive',
  name: 'void',
  nullable: false,
  ownership: 'value',
  traits: []
}

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: ['global:promise'],
  operations: [timeoutOperation(), immediateOperation()],
  intrinsicBindings: [],
  runtimeRequirements: [
    {
      id: runtimeRequirement,
      dependencies: ['global:promise#promise'],
      cPreludeIncludes: ['inox/timers_promises.h'],
      capabilities: ['timers']
    }
  ]
}

function timeoutOperation(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: moduleBinding('setTimeout'),
    bindingAliases: [moduleBinding('default.setTimeout')],
    operationId: `${libraryId}#setTimeout`,
    kind: 'call',
    runtimeRequirements,
    typeParameters: [{ name: 'T', sources: [{ source: 'argument-type', argumentIndex: 1 }] }],
    cExpression: 'timersPromises.setTimeout',
    cArgumentKinds: ['number', 'runtime-value'],
    cCallStyle: 'function',
    cResultMode: 'value',
    cFailureMode: null,
    resultTypeRef: promiseTypeRef(valueParameterTypeRef),
    minArgs: 0,
    maxArgs: 2,
    argumentChecks: [{ valueTypes: ['number'] }, { valueTypes: [], typeRef: valueParameterTypeRef }],
    variants: [
      {
        minArgs: 0,
        maxArgs: 0,
        cArgumentKinds: [],
        argumentChecks: [],
        resultTypeRef: promiseTypeRef(voidTypeRef)
      },
      {
        minArgs: 1,
        maxArgs: 1,
        cArgumentKinds: ['number'],
        argumentChecks: [{ valueTypes: ['number'] }],
        resultTypeRef: promiseTypeRef(voidTypeRef)
      },
      {
        minArgs: 2,
        maxArgs: 2,
        cArgumentKinds: ['number', 'runtime-value'],
        argumentChecks: [{ valueTypes: ['number'] }, { valueTypes: [], typeRef: valueParameterTypeRef }]
      }
    ]
  }
}

function immediateOperation(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: moduleBinding('setImmediate'),
    bindingAliases: [moduleBinding('default.setImmediate')],
    operationId: `${libraryId}#setImmediate`,
    kind: 'call',
    runtimeRequirements,
    typeParameters: [{ name: 'T', sources: [{ source: 'argument-type', argumentIndex: 0 }] }],
    cExpression: 'timersPromises.setImmediate',
    cArgumentKinds: ['runtime-value'],
    cCallStyle: 'function',
    cResultMode: 'value',
    cFailureMode: null,
    resultTypeRef: promiseTypeRef(valueParameterTypeRef),
    minArgs: 0,
    maxArgs: 1,
    argumentChecks: [{ valueTypes: [], typeRef: valueParameterTypeRef }],
    variants: [
      {
        minArgs: 0,
        maxArgs: 0,
        cArgumentKinds: [],
        argumentChecks: [],
        resultTypeRef: promiseTypeRef(voidTypeRef)
      },
      {
        minArgs: 1,
        maxArgs: 1,
        cArgumentKinds: ['runtime-value'],
        argumentChecks: [{ valueTypes: [], typeRef: valueParameterTypeRef }]
      }
    ]
  }
}

function promiseTypeRef(fulfilledType: TypeRef): NominalTypeRef {
  return {
    kind: 'nominal',
    typeId: promiseTypeId,
    args: [fulfilledType],
    nullable: false,
    ownership: 'value',
    traits: [{ traitId: 'awaitable', args: [fulfilledType, unknownTypeRef] }]
  }
}

function moduleBinding(name: string): string {
  return `${libraryId}#module:${libraryId}:${name}`
}
