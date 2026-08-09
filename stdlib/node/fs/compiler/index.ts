import type {
  CompilerLibraryPackageDescriptor,
  LibraryArgumentCheckDescriptor,
  LibraryCallbackParameterDescriptor,
  LibraryCArgumentKind,
  LibraryCResultMappingDescriptor,
  LibraryObjectLiteralFieldDescriptor,
  LibraryOperationDescriptor,
  LibraryOperationVariantDescriptor,
  NominalTypeRef,
  PrimitiveTypeRef,
  TypeRef
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'node:fs'
const collectionsLibraryId = 'global:collections'
const arrayRuntimeRequirement = `${collectionsLibraryId}#array`
const arrayTypeId = `${collectionsLibraryId}#Array`
const promiseTypeId = 'global:promise#Promise'
const promisesLibraryId = 'node:fs/promises'
const runtimeRequirement = libraryId
const statsTypeId = `${libraryId}#Stats`
const direntTypeId = `${libraryId}#Dirent`
const bufferTypeId = 'node:buffer#Buffer'
const uint8ArrayTypeId = 'global:binary#Uint8Array'
const errorTypeId = 'global:error#Error'
const statsTypeRef = nominalTypeRef(statsTypeId)
const direntTypeRef = nominalTypeRef(direntTypeId)
const bufferTypeRef = nominalTypeRef(bufferTypeId)
const booleanTypeRef: PrimitiveTypeRef = primitiveTypeRef('boolean')
const numberTypeRef: PrimitiveTypeRef = primitiveTypeRef('number')
const stringTypeRef: PrimitiveTypeRef = primitiveTypeRef('string')
const voidTypeRef: PrimitiveTypeRef = primitiveTypeRef('void')
const stringCResultMapping: LibraryCResultMappingDescriptor = {
  cppType: 'inox::String',
  fields: []
}

const operations: LibraryOperationDescriptor[] = [
  accessOperation('accessSync', false, libraryId),
  writeOperation('appendFileSync', false, libraryId),
  twoPathOperation('copyFileSync', false, libraryId),
  existsOperation(),
  statsOperation('lstatSync', false, libraryId),
  mkdirOperation('mkdirSync', false, libraryId),
  readFileOperation('readFileSync', false, libraryId),
  readdirOperation('readdirSync', false, libraryId),
  stringPathOperation('readlinkSync', false, libraryId),
  stringPathOperation('realpathSync', false, libraryId),
  twoPathOperation('renameSync', false, libraryId),
  rmOperation('rmSync', false, libraryId),
  statsOperation('statSync', false, libraryId),
  twoPathOperation('symlinkSync', false, libraryId),
  voidPathOperation('unlinkSync', false, libraryId),
  writeOperation('writeFileSync', false, libraryId),
  constantOperation('F_OK'),
  constantOperation('R_OK'),
  constantOperation('W_OK'),
  constantOperation('X_OK'),
  receiverBooleanOperation(statsTypeId, 'Stats', 'isFile'),
  receiverBooleanOperation(statsTypeId, 'Stats', 'isDirectory'),
  receiverBooleanOperation(direntTypeId, 'Dirent', 'isFile'),
  receiverBooleanOperation(direntTypeId, 'Dirent', 'isDirectory'),
  ...createFsCallbackOperations()
]

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: [collectionsLibraryId, 'node:buffer'],
  nativeTypes: [
    {
      libraryId,
      typeId: statsTypeId,
      declarationNames: ['Stats'],
      valueType: 'object',
      cppType: 'FsStats',
      baseTypeIds: [],
      runtimeRequirements: [runtimeRequirement],
      fields: [
        { name: 'size', valueType: 'number', readonly: true, cGetter: 'size' },
        { name: 'mode', valueType: 'number', readonly: true, cGetter: 'mode' },
        { name: 'mtimeMs', valueType: 'number', readonly: true, cGetter: 'mtimeMs' }
      ]
    },
    {
      libraryId,
      typeId: direntTypeId,
      declarationNames: ['Dirent'],
      valueType: 'object',
      cppType: 'FsDirent',
      baseTypeIds: [],
      runtimeRequirements: [runtimeRequirement],
      cValueAdapter: 'FsDirent(inox::Value($value))',
      cValueAdapterPreservesPendingException: true,
      fields: [{ name: 'name', valueType: 'string', readonly: true, cGetter: 'name', cppType: 'inox::String' }]
    }
  ],
  operations,
  intrinsicBindings: [],
  runtimeRequirements: [
    {
      id: runtimeRequirement,
      dependencies: [
        'async-runtime',
        arrayRuntimeRequirement,
        'callback-values',
        'managed-values',
        'node:buffer',
        'string-bytes'
      ],
      cPreludeIncludes: ['inox/fs.h'],
      capabilities: ['fs']
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

export function createFsPromiseOperations(): LibraryOperationDescriptor[] {
  return [
    accessOperation('access', true, promisesLibraryId),
    writeOperation('appendFile', true, promisesLibraryId),
    twoPathOperation('copyFile', true, promisesLibraryId),
    statsOperation('lstat', true, promisesLibraryId),
    mkdirOperation('mkdir', true, promisesLibraryId),
    readFileOperation('readFile', true, promisesLibraryId),
    readdirOperation('readdir', true, promisesLibraryId),
    stringPathOperation('readlink', true, promisesLibraryId),
    stringPathOperation('realpath', true, promisesLibraryId),
    twoPathOperation('rename', true, promisesLibraryId),
    rmOperation('rm', true, promisesLibraryId),
    statsOperation('stat', true, promisesLibraryId),
    twoPathOperation('symlink', true, promisesLibraryId),
    voidPathOperation('unlink', true, promisesLibraryId),
    writeOperation('writeFile', true, promisesLibraryId)
  ]
}

function accessOperation(name: string, promise: boolean, ownerLibraryId: string): LibraryOperationDescriptor {
  return operationWithVariants(
    name,
    promise,
    ownerLibraryId,
    1,
    2,
    [stringArgument(), numberArgument()],
    [
      variant(name, promise, 1, 1, ['string-view'], fsResultTypeRef(promise, voidTypeRef)),
      variant(name, promise, 2, 2, ['string-view', 'number'], fsResultTypeRef(promise, voidTypeRef))
    ]
  )
}

function existsOperation(): LibraryOperationDescriptor {
  return {
    ...callOperation(
      'existsSync',
      false,
      libraryId,
      ['string-view'],
      booleanTypeRef,
      null,
      1,
      1,
      [stringArgument()]
    ),
    cFailureMode: null
  }
}

function mkdirOperation(name: string, promise: boolean, ownerLibraryId: string): LibraryOperationDescriptor {
  return callOperation(
    name,
    promise,
    ownerLibraryId,
    ['string-view', 'object-boolean-field'],
    fsResultTypeRef(promise, voidTypeRef),
    null,
    1,
    2,
    [stringArgument(), objectArgument([booleanOption('recursive')])],
    {
      cArgumentSources: [null, optionSource(1, 'recursive')]
    }
  )
}

function rmOperation(name: string, promise: boolean, ownerLibraryId: string): LibraryOperationDescriptor {
  return callOperation(
    name,
    promise,
    ownerLibraryId,
    ['string-view', 'object-boolean-field', 'object-boolean-field'],
    fsResultTypeRef(promise, voidTypeRef),
    null,
    1,
    2,
    [stringArgument(), objectArgument([booleanOption('recursive'), booleanOption('force')])],
    {
      cArgumentSources: [null, optionSource(1, 'recursive'), optionSource(1, 'force')]
    }
  )
}

function readFileOperation(name: string, promise: boolean, ownerLibraryId: string): LibraryOperationDescriptor {
  return operationWithVariants(
    name,
    promise,
    ownerLibraryId,
    1,
    2,
    [stringArgument(), utf8Argument(name)],
    [
      variant(name, promise, 1, 1, ['string-view'], fsResultTypeRef(promise, bufferTypeRef)),
      variant(
        name,
        promise,
        2,
        2,
        ['string-view', 'string-view'],
        fsResultTypeRef(promise, stringTypeRef),
        syncStringResultMapping(promise)
      )
    ]
  )
}

function readdirOperation(name: string, promise: boolean, ownerLibraryId: string): LibraryOperationDescriptor {
  return operationWithVariants(
    name,
    promise,
    ownerLibraryId,
    1,
    2,
    [stringArgument(), readdirArgument(name)],
    [
      {
        ...variant(
          name,
          promise,
          2,
          2,
          ['string-view', 'object-boolean-field'],
          fsResultTypeRef(promise, arrayTypeRef(direntTypeRef))
        ),
        argumentIndex: 1,
        argumentValueTypes: ['object'],
        objectFieldName: 'withFileTypes',
        booleanLiterals: [true],
        cArgumentAdapters: ['', 'FsReadDirOptions{$value}'],
        cArgumentSources: [null, optionSource(1, 'withFileTypes')]
      },
      {
        ...variant(
          name,
          promise,
          2,
          2,
          ['string-view', 'string-view'],
          fsResultTypeRef(promise, arrayTypeRef(stringTypeRef))
        ),
        argumentIndex: 1,
        argumentValueTypes: ['string']
      },
      {
        ...variant(name, promise, 2, 2, ['string-view'], fsResultTypeRef(promise, arrayTypeRef(stringTypeRef))),
        argumentIndex: 1,
        argumentValueTypes: ['object']
      },
      variant(name, promise, 1, 1, ['string-view'], fsResultTypeRef(promise, arrayTypeRef(stringTypeRef)))
    ]
  )
}

function writeOperation(name: string, promise: boolean, ownerLibraryId: string): LibraryOperationDescriptor {
  return operationWithVariants(
    name,
    promise,
    ownerLibraryId,
    2,
    3,
    [stringArgument(), { valueTypes: ['string', 'bytes'] }, utf8Argument(name)],
    [
      {
        ...variant(name, promise, 2, 3, ['string-view', 'string-view'], fsResultTypeRef(promise, voidTypeRef)),
        argumentIndex: 1,
        argumentValueTypes: ['string']
      },
      {
        ...variant(name, promise, 2, 3, ['string-view', 'value'], fsResultTypeRef(promise, voidTypeRef)),
        argumentIndex: 1,
        argumentValueTypes: ['bytes'],
        cArgumentAdapters: ['', 'Uint8Array($value)'],
        cArgumentAdapterTypeIds: ['', uint8ArrayTypeId]
      }
    ]
  )
}

function statsOperation(name: string, promise: boolean, ownerLibraryId: string): LibraryOperationDescriptor {
  return callOperation(
    name,
    promise,
    ownerLibraryId,
    ['string-view'],
    fsResultTypeRef(promise, statsTypeRef),
    null,
    1,
    1,
    [stringArgument()]
  )
}

function stringPathOperation(name: string, promise: boolean, ownerLibraryId: string): LibraryOperationDescriptor {
  return callOperation(
    name,
    promise,
    ownerLibraryId,
    ['string-view'],
    fsResultTypeRef(promise, stringTypeRef),
    syncStringResultMapping(promise),
    1,
    1,
    [stringArgument()]
  )
}

function voidPathOperation(name: string, promise: boolean, ownerLibraryId: string): LibraryOperationDescriptor {
  return callOperation(
    name,
    promise,
    ownerLibraryId,
    ['string-view'],
    fsResultTypeRef(promise, voidTypeRef),
    null,
    1,
    1,
    [stringArgument()]
  )
}

function twoPathOperation(name: string, promise: boolean, ownerLibraryId: string): LibraryOperationDescriptor {
  return callOperation(
    name,
    promise,
    ownerLibraryId,
    ['string-view', 'string-view'],
    fsResultTypeRef(promise, voidTypeRef),
    null,
    2,
    2,
    [stringArgument(), stringArgument()]
  )
}

type CallOptions = {
  cArgumentSources?: Array<{ argumentIndex: number; objectFieldName: string } | null>
}

function callOperation(
  name: string,
  promise: boolean,
  ownerLibraryId: string,
  cArgumentKinds: LibraryCArgumentKind[],
  resultTypeRef: TypeRef,
  cResultMapping: LibraryCResultMappingDescriptor | null,
  minArgs: number,
  maxArgs: number,
  argumentChecks: LibraryArgumentCheckDescriptor[],
  options: CallOptions = {}
): LibraryOperationDescriptor {
  return {
    libraryId: ownerLibraryId,
    bindingId: binding(ownerLibraryId, name),
    bindingAliases: aliases(ownerLibraryId, name, promise),
    operationId: `${ownerLibraryId}#${name}`,
    kind: 'call',
    runtimeRequirements: [runtimeRequirement],
    cExpression: promise ? `fs.promises.${name}` : `fs.${name}`,
    cArgumentKinds,
    cArgumentSources: options.cArgumentSources,
    cFailureMode: promise ? null : 'thrown',
    minArgs,
    maxArgs,
    argumentChecks,
    resultTypeRef,
    ...(cResultMapping ? { cResultMapping } : {})
  }
}

function operationWithVariants(
  name: string,
  promise: boolean,
  ownerLibraryId: string,
  minArgs: number,
  maxArgs: number,
  argumentChecks: LibraryArgumentCheckDescriptor[],
  variants: LibraryOperationVariantDescriptor[]
): LibraryOperationDescriptor {
  return {
    libraryId: ownerLibraryId,
    bindingId: binding(ownerLibraryId, name),
    bindingAliases: aliases(ownerLibraryId, name, promise),
    operationId: `${ownerLibraryId}#${name}`,
    kind: 'call',
    runtimeRequirements: [runtimeRequirement],
    cFailureMode: promise ? null : 'thrown',
    minArgs,
    maxArgs,
    argumentChecks,
    variants
  }
}

function variant(
  name: string,
  promise: boolean,
  minArgs: number,
  maxArgs: number,
  cArgumentKinds: LibraryCArgumentKind[],
  resultTypeRef: TypeRef,
  cResultMapping: LibraryCResultMappingDescriptor | null = null
): LibraryOperationVariantDescriptor {
  return {
    minArgs,
    maxArgs,
    cExpression: promise ? `fs.promises.${name}` : `fs.${name}`,
    cArgumentKinds,
    resultTypeRef,
    ...(cResultMapping ? { cResultMapping } : {})
  }
}

function constantOperation(name: string): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: binding(libraryId, `constants.${name}`),
    bindingAliases: [binding(libraryId, `default.constants.${name}`)],
    operationId: `${libraryId}#constants.${name}`,
    kind: 'member-read',
    runtimeRequirements: [runtimeRequirement],
    cExpression: `fs.constants.${name}`,
    resultTypeRef: numberTypeRef
  }
}

function receiverBooleanOperation(
  receiverTypeId: string,
  receiverName: string,
  name: string
): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: `${receiverTypeId}.${name}`,
    operationId: `${libraryId}#${receiverName}.${name}`,
    kind: 'call',
    runtimeRequirements: [runtimeRequirement],
    receiverTypeId,
    cExpression: name,
    cArgumentKinds: ['receiver'],
    cReceiverAdapter: `${receiverName === 'Stats' ? 'FsStats' : 'FsDirent'}($value)`,
    cCallStyle: 'member',
    cFailureMode: null,
    minArgs: 0,
    maxArgs: 0,
    argumentChecks: [],
    resultTypeRef: booleanTypeRef
  }
}

function fsResultTypeRef(promise: boolean, fulfilledType: TypeRef): TypeRef {
  return promise ? promiseTypeRef(fulfilledType, errorTypeRef()) : fulfilledType
}

function promiseTypeRef(fulfilledType: TypeRef, rejectedType: TypeRef): NominalTypeRef {
  return {
    kind: 'nominal',
    typeId: promiseTypeId,
    args: [fulfilledType],
    nullable: false,
    ownership: 'value',
    traits: [{ traitId: 'awaitable', args: [fulfilledType, rejectedType] }]
  }
}

function syncStringResultMapping(promise: boolean): LibraryCResultMappingDescriptor | null {
  return promise ? null : stringCResultMapping
}

function primitiveTypeRef(name: 'boolean' | 'number' | 'string' | 'void'): PrimitiveTypeRef {
  return { kind: 'primitive', name, nullable: false, ownership: 'value', traits: [] }
}

function nominalTypeRef(typeId: string): NominalTypeRef {
  return { kind: 'nominal', typeId, args: [], nullable: false, ownership: 'value', traits: [] }
}

function errorTypeRef(): NominalTypeRef {
  return nominalTypeRef(errorTypeId)
}

function createFsCallbackOperations(): LibraryOperationDescriptor[] {
  return [
    callbackAccessOperation(),
    callbackWriteOperation('appendFile'),
    callbackTwoPathOperation('copyFile'),
    callbackValuePathOperation('lstat', callbackArgument('stats', 'object', statsTypeRef)),
    callbackMkdirOperation(),
    callbackReadFileOperation(),
    callbackReaddirOperation(),
    callbackValuePathOperation('readlink', callbackArgument('linkString', 'string', stringTypeRef)),
    callbackValuePathOperation('realpath', callbackArgument('resolvedPath', 'string', stringTypeRef)),
    callbackTwoPathOperation('rename'),
    callbackRmOperation(),
    callbackValuePathOperation('stat', callbackArgument('stats', 'object', statsTypeRef)),
    callbackTwoPathOperation('symlink'),
    callbackVoidPathOperation('unlink'),
    callbackWriteOperation('writeFile')
  ]
}

function callbackAccessOperation(): LibraryOperationDescriptor {
  const callback = callbackArgument()

  return callbackOperation(
    'access',
    2,
    3,
    [stringArgument(), { valueTypes: ['number', 'function'] }, callback],
    [
      callbackVariant(2, ['string-view', 'runtime-callback'], [stringArgument(), callback]),
      callbackVariant(3, ['string-view', 'number', 'runtime-callback'], [stringArgument(), numberArgument(), callback])
    ]
  )
}

function callbackWriteOperation(name: 'appendFile' | 'writeFile'): LibraryOperationDescriptor {
  const callback = callbackArgument()
  const variants: LibraryOperationVariantDescriptor[] = []

  for (const argumentCount of [3, 4]) {
    const callbackIndex = argumentCount - 1
    const checks =
      argumentCount === 3
        ? [stringArgument(), { valueTypes: ['string', 'bytes'] }, callback]
        : [stringArgument(), { valueTypes: ['string', 'bytes'] }, utf8Argument(name), callback]
    const sources = [{ argumentIndex: 0 }, { argumentIndex: 1 }, { argumentIndex: callbackIndex }]

    variants.push({
      ...callbackVariant(argumentCount, ['string-view', 'string-view', 'runtime-callback'], checks),
      argumentIndex: 1,
      argumentValueTypes: ['string'],
      cArgumentSources: sources
    })
    variants.push({
      ...callbackVariant(argumentCount, ['string-view', 'value', 'runtime-callback'], checks),
      argumentIndex: 1,
      argumentValueTypes: ['bytes'],
      cArgumentAdapters: ['', 'Uint8Array($value)', ''],
      cArgumentAdapterTypeIds: ['', uint8ArrayTypeId, ''],
      cArgumentSources: sources
    })
  }

  return callbackOperation(
    name,
    3,
    4,
    [stringArgument(), { valueTypes: ['string', 'bytes'] }, { valueTypes: ['string', 'function'] }, callback],
    variants
  )
}

function callbackTwoPathOperation(name: 'copyFile' | 'rename' | 'symlink'): LibraryOperationDescriptor {
  const callback = callbackArgument()

  return callbackCallOperation(
    name,
    ['string-view', 'string-view', 'runtime-callback'],
    [stringArgument(), stringArgument(), callback]
  )
}

function callbackValuePathOperation(
  name: 'lstat' | 'readlink' | 'realpath' | 'stat',
  callback: LibraryArgumentCheckDescriptor
): LibraryOperationDescriptor {
  return callbackCallOperation(name, ['string-view', 'runtime-callback'], [stringArgument(), callback])
}

function callbackVoidPathOperation(name: 'unlink'): LibraryOperationDescriptor {
  return callbackCallOperation(name, ['string-view', 'runtime-callback'], [stringArgument(), callbackArgument()])
}

function callbackMkdirOperation(): LibraryOperationDescriptor {
  const callback = callbackArgument()
  const recursiveCallback = callbackArgument('path', 'string', stringTypeRef, true)

  return callbackOperation(
    'mkdir',
    2,
    3,
    [stringArgument(), { valueTypes: ['object', 'function'] }, callback],
    [
      callbackVariant(2, ['string-view', 'runtime-callback'], [stringArgument(), callback]),
      {
        ...callbackVariant(
          3,
          ['string-view', 'object-boolean-field', 'runtime-callback'],
          [stringArgument(), recursiveMkdirArgument(), recursiveCallback]
        ),
        argumentIndex: 1,
        argumentValueTypes: ['object'],
        objectFieldName: 'recursive',
        booleanLiterals: [true],
        cArgumentSources: [null, optionSource(1, 'recursive'), { argumentIndex: 2 }]
      },
      {
        ...callbackVariant(
          3,
          ['string-view', 'object-boolean-field', 'runtime-callback'],
          [stringArgument(), objectArgument([booleanOption('recursive')]), callback]
        ),
        cArgumentSources: [null, optionSource(1, 'recursive'), { argumentIndex: 2 }]
      }
    ]
  )
}

function callbackReadFileOperation(): LibraryOperationDescriptor {
  const bytesCallback = callbackArgument('data', 'bytes', bufferTypeRef)
  const stringCallback = callbackArgument('data', 'string', stringTypeRef)

  return callbackOperation(
    'readFile',
    2,
    3,
    [stringArgument(), { valueTypes: ['string', 'function'] }, stringCallback],
    [
      callbackVariant(2, ['string-view', 'runtime-callback'], [stringArgument(), bytesCallback]),
      callbackVariant(
        3,
        ['string-view', 'string-view', 'runtime-callback'],
        [stringArgument(), utf8Argument('readFile'), stringCallback]
      )
    ]
  )
}

function callbackReaddirOperation(): LibraryOperationDescriptor {
  const stringCallback = callbackArgument('files', 'array', arrayTypeRef(stringTypeRef))
  const direntCallback = callbackArgument('files', 'array', arrayTypeRef(direntTypeRef))

  return callbackOperation(
    'readdir',
    2,
    3,
    [stringArgument(), { valueTypes: ['string', 'object', 'function'] }, stringCallback],
    [
      callbackVariant(2, ['string-view', 'runtime-callback'], [stringArgument(), stringCallback]),
      {
        ...callbackVariant(
          3,
          ['string-view', 'object-boolean-field', 'runtime-callback'],
          [stringArgument(), readdirWithFileTypesArgument(), direntCallback]
        ),
        argumentIndex: 1,
        argumentValueTypes: ['object'],
        objectFieldName: 'withFileTypes',
        booleanLiterals: [true],
        cArgumentAdapters: ['', 'FsReadDirOptions{$value}', ''],
        cArgumentSources: [null, optionSource(1, 'withFileTypes'), { argumentIndex: 2 }]
      },
      {
        ...callbackVariant(
          3,
          ['string-view', 'string-view', 'runtime-callback'],
          [stringArgument(), utf8Argument('readdir'), stringCallback]
        ),
        argumentIndex: 1,
        argumentValueTypes: ['string']
      },
      {
        ...callbackVariant(
          3,
          ['string-view', 'runtime-callback'],
          [stringArgument(), readdirArgument('readdir'), stringCallback]
        ),
        argumentIndex: 1,
        argumentValueTypes: ['object'],
        cArgumentSources: [{ argumentIndex: 0 }, { argumentIndex: 2 }]
      }
    ]
  )
}

function callbackRmOperation(): LibraryOperationDescriptor {
  const callback = callbackArgument()

  return callbackOperation(
    'rm',
    2,
    3,
    [stringArgument(), { valueTypes: ['object', 'function'] }, callback],
    [
      callbackVariant(2, ['string-view', 'runtime-callback'], [stringArgument(), callback]),
      {
        ...callbackVariant(
          3,
          ['string-view', 'object-boolean-field', 'object-boolean-field', 'runtime-callback'],
          [stringArgument(), objectArgument([booleanOption('recursive'), booleanOption('force')]), callback]
        ),
        cArgumentSources: [null, optionSource(1, 'recursive'), optionSource(1, 'force'), { argumentIndex: 2 }]
      }
    ]
  )
}

function callbackCallOperation(
  name: string,
  cArgumentKinds: LibraryCArgumentKind[],
  argumentChecks: LibraryArgumentCheckDescriptor[]
): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: binding(libraryId, name),
    bindingAliases: [binding(libraryId, `default.${name}`)],
    operationId: `${libraryId}#${name}`,
    kind: 'call',
    runtimeRequirements: [runtimeRequirement],
    cExpression: `fs.${name}`,
    cArgumentKinds,
    cFailureMode: 'thrown',
    minArgs: argumentChecks.length,
    maxArgs: argumentChecks.length,
    argumentChecks,
    resultTypeRef: voidTypeRef,
    callbackLifetime: 'event-loop'
  }
}

function callbackOperation(
  name: string,
  minArgs: number,
  maxArgs: number,
  argumentChecks: LibraryArgumentCheckDescriptor[],
  variants: LibraryOperationVariantDescriptor[]
): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: binding(libraryId, name),
    bindingAliases: [binding(libraryId, `default.${name}`)],
    operationId: `${libraryId}#${name}`,
    kind: 'call',
    runtimeRequirements: [runtimeRequirement],
    cExpression: `fs.${name}`,
    cFailureMode: 'thrown',
    minArgs,
    maxArgs,
    argumentChecks,
    variants,
    resultTypeRef: voidTypeRef,
    callbackLifetime: 'event-loop'
  }
}

function callbackVariant(
  argumentCount: number,
  cArgumentKinds: LibraryCArgumentKind[],
  argumentChecks: LibraryArgumentCheckDescriptor[]
): LibraryOperationVariantDescriptor {
  return {
    minArgs: argumentCount,
    maxArgs: argumentCount,
    cArgumentKinds,
    argumentChecks
  }
}

function callbackArgument(
  resultName?: string,
  resultValueType?: string,
  resultTypeRef?: TypeRef,
  resultOptional = false
): LibraryArgumentCheckDescriptor {
  const parameters: LibraryCallbackParameterDescriptor[] = [
    {
      name: 'error',
      valueType: 'object',
      nullable: true,
      shapeFields: [
        { name: 'message', valueType: 'string', readonly: true },
        { name: 'code', valueType: 'string', readonly: true }
      ]
    }
  ]

  if (
    typeof resultName !== 'undefined' &&
    typeof resultValueType !== 'undefined' &&
    typeof resultTypeRef !== 'undefined'
  ) {
    parameters.push({
      name: resultName,
      valueType: resultValueType,
      typeRef: resultTypeRef,
      optional: resultOptional
    })
  }

  return {
    valueTypes: ['function'],
    functionParameters: parameters,
    functionReturnType: 'void'
  }
}

function recursiveMkdirArgument(): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['object'],
    objectLiteralFields: [
      {
        name: 'recursive',
        valueTypes: ['boolean'],
        booleanLiterals: [true],
        optional: false
      }
    ]
  }
}

function readdirWithFileTypesArgument(): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['object'],
    objectLiteralFields: [
      {
        name: 'withFileTypes',
        valueTypes: ['boolean'],
        booleanLiterals: [true],
        optional: false
      }
    ]
  }
}

function aliases(ownerLibraryId: string, name: string, promise: boolean): string[] {
  if (!promise) {
    return [binding(ownerLibraryId, `default.${name}`)]
  }

  return [
    binding(ownerLibraryId, `default.${name}`),
    binding(libraryId, `promises.${name}`),
    binding(libraryId, `default.promises.${name}`)
  ]
}

function binding(ownerLibraryId: string, name: string): string {
  const source = ownerLibraryId
  return `${ownerLibraryId}#module:${source}:${name}`
}

function optionSource(
  argumentIndex: number,
  objectFieldName: string
): {
  argumentIndex: number
  objectFieldName: string
} {
  return { argumentIndex, objectFieldName }
}

function stringArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['string'] }
}

function numberArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['number'] }
}

function utf8Argument(label: string): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['string'],
    stringLiterals: ['utf8'],
    literalDiagnosticCode: 'INOX_TYPE_MISMATCH',
    literalDiagnosticMessage: `${label} encoding must be 'utf8' in the MVP`
  }
}

function readdirArgument(label: string): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['string', 'object'],
    stringLiterals: ['utf8'],
    literalDiagnosticCode: 'INOX_TYPE_MISMATCH',
    literalDiagnosticMessage: `${label} encoding must be 'utf8' in the MVP`,
    objectLiteralFields: [
      {
        name: 'encoding',
        valueTypes: ['string'],
        stringLiterals: ['utf8'],
        optional: true
      },
      booleanOption('withFileTypes')
    ]
  }
}

function objectArgument(objectLiteralFields: LibraryObjectLiteralFieldDescriptor[]): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['object'],
    objectLiteralFields
  }
}

function booleanOption(name: string): LibraryObjectLiteralFieldDescriptor {
  return {
    name,
    valueTypes: ['boolean'],
    booleanLiterals: [false, true],
    optional: true
  }
}
