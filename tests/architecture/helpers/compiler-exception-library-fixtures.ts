import type { CompilerLibraryDescriptor, NominalTypeRef } from '../../../compiler/extensions/types.ts'

export function fixtureExceptionLibrary(): CompilerLibraryDescriptor {
  const typeRef = fixtureExceptionTypeRef()

  return {
    id: 'fixture:fault',
    dependencies: [],
    declarations: [
      {
        libraryId: 'fixture:fault',
        kind: 'global',
        source: 'tests/architecture/fixtures/fault.d.ts',
        declarationSource: `
          export {}
          declare global {
            class Fault {
              readonly detail: string;
              constructor(detail: string);
            }
          }
        `,
        compilerImplemented: true
      }
    ],
    nativeTypes: [
      {
        libraryId: 'fixture:fault',
        typeId: 'fixture:fault#Fault',
        declarationNames: ['Fault'],
        valueType: 'object',
        cppType: 'Fault',
        baseTypeIds: [],
        runtimeRequirements: ['fixture:fault'],
        fields: [{ name: 'detail', valueType: 'string', readonly: true, cMember: 'detail' }]
      }
    ],
    operations: [
      {
        libraryId: 'fixture:fault',
        bindingId: 'global:Fault',
        operationId: 'fixture:fault#construct',
        kind: 'construct',
        runtimeRequirements: ['fixture:fault'],
        cExpression: 'Fault',
        cArgumentKinds: ['string-view'],
        cResultMode: 'value',
        resultTypeRef: typeRef,
        minArgs: 1,
        maxArgs: 1,
        argumentChecks: [{ valueTypes: ['string'] }]
      }
    ],
    intrinsicBindings: [{ role: 'exception-value', bindingId: 'global:Fault' }],
    runtimeRequirements: [
      {
        id: 'fixture:fault',
        dependencies: ['managed-values', 'objects'],
        cPreludeIncludes: ['fixture/fault.h'],
        capabilities: []
      }
    ]
  }
}

function fixtureExceptionTypeRef(): NominalTypeRef {
  return {
    kind: 'nominal',
    typeId: 'fixture:fault#Fault',
    args: [],
    nullable: false,
    ownership: 'value',
    traits: []
  }
}
