import type {
  CompilerLibraryNativeBuildDescriptor,
  CompilerLibraryPackageDescriptor,
  LibraryArgumentCheckDescriptor,
  LibraryCArgumentKind,
  LibraryCResultMappingDescriptor,
  LibraryOperationDescriptor,
  LibraryOperationTypeParameterDescriptor,
  LibraryOperationVariantDescriptor,
  LibraryNativeTypeDescriptor,
  NominalTypeRef,
  ObjectTypeRef,
  PrimitiveTypeRef,
  TypeRef
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'mongodb'
const runtimeRequirement = libraryId
const objectIdTypeId = `${libraryId}#ObjectId`
const mongoClientTypeId = `${libraryId}#MongoClient`
const databaseTypeId = `${libraryId}#Db`
const collectionTypeId = `${libraryId}#Collection`
const uint8ArrayTypeId = 'global:binary#Uint8Array'
const arrayTypeId = 'global:collections#Array'
const promiseTypeId = 'global:promise#Promise'
const errorTypeId = 'global:error#Error'
const runtimeRequirements = [runtimeRequirement]
const objectIdTypeRef: NominalTypeRef = nominalTypeRef(objectIdTypeId)
const uint8ArrayTypeRef: NominalTypeRef = nominalTypeRef(uint8ArrayTypeId)
const booleanTypeRef: PrimitiveTypeRef = primitiveTypeRef('boolean')
const numberTypeRef: PrimitiveTypeRef = primitiveTypeRef('number')
const stringTypeRef: PrimitiveTypeRef = primitiveTypeRef('string')
const voidTypeRef: PrimitiveTypeRef = primitiveTypeRef('void')
const mongoClientTypeRef = nominalTypeRef(mongoClientTypeId)
const databaseTypeRef = nominalTypeRef(databaseTypeId)
const schemaParameterTypeRef: TypeRef = { kind: 'parameter', name: 'TSchema' }
const nullableSchemaParameterTypeRef: TypeRef = { kind: 'parameter', name: 'TSchema', nullable: true }
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
  bsonCall('deserialize', ['value'], documentTypeRef, valueResultMapping, [uint8ArrayArgument()]),
  mongoClientConstructor(),
  mongoClientStaticConnect(),
  mongoClientReceiverCall('connect', [], promiseTypeRef(mongoClientTypeRef)),
  mongoClientDbCall(),
  mongoClientReceiverCall('close', [], promiseTypeRef(voidTypeRef)),
  databaseCollectionCall(),
  collectionFindOneCall(),
  collectionReceiverCall('findOneAndUpdate', [documentArgument(), documentArgument()], promiseTypeRef(nullableSchemaParameterTypeRef)),
  collectionReceiverCall('insertOne', [schemaArgument()], promiseTypeRef(insertOneResultTypeRef())),
  collectionReceiverCall('insertMany', [arrayArgument()], promiseTypeRef(insertManyResultTypeRef())),
  collectionReceiverCall('updateOne', [documentArgument(), documentArgument()], promiseTypeRef(updateResultTypeRef())),
  collectionReceiverCall('updateMany', [documentArgument(), documentArgument()], promiseTypeRef(updateResultTypeRef())),
  collectionReceiverCall('deleteOne', [documentArgument()], promiseTypeRef(deleteResultTypeRef())),
  collectionReceiverCall('deleteMany', [documentArgument()], promiseTypeRef(deleteResultTypeRef()))
]

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: ['global:binary', 'global:collections', 'global:error', 'global:promise', 'global:time'],
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
    },
    nativeFacadeType(mongoClientTypeId, 'MongoClient', 'MongoClient'),
    nativeFacadeType(databaseTypeId, 'Db', 'MongoDatabase'),
    {
      ...nativeFacadeType(collectionTypeId, 'Collection', 'MongoCollection'),
      typeParameters: ['TSchema']
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
        'global:error',
        'global:promise#promise',
        'global:time',
        'managed-values',
        'objects',
        'string-bytes'
      ],
      cPreludeIncludes: ['inox/mongodb.h'],
      capabilities: ['tcp'],
      optionConstraints: [
        {
          optionId: 'target:runtime#loop-backend',
          allowedValues: ['libuv'],
          diagnosticCode: 'INOX_MONGODB_LOOP_BACKEND',
          diagnosticMessage: 'mongodb is not implemented without libuv; select --loop-backend libuv'
        }
      ]
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
        { name: 'ENABLE_SHM_COUNTERS', value: 'OFF' },
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

function nativeFacadeType(typeId: string, declarationName: string, cppType: string): LibraryNativeTypeDescriptor {
  return {
    libraryId,
    typeId,
    declarationNames: [declarationName],
    valueType: 'object',
    cppType,
    baseTypeIds: [],
    runtimeRequirements,
    cValueAdapter: `${cppType}(inox::Value($value))`,
    cValueAdapterFailureMode: 'thrown',
    cValueAdapterPreservesPendingException: true,
    cRuntimeValueExpression: '$value.runtimeValue().release()',
    cRuntimeValueOwnership: 'owned',
    cRuntimeValueValidExpression: `${cppType}::is${cppType === 'MongoDatabase' ? 'MongoDatabase' : cppType}(inox::Value($value))`
  }
}

function mongoClientConstructor(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: moduleBinding('MongoClient'),
    bindingAliases: [moduleDefaultBinding('MongoClient')],
    operationId: `${mongoClientTypeId}#construct`,
    kind: 'construct',
    runtimeRequirements,
    minArgs: 1,
    maxArgs: 2,
    argumentChecks: [stringArgument(), objectArgument()],
    cFailureMode: 'thrown',
    resultTypeRef: mongoClientTypeRef,
    variants: [
      constructorVariant('MongoClient', 1, ['string-view'], [stringArgument()]),
      constructorVariant('MongoClient', 2, ['string-view', 'runtime-value'], [stringArgument(), objectArgument()])
    ]
  }
}

function mongoClientStaticConnect(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: moduleBinding('MongoClient.connect'),
    bindingAliases: [moduleDefaultBinding('MongoClient.connect')],
    operationId: `${mongoClientTypeId}#static-connect`,
    kind: 'call',
    runtimeRequirements,
    minArgs: 1,
    maxArgs: 2,
    argumentChecks: [stringArgument(), objectArgument()],
    cFailureMode: 'thrown',
    cCallStyle: 'function',
    resultTypeRef: promiseTypeRef(mongoClientTypeRef),
    variants: [
      callVariant('MongoClient::connect', 1, ['string-view'], [stringArgument()]),
      callVariant('MongoClient::connect', 2, ['string-view', 'runtime-value'], [stringArgument(), objectArgument()])
    ]
  }
}

function mongoClientReceiverCall(
  name: string,
  argumentChecks: LibraryArgumentCheckDescriptor[],
  resultTypeRef: TypeRef
): LibraryOperationDescriptor {
  return receiverCall(mongoClientTypeId, name, argumentChecks, resultTypeRef)
}

function mongoClientDbCall(): LibraryOperationDescriptor {
  return {
    ...receiverCall(mongoClientTypeId, 'db', [], databaseTypeRef),
    minArgs: 0,
    maxArgs: 1,
    argumentChecks: [stringArgument()],
    variants: [
      callVariant('db', 0, ['receiver'], []),
      callVariant('db', 1, ['receiver', 'string-view'], [stringArgument()])
    ]
  }
}

function databaseCollectionCall(): LibraryOperationDescriptor {
  const typeParameters: LibraryOperationTypeParameterDescriptor[] = [
    {
      name: 'TSchema',
      sources: [
        { source: 'explicit-type-argument', argumentIndex: 0 },
        { source: 'contextual-type-argument', argumentIndex: 0 }
      ]
    }
  ]

  return {
    ...receiverCall(databaseTypeId, 'collection', [stringArgument()], collectionTypeRef(schemaParameterTypeRef)),
    cArgumentKinds: ['receiver', 'string-view'],
    typeParameters
  }
}

function collectionFindOneCall(): LibraryOperationDescriptor {
  return {
    ...collectionReceiverCall('findOne', [], promiseTypeRef(nullableSchemaParameterTypeRef)),
    minArgs: 0,
    maxArgs: 1,
    argumentChecks: [documentArgument()],
    variants: [
      callVariant('findOne', 0, ['receiver'], []),
      callVariant('findOne', 1, ['receiver', 'runtime-value'], [documentArgument()])
    ]
  }
}

function collectionReceiverCall(
  name: string,
  argumentChecks: LibraryArgumentCheckDescriptor[],
  resultTypeRef: TypeRef
): LibraryOperationDescriptor {
  return {
    ...receiverCall(collectionTypeId, name, argumentChecks, resultTypeRef),
    typeParameters: [{ name: 'TSchema', sources: [{ source: 'receiver-type-argument', argumentIndex: 0 }] }]
  }
}

function receiverCall(
  receiverTypeId: string,
  name: string,
  argumentChecks: LibraryArgumentCheckDescriptor[],
  resultTypeRef: TypeRef
): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: `${receiverTypeId}.${name}`,
    operationId: `${receiverTypeId}#${name}`,
    kind: 'call',
    runtimeRequirements,
    receiverTypeId,
    cExpression: name,
    cArgumentKinds: ['receiver', ...argumentChecks.map(() => 'runtime-value' as const)],
    cCallStyle: 'member',
    cFailureMode: 'thrown',
    minArgs: argumentChecks.length,
    maxArgs: argumentChecks.length,
    argumentChecks,
    resultTypeRef
  }
}

function constructorVariant(
  cExpression: string,
  argumentCount: number,
  cArgumentKinds: LibraryCArgumentKind[],
  argumentChecks: LibraryArgumentCheckDescriptor[]
): LibraryOperationVariantDescriptor {
  return {
    minArgs: argumentCount,
    maxArgs: argumentCount,
    cExpression,
    cArgumentKinds,
    cResultMode: 'value',
    argumentChecks
  }
}

function callVariant(
  cExpression: string,
  argumentCount: number,
  cArgumentKinds: LibraryCArgumentKind[],
  argumentChecks: LibraryArgumentCheckDescriptor[]
): LibraryOperationVariantDescriptor {
  return {
    minArgs: argumentCount,
    maxArgs: argumentCount,
    cExpression,
    cArgumentKinds,
    argumentChecks
  }
}

function collectionTypeRef(schema: TypeRef): NominalTypeRef {
  return {
    kind: 'nominal',
    typeId: collectionTypeId,
    args: [schema],
    nullable: false,
    ownership: 'value',
    traits: []
  }
}

function arrayTypeRef(element: TypeRef): NominalTypeRef {
  return {
    kind: 'nominal',
    typeId: arrayTypeId,
    args: [element],
    nullable: false,
    ownership: 'value',
    traits: [{ traitId: 'iterable', args: [element] }]
  }
}

function promiseTypeRef(fulfilledType: TypeRef): NominalTypeRef {
  const errorTypeRef = nominalTypeRef(errorTypeId)
  return {
    kind: 'nominal',
    typeId: promiseTypeId,
    args: [fulfilledType],
    nullable: false,
    ownership: 'value',
    traits: [{ traitId: 'awaitable', args: [fulfilledType, errorTypeRef] }]
  }
}

function resultObjectTypeRef(
  declaredName: string,
  fields: Array<{ name: string; typeRef: TypeRef; optional?: boolean }>
): ObjectTypeRef {
  return {
    kind: 'object',
    declaredName,
    fields: fields.map((field) => ({ ...field, readonly: true })),
    dynamic: false,
    dynamicField: null,
    nullable: false,
    ownership: 'value',
    traits: []
  }
}

function insertOneResultTypeRef(): ObjectTypeRef {
  return resultObjectTypeRef('InsertOneResult', [
    { name: 'acknowledged', typeRef: booleanTypeRef },
    { name: 'insertedId', typeRef: unknownTypeRef() }
  ])
}

function insertManyResultTypeRef(): ObjectTypeRef {
  return resultObjectTypeRef('InsertManyResult', [
    { name: 'acknowledged', typeRef: booleanTypeRef },
    { name: 'insertedCount', typeRef: numberTypeRef },
    { name: 'insertedIds', typeRef: documentTypeRef }
  ])
}

function updateResultTypeRef(): ObjectTypeRef {
  return resultObjectTypeRef('UpdateResult', [
    { name: 'acknowledged', typeRef: booleanTypeRef },
    { name: 'matchedCount', typeRef: numberTypeRef },
    { name: 'modifiedCount', typeRef: numberTypeRef },
    { name: 'upsertedCount', typeRef: numberTypeRef },
    { name: 'upsertedId', typeRef: unknownTypeRef() }
  ])
}

function deleteResultTypeRef(): ObjectTypeRef {
  return resultObjectTypeRef('DeleteResult', [
    { name: 'acknowledged', typeRef: booleanTypeRef },
    { name: 'deletedCount', typeRef: numberTypeRef }
  ])
}

function moduleBinding(name: string): string {
  return `${libraryId}#module:${libraryId}:${name}`
}

function moduleDefaultBinding(name: string): string {
  return `${libraryId}#module:${libraryId}:default.${name}`
}

function primitiveTypeRef(name: 'boolean' | 'number' | 'string' | 'void'): PrimitiveTypeRef {
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

function objectArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['object'] }
}

function schemaArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['object'], typeRef: schemaParameterTypeRef }
}

function arrayArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['object'], objectTypeIds: [arrayTypeId], typeRef: arrayTypeRef(schemaParameterTypeRef) }
}

function uint8ArrayArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['bytes'], objectTypeIds: [uint8ArrayTypeId] }
}
