import type {
  CompilerLibraryPackageDescriptor,
  LibraryOperationDescriptor,
  TypeRef
} from '../../../../compiler/extensions/types.ts'
import { arrayTypeRef } from '../../collections/compiler/index.ts'

const libraryId = 'global:object'
const runtimeRequirement = `${libraryId}#object`
const stringTypeRef = primitiveTypeRef('string')
const unknownTypeRef: TypeRef = {
  kind: 'unknown',
  nullable: false,
  ownership: 'value',
  traits: []
}

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: ['global:collections'],
  operations: [
    objectOperation('keys', arrayTypeRef(stringTypeRef)),
    objectOperation('values', arrayTypeRef(unknownTypeRef)),
    objectOperation('entries', arrayTypeRef(arrayTypeRef(unknownTypeRef)))
  ],
  intrinsicBindings: [],
  runtimeRequirements: [
    {
      id: runtimeRequirement,
      dependencies: ['collections', 'managed-values', 'objects', 'string-bytes'],
      cPreludeIncludes: ['inox/object_global.h'],
      capabilities: []
    }
  ]
}

function objectOperation(name: string, resultTypeRef: TypeRef): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: `global:Object.${name}`,
    operationId: `${libraryId}#Object.${name}`,
    kind: 'call',
    runtimeRequirements: [runtimeRequirement],
    cExpression: `Object.${name}`,
    cArgumentKinds: ['runtime-value'],
    cFailureMode: 'thrown',
    cResultMode: 'value',
    resultTypeRef,
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [{ valueTypes: ['array', 'object', 'unknown'] }]
  }
}

function primitiveTypeRef(name: 'string'): TypeRef {
  return {
    kind: 'primitive',
    name,
    nullable: false,
    ownership: 'value',
    traits: []
  }
}
