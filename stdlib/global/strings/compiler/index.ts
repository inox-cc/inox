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
const nullableStringTypeRef = primitiveTypeRef('string', true)
const stringTypeRef = primitiveTypeRef('string')
const stringResultMapping = { cppType: 'inox::String', fields: [] }

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: [collectionsLibraryId],
  operations: [
    numberToString(),
    memberRead('length', 'codeUnitLength', numberTypeRef, 'static_cast<double>($value)'),
    stringAt(),
    stringCall('charAt', stringTypeRef, ['number'], [numberArgument()]),
    stringCall('charCodeAt', numberTypeRef, ['number'], [numberArgument()], null),
    stringConcat(),
    stringCall(
      'endsWith',
      booleanTypeRef,
      ['string-view', 'optional-number'],
      [stringArgument(), numberArgument()],
      null,
      1
    ),
    stringCall(
      'includes',
      booleanTypeRef,
      ['string-view', 'optional-number'],
      [stringArgument(), numberArgument()],
      null,
      1
    ),
    stringCall(
      'indexOf',
      numberTypeRef,
      ['string-view', 'optional-number'],
      [stringArgument(), numberArgument()],
      null,
      1
    ),
    stringCall(
      'lastIndexOf',
      numberTypeRef,
      ['string-view', 'optional-number'],
      [stringArgument(), numberArgument()],
      null,
      1
    ),
    stringCall(
      'padEnd',
      stringTypeRef,
      ['number', 'optional-string-view'],
      [numberArgument(), stringArgument()],
      'thrown',
      1
    ),
    stringCall(
      'padStart',
      stringTypeRef,
      ['number', 'optional-string-view'],
      [numberArgument(), stringArgument()],
      'thrown',
      1
    ),
    stringCall('repeat', stringTypeRef, ['number'], [numberArgument()]),
    stringCall(
      'slice',
      stringTypeRef,
      ['optional-number', 'optional-number'],
      [numberArgument(), numberArgument()],
      'thrown',
      0
    ),
    stringSplit(),
    stringCall(
      'startsWith',
      booleanTypeRef,
      ['string-view', 'optional-number'],
      [stringArgument(), numberArgument()],
      null,
      1
    ),
    stringCall('toLowerCase', stringTypeRef, [], []),
    stringCall('toUpperCase', stringTypeRef, [], []),
    stringCall('trim', stringTypeRef, [], []),
    stringCall('trimEnd', stringTypeRef, [], []),
    stringCall('trimLeft', stringTypeRef, [], []),
    stringCall('trimRight', stringTypeRef, [], []),
    stringCall('trimStart', stringTypeRef, [], []),
    stringIndexRead(),
    stringCall(
      'substring',
      stringTypeRef,
      ['number', 'optional-number'],
      [numberArgument(), numberArgument()],
      'thrown',
      1
    )
  ],
  intrinsicBindings: [],
  runtimeRequirements: [
    {
      id: runtimeRequirement,
      dependencies: [arrayRuntimeRequirement, 'managed-values', 'string-bytes'],
      cPreludeIncludes: [],
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
    cFailureMode: 'thrown',
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
        cArgumentKinds: ['receiver-number', 'number']
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
    cPreservesPendingException: true,
    resultTypeRef
  }
}

function stringCall(
  name: string,
  resultTypeRef: TypeRef,
  argumentKinds: LibraryCArgumentKind[],
  argumentChecks: LibraryArgumentCheckDescriptor[],
  cFailureMode: LibraryOperationDescriptor['cFailureMode'] = 'thrown',
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
    cFailureMode,
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

function stringConcat(): LibraryOperationDescriptor {
  return {
    ...stringCall('concat', stringTypeRef, ['variadic-string-view-array', 'variadic-count'], [stringArgument()]),
    minArgs: 0,
    maxArgs: null,
    variants: [
      {
        minArgs: 1,
        maxArgs: 1,
        cArgumentKinds: ['receiver', 'string-view']
      }
    ]
  }
}

function stringAt(): LibraryOperationDescriptor {
  return {
    ...stringCall('at', nullableStringTypeRef, ['number'], [numberArgument()]),
    cResultMapping: { cppType: 'inox::Value', fields: [] }
  }
}

function stringSplit(): LibraryOperationDescriptor {
  return {
    ...stringCall(
      'split',
      arrayTypeRef(stringTypeRef),
      ['string-view', 'number'],
      [stringArgument(), numberArgument()],
      'thrown',
      0
    ),
    variants: [
      { minArgs: 0, maxArgs: 0, cArgumentKinds: ['receiver'] },
      { minArgs: 1, maxArgs: 1, cArgumentKinds: ['receiver', 'string-view'] }
    ]
  }
}

function stringIndexRead(): LibraryOperationDescriptor {
  return {
    ...stringCall('slice', stringTypeRef, ['number', 'number'], [numberArgument()], 'thrown', 1),
    bindingId: receiverBinding('*'),
    operationId: `${libraryId}#String#index-read`,
    kind: 'index-read',
    cArgumentSources: [null, { argumentIndex: 0 }, { argumentIndex: 0 }],
    cArgumentAdapters: ['', '($value + 1)'],
    maxArgs: 1
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

function primitiveTypeRef(name: 'boolean' | 'number' | 'string', nullable = false): PrimitiveTypeRef {
  return {
    kind: 'primitive',
    name,
    nullable,
    ownership: 'value',
    traits: []
  }
}
