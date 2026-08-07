import type {
  CompilerLibraryPackageDescriptor,
  LibraryArgumentCheckDescriptor,
  LibraryOperationDescriptor,
  LibraryOperationVariantDescriptor,
  NominalTypeRef,
  TypeRef
} from '../../../../../compiler/extensions/types.ts'
import { lookupAddressTypeRef, moduleBinding } from '../../compiler/index.ts'

const libraryId = 'node:dns/promises'
const dnsLibraryId = 'node:dns'
const promiseTypeId = 'global:promise#Promise'
const errorTypeId = 'global:error#Error'

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: ['global:error', 'global:promise', dnsLibraryId],
  operations: [lookupOperation()],
  intrinsicBindings: [],
  runtimeRequirements: []
}

function lookupOperation(): LibraryOperationDescriptor {
  const options = lookupOptionsArgument()

  return {
    libraryId,
    bindingId: moduleBinding(libraryId, 'lookup'),
    bindingAliases: [
      moduleBinding(libraryId, 'default.lookup'),
      moduleBinding(dnsLibraryId, 'promises.lookup'),
      moduleBinding(dnsLibraryId, 'default.promises.lookup')
    ],
    operationId: `${libraryId}#lookup`,
    kind: 'call',
    runtimeRequirements: [dnsLibraryId, 'global:promise#promise'],
    cExpression: 'dns.promises.lookup',
    cFailureMode: null,
    minArgs: 1,
    maxArgs: 2,
    argumentChecks: [stringArgument(), { valueTypes: ['number', 'object'] }],
    variants: [
      variant(1, ['string-view'], [stringArgument()]),
      variant(2, ['string-view', 'number'], [stringArgument(), numberArgument()], {
        argumentIndex: 1,
        argumentValueTypes: ['number']
      }),
      variant(2, ['string-view', 'value'], [stringArgument(), options], {
        argumentIndex: 1,
        argumentValueTypes: ['object'],
        cArgumentAdapters: ['', 'DnsLookupOptions($value)']
      })
    ],
    resultTypeRef: promiseTypeRef(lookupAddressTypeRef)
  }
}

function variant(
  argumentCount: number,
  cArgumentKinds: LibraryOperationVariantDescriptor['cArgumentKinds'],
  argumentChecks: LibraryArgumentCheckDescriptor[],
  options: Partial<LibraryOperationVariantDescriptor> = {}
): LibraryOperationVariantDescriptor {
  return {
    minArgs: argumentCount,
    maxArgs: argumentCount,
    cArgumentKinds,
    argumentChecks,
    resultTypeRef: promiseTypeRef(lookupAddressTypeRef),
    ...options
  }
}

function promiseTypeRef(fulfilledType: TypeRef): NominalTypeRef {
  const rejectedType: NominalTypeRef = {
    kind: 'nominal',
    typeId: errorTypeId,
    args: [],
    nullable: false,
    ownership: 'value',
    traits: []
  }

  return {
    kind: 'nominal',
    typeId: promiseTypeId,
    args: [fulfilledType],
    nullable: false,
    ownership: 'value',
    traits: [{ traitId: 'awaitable', args: [fulfilledType, rejectedType] }]
  }
}

function lookupOptionsArgument(): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['object'],
    objectLiteralFields: [{ name: 'family', valueTypes: ['number'], optional: true }]
  }
}

function stringArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['string'] }
}

function numberArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['number'] }
}
