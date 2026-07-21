import type {
  CompilerLibraryPackageDescriptor,
  LibraryArgumentCheckDescriptor,
  LibraryCArgumentKind,
  LibraryOperationDescriptor,
  NominalTypeRef,
  PrimitiveTypeRef,
  TypeRef
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'global:strings'
const collectionsLibraryId = 'global:collections'
const arrayRuntimeRequirement = `${collectionsLibraryId}#array`
const arrayTypeId = `${collectionsLibraryId}#Array`
const runtimeRequirement = `${libraryId}#strings`
const receiverTypeId = 'core:primitive:string'
const booleanTypeRef = primitiveTypeRef('boolean')
const numberTypeRef = primitiveTypeRef('number')
const stringTypeRef = primitiveTypeRef('string')
const stringResultMapping = { cppType: 'inox::String', fields: [] }

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: [collectionsLibraryId],
  operations: [
    numberToString(),
    memberRead('length', 'codeUnitLength', numberTypeRef, 'static_cast<double>($value)'),
    stringCall('charCodeAt', numberTypeRef, ['number'], [numberArgument()]),
    stringCall('concat', stringTypeRef, ['string-view'], [stringArgument()]),
    stringCall('endsWith', booleanTypeRef, ['string-view'], [stringArgument()]),
    stringCall(
      'includes',
      booleanTypeRef,
      ['string-view', 'optional-number'],
      [stringArgument(), numberArgument()],
      1
    ),
    stringCall(
      'indexOf',
      numberTypeRef,
      ['string-view', 'optional-number'],
      [stringArgument(), numberArgument()],
      1
    ),
    stringCall(
      'lastIndexOf',
      numberTypeRef,
      ['string-view', 'optional-number'],
      [stringArgument(), numberArgument()],
      1
    ),
    stringCall(
      'padStart',
      stringTypeRef,
      ['number', 'optional-string-view'],
      [numberArgument(), stringArgument()],
      1
    ),
    stringCall(
      'slice',
      stringTypeRef,
      ['number', 'optional-number'],
      [numberArgument(), numberArgument()],
      1
    ),
    stringCall('split', arrayTypeRef(stringTypeRef), ['string-view'], [stringArgument()]),
    stringCall('startsWith', booleanTypeRef, ['string-view'], [stringArgument()]),
    stringCall('toUpperCase', stringTypeRef, [], []),
    stringCall('trim', stringTypeRef, [], []),
    stringCall('trimEnd', stringTypeRef, [], []),
    stringCall('trimLeft', stringTypeRef, [], []),
    stringCall('trimRight', stringTypeRef, [], []),
    stringCall('trimStart', stringTypeRef, [], []),
    stringIndexRead(),
    unsupportedSubstring()
  ],
  intrinsicBindings: [],
  runtimeRequirements: [
    {
      id: runtimeRequirement,
      dependencies: [arrayRuntimeRequirement, 'managed-values', 'string-bytes'],
      cPreludeIncludes: ['inox/string.h'],
      capabilities: []
    }
  ]
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

function numberToString(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: 'core:primitive:number.toString',
    acceptsUnknownReceiver: true,
    operationId: `${libraryId}#Number.toString`,
    kind: 'call',
    runtimeRequirements: [runtimeRequirement],
    receiverTypeId: 'core:primitive:number',
    cExpression: 'inox::String::fromNumber',
    cArgumentKinds: ['receiver-number'],
    cCallStyle: 'function',
    cResultMode: 'value',
    cResultMapping: stringResultMapping,
    resultTypeRef: stringTypeRef,
    minArgs: 0,
    maxArgs: 1,
    argumentChecks: [numberArgument()],
    variants: [
      {
        minArgs: 1,
        maxArgs: 1,
        cExpression: 'inox::String::fromNumberRadix',
        cArgumentKinds: ['receiver-number', 'number'],
        cArgumentAdapters: ['(int)($value)']
      }
    ]
  }
}

function memberRead(
  name: string,
  cExpression: string,
  resultTypeRef: TypeRef,
  cResultAdapter: string | null = null
): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: receiverBinding(name),
    operationId: `${libraryId}#String.${name}`,
    kind: 'member-read',
    runtimeRequirements: [runtimeRequirement],
    receiverTypeId,
    cExpression,
    cArgumentKinds: ['receiver'],
    cReceiverAdapter: 'inox::String($bytes, $length)',
    cCallStyle: 'member',
    cResultAdapter,
    resultTypeRef
  }
}

function stringCall(
  name: string,
  resultTypeRef: TypeRef,
  argumentKinds: LibraryCArgumentKind[],
  argumentChecks: LibraryArgumentCheckDescriptor[],
  minArgs: number = argumentChecks.length
): LibraryOperationDescriptor {
  const operation: LibraryOperationDescriptor = {
    libraryId,
    bindingId: receiverBinding(name),
    acceptsUnknownReceiver: true,
    operationId: `${libraryId}#String.${name}`,
    kind: 'call',
    runtimeRequirements: [runtimeRequirement],
    receiverTypeId,
    cExpression: name,
    cArgumentKinds: ['receiver', ...argumentKinds],
    cReceiverAdapter: 'inox::String($bytes, $length)',
    cCallStyle: 'member',
    cFailureMode: 'thrown',
    cResultMode: 'value',
    resultTypeRef,
    minArgs,
    maxArgs: argumentChecks.length,
    argumentChecks
  }

  if (resultTypeRef.kind === 'primitive' && resultTypeRef.name === 'string') {
    operation.cResultMapping = stringResultMapping
  }

  return operation
}

function stringIndexRead(): LibraryOperationDescriptor {
  return {
    ...stringCall('slice', stringTypeRef, ['number', 'number'], [numberArgument()], 1),
    bindingId: receiverBinding('*'),
    operationId: `${libraryId}#String#index-read`,
    kind: 'index-read',
    cArgumentSources: [null, { argumentIndex: 0 }, { argumentIndex: 0 }],
    cArgumentAdapters: ['', '($value + 1)'],
    maxArgs: 1
  }
}

function unsupportedSubstring(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: receiverBinding('substring'),
    acceptsUnknownReceiver: true,
    operationId: `${libraryId}#String.substring`,
    kind: 'call',
    runtimeRequirements: [],
    receiverTypeId,
    resultTypeRef: stringTypeRef,
    minArgs: 0,
    maxArgs: 2,
    argumentChecks: [numberArgument(), numberArgument()],
    diagnosticCode: 'INOX_C_UNSUPPORTED_EXPR',
    diagnosticMessage: 'string.substring is not supported by the current C backend slice'
  }
}

function receiverBinding(name: string): string {
  return `${receiverTypeId}.${name}`
}

function stringArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['string'] }
}

function numberArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['number'] }
}

function primitiveTypeRef(name: 'boolean' | 'number' | 'string'): PrimitiveTypeRef {
  return {
    kind: 'primitive',
    name,
    nullable: false,
    ownership: 'value',
    traits: []
  }
}
