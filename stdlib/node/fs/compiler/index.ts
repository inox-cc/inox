import type {
  CompilerLibraryPackageDescriptor,
  LibraryArgumentCheckDescriptor,
  LibraryCArgumentKind,
  LibraryCResultMappingDescriptor,
  LibraryObjectLiteralFieldDescriptor,
  LibraryOperationDescriptor,
  LibraryOperationVariantDescriptor,
  NominalTypeRef,
  PrimitiveTypeRef,
  TypeRef
} from '../../../../compiler/extensions/types.ts'
import { errorTypeRef } from '../../../global/error/compiler/index.ts'

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
  ...callbackMethodNames().map(unsupportedCallbackOperation)
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
        { name: 'size', valueType: 'number', readonly: true },
        { name: 'mode', valueType: 'number', readonly: true },
        { name: 'mtimeMs', valueType: 'number', readonly: true }
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
      fields: [{ name: 'name', valueType: 'string', readonly: true }]
    }
  ],
  operations,
  intrinsicBindings: [],
  runtimeRequirements: [
    {
      id: runtimeRequirement,
      dependencies: ['async-runtime', arrayRuntimeRequirement, 'managed-values', 'node:buffer', 'string-bytes'],
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
        cArgumentAdapters: ['', 'Uint8Array($value)']
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
    cFailureMode: 'thrown',
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

function unsupportedCallbackOperation(name: string): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: binding(libraryId, name),
    bindingAliases: [binding(libraryId, `default.${name}`)],
    operationId: `${libraryId}#callback:${name}`,
    kind: 'call',
    runtimeRequirements: [],
    diagnosticCode: 'INOX_FS_UNSUPPORTED',
    diagnosticMessage: `Node fs.${name} callback API is not supported yet; use fs.promises.${name}`
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

function callbackMethodNames(): string[] {
  return [
    'access',
    'appendFile',
    'copyFile',
    'lstat',
    'mkdir',
    'readFile',
    'readdir',
    'readlink',
    'realpath',
    'rename',
    'rm',
    'stat',
    'symlink',
    'unlink',
    'writeFile'
  ]
}
