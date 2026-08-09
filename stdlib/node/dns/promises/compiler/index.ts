import type {
  CompilerLibraryPackageDescriptor,
  LibraryArgumentCheckDescriptor,
  LibraryOperationDescriptor,
  LibraryOperationVariantDescriptor,
  NominalTypeRef,
  TypeRef
} from '../../../../../compiler/extensions/types.ts'
import {
  lookupAddressArrayTypeRef,
  lookupAddressTypeRef,
  lookupServiceResultTypeRef,
  moduleBinding
} from '../../compiler/index.ts'

const libraryId = 'node:dns/promises'
const dnsLibraryId = 'node:dns'
const promiseTypeId = 'global:promise#Promise'
const errorTypeId = 'global:error#Error'

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: ['global:error', 'global:promise', dnsLibraryId],
  operations: [lookupOperation(), lookupServiceOperation()],
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
      variant(1, ['string-view'], [stringArgument()], lookupAddressTypeRef),
      variant(2, ['string-view', 'number'], [stringArgument(), numberArgument()], lookupAddressTypeRef, {
        argumentIndex: 1,
        argumentValueTypes: ['number']
      }),
      variant(2, ['string-view', 'value'], [stringArgument(), lookupAllOptionsArgument()], lookupAddressArrayTypeRef, {
        argumentIndex: 1,
        argumentValueTypes: ['object'],
        objectFieldName: 'all',
        booleanLiterals: [true],
        cArgumentAdapters: ['', 'DnsLookupOptions($value)']
      }),
      variant(2, ['string-view', 'value'], [stringArgument(), options], lookupAddressTypeRef, {
        argumentIndex: 1,
        argumentValueTypes: ['object'],
        cArgumentAdapters: ['', 'DnsLookupOptions($value)']
      })
    ],
    resultTypeRef: promiseTypeRef(lookupAddressTypeRef)
  }
}

function lookupServiceOperation(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: moduleBinding(libraryId, 'lookupService'),
    bindingAliases: [
      moduleBinding(libraryId, 'default.lookupService'),
      moduleBinding(dnsLibraryId, 'promises.lookupService'),
      moduleBinding(dnsLibraryId, 'default.promises.lookupService')
    ],
    operationId: `${libraryId}#lookupService`,
    kind: 'call',
    runtimeRequirements: [dnsLibraryId, 'global:promise#promise'],
    cExpression: 'dns.promises.lookupService',
    cArgumentKinds: ['string-view', 'number'],
    cFailureMode: null,
    minArgs: 2,
    maxArgs: 2,
    argumentChecks: [stringArgument(), numberArgument()],
    resultTypeRef: promiseTypeRef(lookupServiceResultTypeRef)
  }
}

function variant(
  argumentCount: number,
  cArgumentKinds: LibraryOperationVariantDescriptor['cArgumentKinds'],
  argumentChecks: LibraryArgumentCheckDescriptor[],
  fulfilledType: TypeRef,
  options: Partial<LibraryOperationVariantDescriptor> = {}
): LibraryOperationVariantDescriptor {
  return {
    minArgs: argumentCount,
    maxArgs: argumentCount,
    cArgumentKinds,
    argumentChecks,
    resultTypeRef: promiseTypeRef(fulfilledType),
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
    objectLiteralFields: [
      { name: 'family', valueTypes: ['number'], optional: true },
      { name: 'all', valueTypes: ['boolean'], booleanLiterals: [false, true], optional: true },
      {
        name: 'order',
        valueTypes: ['string'],
        stringLiterals: ['verbatim', 'ipv4first', 'ipv6first'],
        optional: true
      }
    ]
  }
}

function lookupAllOptionsArgument(): LibraryArgumentCheckDescriptor {
  const options = lookupOptionsArgument()

  return {
    ...options,
    objectLiteralFields: options.objectLiteralFields?.map((field) =>
      field.name === 'all' ? { ...field, booleanLiterals: [true], optional: false } : field
    )
  }
}

function stringArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['string'] }
}

function numberArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['number'] }
}
