import type {
  CompilerLibraryNativeBuildDescriptor,
  CompilerLibraryPackageDescriptor,
  LibraryArgumentCheckDescriptor,
  LibraryCArgumentKind,
  LibraryCResultMappingDescriptor,
  LibraryOperationDescriptor,
  LibraryOperationVariantDescriptor,
  NominalTypeRef,
  ObjectTypeRef,
  PrimitiveTypeRef,
  TypeRef
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'mongodb'
const runtimeRequirement = libraryId
const objectIdTypeId = `${libraryId}#ObjectId`
const uint8ArrayTypeId = 'global:binary#Uint8Array'
const runtimeRequirements = [runtimeRequirement]
const objectIdTypeRef: NominalTypeRef = nominalTypeRef(objectIdTypeId)
const uint8ArrayTypeRef: NominalTypeRef = nominalTypeRef(uint8ArrayTypeId)
const booleanTypeRef: PrimitiveTypeRef = primitiveTypeRef('boolean')
const numberTypeRef: PrimitiveTypeRef = primitiveTypeRef('number')
const stringTypeRef: PrimitiveTypeRef = primitiveTypeRef('string')
const documentTypeRef: ObjectTypeRef = {
  kind: 'object',
  fields: [],
  dynamic: true,
  dynamicField: unknownTypeRef(),
  nullable: false,
  ownership: 'value',
  traits: []
}
const stringResultMapping: LibraryCResultMappingDescriptor = {
  cppType: 'inox::String',
  fields: []
}
const valueResultMapping: LibraryCResultMappingDescriptor = {
  cppType: 'inox::Value',
  fields: []
}

const operations: LibraryOperationDescriptor[] = [
  objectIdConstructor(),
  staticObjectIdCall(
    'createFromTime',
    ['number'],
    objectIdTypeRef,
    [numberArgument()],
    'MongoObjectId::createFromTime'
  ),
  staticObjectIdCall(
    'isValid',
    ['string-view-or-value'],
    booleanTypeRef,
    [stringOrObjectIdArgument()],
    'MongoObjectId::isValid',
    null
  ),
  objectIdReceiverCall('equals', ['receiver', 'string-view-or-value'], booleanTypeRef, [stringOrObjectIdArgument()]),
  objectIdReceiverCall('toString', ['receiver'], stringTypeRef, [], stringResultMapping),
  bsonCall('serialize', ['runtime-value'], uint8ArrayTypeRef, undefined, [documentArgument()]),
  bsonCall('deserialize', ['value'], documentTypeRef, valueResultMapping, [uint8ArrayArgument()])
]

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: ['global:binary', 'global:collections', 'global:time'],
  nativeTypes: [
    {
      libraryId,
      typeId: objectIdTypeId,
      declarationNames: ['ObjectId'],
      valueType: 'object',
      cppType: 'MongoObjectId',
      baseTypeIds: [],
      runtimeRequirements,
      cValueAdapter: 'MongoObjectId(inox::Value($value))',
      cValueAdapterFailureMode: 'thrown',
      cValueAdapterPreservesPendingException: true,
      cRuntimeValueExpression: '$value.runtimeValue().release()',
      cRuntimeValueOwnership: 'owned',
      cRuntimeValueValidExpression: 'MongoObjectId::isObjectId(inox::Value($value))'
    }
  ],
  operations,
  intrinsicBindings: [],
  runtimeRequirements: [
    {
      id: runtimeRequirement,
      dependencies: [
        'global:binary',
        'global:collections#array',
        'global:time',
        'managed-values',
        'objects',
        'string-bytes'
      ],
      cPreludeIncludes: ['inox/mongodb.h'],
      capabilities: []
    }
  ]
}

export const compilerLibraryNativeBuild: CompilerLibraryNativeBuildDescriptor = {
  cmakePackages: [],
  cmakeLinkLibraries: ['mongoc::static'],
  linkerArguments: [],
  cmakeProjects: [
    {
      sourceDir: 'third_party/mongo-c-driver',
      options: [
        { name: 'ENABLE_MONGOC', value: 'ON' },
        { name: 'ENABLE_STATIC', value: 'ON' },
        { name: 'ENABLE_SHARED', value: 'OFF' },
        { name: 'ENABLE_TESTS', value: 'OFF' },
        { name: 'ENABLE_EXAMPLES', value: 'OFF' },
        { name: 'ENABLE_MAN_PAGES', value: 'OFF' },
        { name: 'ENABLE_HTML_DOCS', value: 'OFF' },
        { name: 'ENABLE_UNINSTALL', value: 'OFF' },
        { name: 'ENABLE_SNAPPY', value: 'OFF' },
        { name: 'ENABLE_ZSTD', value: 'OFF' },
        { name: 'ENABLE_ZLIB', value: 'OFF' },
        { name: 'ENABLE_SASL', value: 'OFF' },
        { name: 'ENABLE_CLIENT_SIDE_ENCRYPTION', value: 'OFF' },
        { name: 'ENABLE_MONGODB_AWS_AUTH', value: 'OFF' },
        { name: 'ENABLE_SRV', value: 'ON' },
        { name: 'ENABLE_SSL', value: 'AUTO' },
        { name: 'USE_BUNDLED_UTF8PROC', value: 'ON' }
      ]
    }
  ]
}

function objectIdConstructor(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: moduleBinding('ObjectId'),
    bindingAliases: [moduleDefaultBinding('ObjectId')],
    operationId: `${objectIdTypeId}#construct`,
    kind: 'construct',
    runtimeRequirements,
    variants: [objectIdConstructorVariant(0, []), objectIdConstructorVariant(1, ['string-view'])],
    minArgs: 0,
    maxArgs: 1,
    argumentChecks: [stringArgument()],
    resultTypeRef: objectIdTypeRef,
    cFailureMode: 'thrown'
  }
}

function objectIdConstructorVariant(
  argumentCount: number,
  cArgumentKinds: LibraryCArgumentKind[]
): LibraryOperationVariantDescriptor {
  return {
    minArgs: argumentCount,
    maxArgs: argumentCount,
    argumentChecks: argumentCount === 0 ? [] : [stringArgument()],
    cExpression: 'MongoObjectId',
    cArgumentKinds,
    cResultMode: 'value'
  }
}

function staticObjectIdCall(
  name: string,
  cArgumentKinds: LibraryCArgumentKind[],
  resultTypeRef: TypeRef,
  argumentChecks: LibraryArgumentCheckDescriptor[],
  cExpression: string,
  failureMode: 'thrown' | null = 'thrown'
): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: moduleBinding(`ObjectId.${name}`),
    bindingAliases: [moduleDefaultBinding(`ObjectId.${name}`)],
    operationId: `${objectIdTypeId}#${name}`,
    kind: 'call',
    runtimeRequirements,
    cExpression,
    cArgumentKinds,
    cCallStyle: 'function',
    cFailureMode: failureMode,
    cPreservesPendingException: failureMode === null,
    minArgs: 1,
    maxArgs: 1,
    argumentChecks,
    resultTypeRef
  }
}

function objectIdReceiverCall(
  name: string,
  cArgumentKinds: LibraryCArgumentKind[],
  resultTypeRef: TypeRef,
  argumentChecks: LibraryArgumentCheckDescriptor[],
  cResultMapping?: LibraryCResultMappingDescriptor
): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: `${objectIdTypeId}.${name}`,
    operationId: `${objectIdTypeId}#${name}`,
    kind: 'call',
    runtimeRequirements,
    receiverTypeId: objectIdTypeId,
    cExpression: name,
    cArgumentKinds,
    cCallStyle: 'member',
    cFailureMode: name === 'toString' ? 'thrown' : null,
    cPreservesPendingException: name !== 'toString',
    minArgs: argumentChecks.length,
    maxArgs: argumentChecks.length,
    argumentChecks,
    resultTypeRef,
    cResultMapping
  }
}

function bsonCall(
  name: string,
  cArgumentKinds: LibraryCArgumentKind[],
  resultTypeRef: TypeRef,
  cResultMapping: LibraryCResultMappingDescriptor | undefined,
  argumentChecks: LibraryArgumentCheckDescriptor[]
): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: moduleBinding(`BSON.${name}`),
    bindingAliases: [moduleDefaultBinding(`BSON.${name}`)],
    operationId: `${libraryId}#BSON.${name}`,
    kind: 'call',
    runtimeRequirements,
    cExpression: `MongoBson::${name}`,
    cArgumentKinds,
    cCallStyle: 'function',
    cFailureMode: 'thrown',
    minArgs: 1,
    maxArgs: 1,
    argumentChecks,
    resultTypeRef,
    cResultMapping
  }
}

function moduleBinding(name: string): string {
  return `${libraryId}#module:${libraryId}:${name}`
}

function moduleDefaultBinding(name: string): string {
  return `${libraryId}#module:${libraryId}:default.${name}`
}

function primitiveTypeRef(name: 'boolean' | 'number' | 'string'): PrimitiveTypeRef {
  return { kind: 'primitive', name, nullable: false, ownership: 'value', traits: [] }
}

function nominalTypeRef(typeId: string): NominalTypeRef {
  return { kind: 'nominal', typeId, args: [], nullable: false, ownership: 'value', traits: [] }
}

function unknownTypeRef(): TypeRef {
  return { kind: 'unknown', nullable: true, ownership: 'value', traits: [] }
}

function stringArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['string'] }
}

function numberArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['number'] }
}

function stringOrObjectIdArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['string', 'object'], objectTypeIds: [objectIdTypeId] }
}

function documentArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['object'] }
}

function uint8ArrayArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['bytes'], objectTypeIds: [uint8ArrayTypeId] }
}
