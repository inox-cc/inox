import type {
  CompilerLibraryPackageDescriptor,
  LibraryArgumentCheckDescriptor,
  LibraryCArgumentKind,
  LibraryObjectLiteralFieldDescriptor,
  LibraryOperationDescriptor,
  LibraryOperationVariantDescriptor
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'node:fs'
const promisesLibraryId = 'node:fs/promises'
const runtimeRequirement = libraryId
const statsTypeId = `${libraryId}#Stats`
const direntTypeId = `${libraryId}#Dirent`
const bufferTypeId = 'node:buffer#Buffer'

const operations: LibraryOperationDescriptor[] = [
  accessOperation('accessSync', false, libraryId),
  writeOperation('appendFileSync', false, libraryId),
  twoPathOperation('copyFileSync', false, libraryId, 'void'),
  statsOperation('lstatSync', false, libraryId),
  mkdirOperation('mkdirSync', false, libraryId),
  readFileOperation('readFileSync', false, libraryId),
  readdirOperation('readdirSync', false, libraryId),
  stringPathOperation('readlinkSync', false, libraryId),
  stringPathOperation('realpathSync', false, libraryId),
  twoPathOperation('renameSync', false, libraryId, 'void'),
  rmOperation('rmSync', false, libraryId),
  statsOperation('statSync', false, libraryId),
  twoPathOperation('symlinkSync', false, libraryId, 'void'),
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
  dependencies: ['global:collections', 'node:buffer'],
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
      fields: [
        { name: 'name', valueType: 'string', readonly: true }
      ]
    }
  ],
  operations,
  intrinsicBindings: [],
  runtimeRequirements: [
    {
      id: runtimeRequirement,
      dependencies: ['async-runtime', 'collections', 'managed-values', 'node:buffer', 'string-bytes'],
      cPreludeIncludes: ['inox/fs.h'],
      capabilities: ['fs']
    }
  ]
}

export function createFsPromiseOperations(): LibraryOperationDescriptor[] {
  return [
    accessOperation('access', true, promisesLibraryId),
    writeOperation('appendFile', true, promisesLibraryId),
    twoPathOperation('copyFile', true, promisesLibraryId, 'void'),
    statsOperation('lstat', true, promisesLibraryId),
    mkdirOperation('mkdir', true, promisesLibraryId),
    readFileOperation('readFile', true, promisesLibraryId),
    readdirOperation('readdir', true, promisesLibraryId),
    stringPathOperation('readlink', true, promisesLibraryId),
    stringPathOperation('realpath', true, promisesLibraryId),
    twoPathOperation('rename', true, promisesLibraryId, 'void'),
    rmOperation('rm', true, promisesLibraryId),
    statsOperation('stat', true, promisesLibraryId),
    twoPathOperation('symlink', true, promisesLibraryId, 'void'),
    voidPathOperation('unlink', true, promisesLibraryId),
    writeOperation('writeFile', true, promisesLibraryId)
  ]
}

function accessOperation(
  name: string,
  promise: boolean,
  ownerLibraryId: string
): LibraryOperationDescriptor {
  return operationWithVariants(name, promise, ownerLibraryId, 1, 2, [stringArgument(), numberArgument()], [
    variant(name, promise, 1, 1, ['string-view'], promise ? 'inox::Promise' : 'void', promise ? 'promise' : 'void', {
      promiseValueType: promise ? 'void' : null
    }),
    variant(name, promise, 2, 2, ['string-view', 'number'], promise ? 'inox::Promise' : 'void', promise ? 'promise' : 'void', {
      promiseValueType: promise ? 'void' : null
    })
  ])
}

function mkdirOperation(
  name: string,
  promise: boolean,
  ownerLibraryId: string
): LibraryOperationDescriptor {
  return callOperation(name, promise, ownerLibraryId, [
    'string-view',
    'object-boolean-field'
  ], promise ? 'inox::Promise' : 'void', promise ? 'promise' : 'void', 1, 2, [
    stringArgument(),
    objectArgument([booleanOption('recursive')])
  ], {
    cArgumentSources: [null, optionSource(1, 'recursive')],
    promiseValueType: promise ? 'void' : null
  })
}

function rmOperation(
  name: string,
  promise: boolean,
  ownerLibraryId: string
): LibraryOperationDescriptor {
  return callOperation(name, promise, ownerLibraryId, [
    'string-view',
    'object-boolean-field',
    'object-boolean-field'
  ], promise ? 'inox::Promise' : 'void', promise ? 'promise' : 'void', 1, 2, [
    stringArgument(),
    objectArgument([booleanOption('recursive'), booleanOption('force')])
  ], {
    cArgumentSources: [null, optionSource(1, 'recursive'), optionSource(1, 'force')],
    promiseValueType: promise ? 'void' : null
  })
}

function readFileOperation(
  name: string,
  promise: boolean,
  ownerLibraryId: string
): LibraryOperationDescriptor {
  return operationWithVariants(name, promise, ownerLibraryId, 1, 2, [
    stringArgument(),
    utf8Argument(name)
  ], [
    variant(name, promise, 1, 1, ['string-view'], promise ? 'inox::Promise' : 'Buffer', promise ? 'promise' : 'bytes', {
      promiseValueType: promise ? 'bytes' : null,
      resultTypeId: bufferTypeId
    }),
    variant(name, promise, 2, 2, ['string-view', 'string-view'], promise ? 'inox::Promise' : 'inox::String', promise ? 'promise' : 'string', {
      promiseValueType: promise ? 'string' : null
    })
  ])
}

function readdirOperation(
  name: string,
  promise: boolean,
  ownerLibraryId: string
): LibraryOperationDescriptor {
  const cppType = promise ? 'inox::Promise' : 'ArrayClass'
  const valueType = promise ? 'promise' : 'array'

  return operationWithVariants(name, promise, ownerLibraryId, 1, 2, [
    stringArgument(),
    readdirArgument(name)
  ], [
    {
      ...variant(name, promise, 2, 2, ['string-view', 'object-boolean-field'], cppType, valueType, {
        promiseValueType: promise ? 'array' : null,
        resultArrayElementType: 'object',
        resultArrayElementTypeId: direntTypeId
      }),
      argumentIndex: 1,
      argumentValueTypes: ['object'],
      objectFieldName: 'withFileTypes',
      booleanLiterals: [true],
      cArgumentAdapters: ['', 'FsReadDirOptions{$value}'],
      cArgumentSources: [null, optionSource(1, 'withFileTypes')]
    },
    {
      ...variant(name, promise, 2, 2, ['string-view', 'string-view'], cppType, valueType, {
        promiseValueType: promise ? 'array' : null,
        resultArrayElementType: 'string'
      }),
      argumentIndex: 1,
      argumentValueTypes: ['string']
    },
    {
      ...variant(name, promise, 2, 2, ['string-view'], cppType, valueType, {
        promiseValueType: promise ? 'array' : null,
        resultArrayElementType: 'string'
      }),
      argumentIndex: 1,
      argumentValueTypes: ['object']
    },
    variant(name, promise, 1, 1, ['string-view'], cppType, valueType, {
      promiseValueType: promise ? 'array' : null,
      resultArrayElementType: 'string'
    })
  ])
}

function writeOperation(
  name: string,
  promise: boolean,
  ownerLibraryId: string
): LibraryOperationDescriptor {
  const cppType = promise ? 'inox::Promise' : 'void'
  const valueType = promise ? 'promise' : 'void'

  return operationWithVariants(name, promise, ownerLibraryId, 2, 3, [
    stringArgument(),
    { valueTypes: ['string', 'bytes'] },
    utf8Argument(name)
  ], [
    {
      ...variant(name, promise, 2, 3, ['string-view', 'string-view'], cppType, valueType, {
        promiseValueType: promise ? 'void' : null
      }),
      argumentIndex: 1,
      argumentValueTypes: ['string']
    },
    {
      ...variant(name, promise, 2, 3, ['string-view', 'value'], cppType, valueType, {
        promiseValueType: promise ? 'void' : null
      }),
      argumentIndex: 1,
      argumentValueTypes: ['bytes'],
      cArgumentAdapters: ['', 'Uint8Array($value)']
    }
  ])
}

function statsOperation(
  name: string,
  promise: boolean,
  ownerLibraryId: string
): LibraryOperationDescriptor {
  return callOperation(
    name,
    promise,
    ownerLibraryId,
    ['string-view'],
    promise ? 'inox::Promise' : 'FsStats',
    promise ? 'promise' : 'object',
    1,
    1,
    [stringArgument()],
    {
      resultTypeId: statsTypeId,
      promiseValueType: promise ? 'object' : null
    }
  )
}

function stringPathOperation(
  name: string,
  promise: boolean,
  ownerLibraryId: string
): LibraryOperationDescriptor {
  return callOperation(
    name,
    promise,
    ownerLibraryId,
    ['string-view'],
    promise ? 'inox::Promise' : 'inox::String',
    promise ? 'promise' : 'string',
    1,
    1,
    [stringArgument()],
    { promiseValueType: promise ? 'string' : null }
  )
}

function voidPathOperation(
  name: string,
  promise: boolean,
  ownerLibraryId: string
): LibraryOperationDescriptor {
  return callOperation(
    name,
    promise,
    ownerLibraryId,
    ['string-view'],
    promise ? 'inox::Promise' : 'void',
    promise ? 'promise' : 'void',
    1,
    1,
    [stringArgument()],
    { promiseValueType: promise ? 'void' : null }
  )
}

function twoPathOperation(
  name: string,
  promise: boolean,
  ownerLibraryId: string,
  fulfilledType: string
): LibraryOperationDescriptor {
  return callOperation(
    name,
    promise,
    ownerLibraryId,
    ['string-view', 'string-view'],
    promise ? 'inox::Promise' : fulfilledType === 'void' ? 'void' : 'inox::String',
    promise ? 'promise' : fulfilledType,
    2,
    2,
    [stringArgument(), stringArgument()],
    { promiseValueType: promise ? fulfilledType : null }
  )
}

type CallOptions = {
  cArgumentSources?: Array<{ argumentIndex: number; objectFieldName: string } | null>
  promiseValueType?: string | null
  resultArrayElementType?: string | null
  resultArrayElementTypeId?: string | null
  resultTypeId?: string | null
}

function callOperation(
  name: string,
  promise: boolean,
  ownerLibraryId: string,
  cArgumentKinds: LibraryCArgumentKind[],
  cppType: string,
  valueType: string,
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
    resultArrayElementType: options.resultArrayElementType,
    resultArrayElementTypeId: options.resultArrayElementTypeId,
    resultTypeId: options.resultTypeId,
    cppType,
    valueType,
    promiseValueType: options.promiseValueType,
    promiseRejectionValueType: promise ? 'error' : null,
    nullable: false,
    owned: false
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
    variants,
    nullable: false,
    owned: false
  }
}

function variant(
  name: string,
  promise: boolean,
  minArgs: number,
  maxArgs: number,
  cArgumentKinds: LibraryCArgumentKind[],
  cppType: string,
  valueType: string,
  options: CallOptions = {}
): LibraryOperationVariantDescriptor {
  return {
    minArgs,
    maxArgs,
    cExpression: promise ? `fs.promises.${name}` : `fs.${name}`,
    cArgumentKinds,
    cArgumentSources: options.cArgumentSources,
    resultArrayElementType: options.resultArrayElementType,
    resultArrayElementTypeId: options.resultArrayElementTypeId,
    resultTypeId: options.resultTypeId,
    cppType,
    valueType,
    promiseValueType: options.promiseValueType,
    promiseRejectionValueType: promise ? 'error' : null,
    nullable: false,
    owned: false
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
    cppType: 'double',
    valueType: 'number',
    nullable: false,
    owned: false
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
    cppType: 'bool',
    valueType: 'boolean',
    nullable: false,
    owned: false
  }
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

function optionSource(argumentIndex: number, objectFieldName: string): {
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

function objectArgument(
  objectLiteralFields: LibraryObjectLiteralFieldDescriptor[]
): LibraryArgumentCheckDescriptor {
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
