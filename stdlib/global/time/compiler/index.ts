import type {
  CompilerLibraryPackageDescriptor,
  LibraryArgumentCheckDescriptor,
  LibraryCArgumentKind,
  LibraryOperationDescriptor,
  LibraryOperationVariantDescriptor
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'global:time'
const runtimeRequirement = libraryId
const wallRuntimeRequirement = `${libraryId}#wall`
const monotonicRuntimeRequirement = `${libraryId}#monotonic`
const stringRuntimeRequirement = `${libraryId}#string`
const dateTypeId = `${libraryId}#Date`

const numberMethods = [
  'getDate',
  'getDay',
  'getFullYear',
  'getHours',
  'getMilliseconds',
  'getMinutes',
  'getMonth',
  'getSeconds',
  'getTime',
  'getTimezoneOffset',
  'getUTCDate',
  'getUTCDay',
  'getUTCFullYear',
  'getUTCHours',
  'getUTCMilliseconds',
  'getUTCMinutes',
  'getUTCMonth',
  'getUTCSeconds',
  'valueOf'
]

const stringMethods = [
  'toDateString',
  'toISOString',
  'toJSON',
  'toString',
  'toTimeString',
  'toUTCString'
]

const operations: LibraryOperationDescriptor[] = [
  dateConstructor(),
  staticCall('Date', 'now', [], 'double', 'number', 0, 0, [], [wallRuntimeRequirement]),
  staticCall(
    'Date',
    'parse',
    ['string-view'],
    'double',
    'number',
    1,
    1,
    [argument(['string'])],
    [stringRuntimeRequirement]
  ),
  staticCall(
    'Date',
    'UTC',
    datePartsArgumentKinds(),
    'double',
    'number',
    2,
    7,
    repeatedArguments(7, ['number']),
    [runtimeRequirement]
  ),
  staticCall(
    'performance',
    'now',
    [],
    'double',
    'number',
    0,
    0,
    [],
    [monotonicRuntimeRequirement]
  )
]

for (let index = 0; index < numberMethods.length; index = index + 1) {
  operations.push(dateReceiverCall(numberMethods[index], 'double', 'number', [runtimeRequirement]))
}

for (let index = 0; index < stringMethods.length; index = index + 1) {
  operations.push(dateReceiverCall(stringMethods[index], 'inox::String', 'string', [stringRuntimeRequirement]))
}

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: [],
  nativeTypes: [
    {
      libraryId,
      typeId: dateTypeId,
      declarationNames: ['Date'],
      valueType: 'object',
      cppType: 'DateValue',
      baseTypeIds: [],
      runtimeRequirements: [runtimeRequirement]
    }
  ],
  operations,
  intrinsicBindings: [],
  runtimeRequirements: [
    {
      id: runtimeRequirement,
      dependencies: [],
      cPreludeIncludes: ['inox/time.h'],
      capabilities: []
    },
    {
      id: wallRuntimeRequirement,
      dependencies: [runtimeRequirement],
      cPreludeIncludes: [],
      capabilities: ['wallClock']
    },
    {
      id: monotonicRuntimeRequirement,
      dependencies: [runtimeRequirement],
      cPreludeIncludes: [],
      capabilities: ['monotonicClock']
    },
    {
      id: stringRuntimeRequirement,
      dependencies: [runtimeRequirement, 'managed-values', 'string-bytes'],
      cPreludeIncludes: [],
      capabilities: []
    }
  ]
}

function dateConstructor(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: 'global:Date',
    operationId: `${libraryId}#Date.construct`,
    kind: 'construct',
    runtimeRequirements: [runtimeRequirement],
    variants: [
      constructorVariant(0, 0, [wallRuntimeRequirement], [], []),
      constructorVariant(1, 1, [runtimeRequirement], ['number'], [argument(['number'])], 0, ['number']),
      constructorVariant(
        1,
        1,
        [stringRuntimeRequirement],
        ['string-view'],
        [argument(['string'])],
        0,
        ['string']
      ),
      constructorVariant(
        1,
        1,
        [runtimeRequirement],
        ['value'],
        [argument(['object'], [dateTypeId])],
        0,
        ['object']
      ),
      constructorVariant(2, 7, [runtimeRequirement], datePartsArgumentKinds(), repeatedArguments(7, ['number']))
    ],
    minArgs: 0,
    maxArgs: 7,
    resultTypeId: dateTypeId,
    cResultMode: 'value',
    cppType: 'DateValue',
    valueType: 'object',
    nullable: false,
    owned: false
  }
}

function constructorVariant(
  minArgs: number,
  maxArgs: number,
  runtimeRequirements: string[],
  cArgumentKinds: LibraryCArgumentKind[],
  argumentChecks: LibraryArgumentCheckDescriptor[],
  argumentIndex?: number,
  argumentValueTypes?: string[]
): LibraryOperationVariantDescriptor {
  return {
    runtimeRequirements,
    minArgs,
    maxArgs,
    argumentChecks,
    argumentIndex,
    argumentValueTypes,
    cExpression: 'Date',
    cArgumentKinds,
    cResultMode: 'value',
    resultTypeId: dateTypeId,
    cppType: 'DateValue',
    valueType: 'object',
    nullable: false,
    owned: false
  }
}

function staticCall(
  root: string,
  name: string,
  cArgumentKinds: LibraryCArgumentKind[],
  cppType: string,
  valueType: string,
  minArgs: number,
  maxArgs: number,
  argumentChecks: LibraryArgumentCheckDescriptor[],
  runtimeRequirements: string[]
): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: `global:${root}.${name}`,
    operationId: `${libraryId}#${root}.${name}`,
    kind: 'call',
    runtimeRequirements,
    cExpression: `${root}.${name}`,
    cArgumentKinds,
    minArgs,
    maxArgs,
    argumentChecks,
    cppType,
    valueType,
    nullable: false,
    owned: false
  }
}

function dateReceiverCall(
  name: string,
  cppType: string,
  valueType: string,
  runtimeRequirements: string[]
): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: `${dateTypeId}.${name}`,
    operationId: `${libraryId}#Date.${name}`,
    kind: 'call',
    runtimeRequirements,
    receiverTypeId: dateTypeId,
    cExpression: name,
    cArgumentKinds: ['receiver'],
    cCallStyle: 'member',
    minArgs: 0,
    maxArgs: 0,
    argumentChecks: [],
    cppType,
    valueType,
    nullable: false,
    owned: false
  }
}

function datePartsArgumentKinds(): LibraryCArgumentKind[] {
  return [
    'number',
    'number',
    'optional-number',
    'optional-number',
    'optional-number',
    'optional-number',
    'optional-number'
  ]
}

function argument(valueTypes: string[], objectTypeIds?: string[]): LibraryArgumentCheckDescriptor {
  return { valueTypes, objectTypeIds }
}

function repeatedArguments(count: number, valueTypes: string[]): LibraryArgumentCheckDescriptor[] {
  const checks: LibraryArgumentCheckDescriptor[] = []

  for (let index = 0; index < count; index = index + 1) {
    checks.push(argument(valueTypes))
  }

  return checks
}
