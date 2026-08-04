import type {
  CompilerLibraryPackageDescriptor,
  LibraryCArgumentKind,
  LibraryOperationDescriptor
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'global:math'
const runtimeRequirement = libraryId
const randomRuntimeRequirement = `${libraryId}#random`
const randomBackendOptionId = `${libraryId}#random-backend`
const randomSeedOptionId = `${libraryId}#random-seed`

const operations: LibraryOperationDescriptor[] = [
  constantOperation('E'),
  constantOperation('PI'),
  unaryOperation('abs'),
  unaryOperation('acos'),
  unaryOperation('asin'),
  unaryOperation('atan'),
  binaryOperation('atan2'),
  unaryOperation('cbrt'),
  unaryOperation('ceil'),
  unaryOperation('cos'),
  unaryOperation('exp'),
  unaryOperation('floor'),
  unaryOperation('fround'),
  variadicOperation('hypot'),
  unaryOperation('log'),
  unaryOperation('log10'),
  unaryOperation('log2'),
  variadicOperation('max'),
  variadicOperation('min'),
  binaryOperation('pow'),
  nullaryOperation('random'),
  unaryOperation('round'),
  unaryOperation('sign'),
  unaryOperation('sin'),
  unaryOperation('sqrt'),
  unaryOperation('tan'),
  unaryOperation('trunc')
]

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: [],
  options: [
    {
      libraryId,
      optionId: randomBackendOptionId,
      cliAliases: ['--random-backend'],
      valueType: 'string',
      defaultValue: 'auto',
      allowedValues: ['auto', 'simple', 'xorshift32', 'os']
    },
    {
      libraryId,
      optionId: randomSeedOptionId,
      cliAliases: ['--random-seed'],
      valueType: 'number',
      defaultValue: 1831565813,
      integer: true,
      minimum: 0,
      maximum: 4294967295
    }
  ],
  runtimeInitializers: [
    {
      libraryId,
      initializerId: `${libraryId}#object`,
      runtimeRequirement,
      cType: 'MathObject',
      cName: 'Math',
      arguments: [
        {
          optionId: randomSeedOptionId,
          source: 'value',
          cValueKind: 'uint32-hex'
        },
        {
          optionId: randomSeedOptionId,
          source: 'present',
          cValueKind: 'boolean'
        },
        {
          optionId: randomBackendOptionId,
          source: 'value',
          cValueKind: 'mapped',
          cValueMap: [
            { value: 'auto', cExpression: 'MathRandomBackend::Auto' },
            { value: 'simple', cExpression: 'MathRandomBackend::Simple' },
            { value: 'xorshift32', cExpression: 'MathRandomBackend::Xorshift32' },
            { value: 'os', cExpression: 'MathRandomBackend::Os' }
          ]
        }
      ]
    }
  ],
  operations,
  intrinsicBindings: [],
  runtimeRequirements: [
    {
      id: runtimeRequirement,
      dependencies: [],
      cPreludeIncludes: ['inox/math.h'],
      capabilities: []
    },
    {
      id: randomRuntimeRequirement,
      dependencies: [runtimeRequirement],
      cPreludeIncludes: [],
      capabilities: [],
      conditionalCapabilities: [
        {
          capability: 'entropy',
          conditions: [
            {
              optionId: randomBackendOptionId,
              source: 'value',
              values: ['os']
            }
          ]
        },
        {
          capability: 'entropy',
          conditions: [
            {
              optionId: randomBackendOptionId,
              source: 'value',
              values: ['auto']
            },
            {
              optionId: randomSeedOptionId,
              source: 'present',
              values: [false]
            }
          ]
        }
      ]
    }
  ]
}

function nullaryOperation(name: string): LibraryOperationDescriptor {
  const runtimeRequirements = name === 'random'
    ? [runtimeRequirement, randomRuntimeRequirement]
    : [runtimeRequirement]

  return operation(name, [], runtimeRequirements)
}

function constantOperation(name: string): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: `global:Math.${name}`,
    operationId: `${libraryId}#${name}`,
    kind: 'member-read',
    runtimeRequirements: [runtimeRequirement],
    cExpression: `Math.${name}`,
    resultTypeRef: numberTypeRef()
  }
}

function unaryOperation(name: string): LibraryOperationDescriptor {
  return operation(name, ['number'], [runtimeRequirement])
}

function binaryOperation(name: string): LibraryOperationDescriptor {
  return operation(name, ['number', 'number'], [runtimeRequirement])
}

function variadicOperation(name: string): LibraryOperationDescriptor {
  return {
    ...operation(name, ['variadic-number-array', 'variadic-count'], [runtimeRequirement]),
    variants: [
      { minArgs: 0, maxArgs: 0, cArgumentKinds: [] },
      { minArgs: 1, maxArgs: 1, cArgumentKinds: ['number'] },
      { minArgs: 2, maxArgs: 2, cArgumentKinds: ['number', 'number'] }
    ],
    minArgs: 0,
    maxArgs: null,
    argumentChecks: [{ valueTypes: ['number'] }]
  }
}

function operation(
  name: string,
  cArgumentKinds: LibraryCArgumentKind[],
  runtimeRequirements: string[]
): LibraryOperationDescriptor {
  const argumentChecks = []

  for (let index = 0; index < cArgumentKinds.length; index = index + 1) {
    argumentChecks.push({ valueTypes: ['number'] })
  }

  return {
    libraryId,
    bindingId: `global:Math.${name}`,
    operationId: `${libraryId}#${name}`,
    kind: 'call',
    runtimeRequirements,
    cExpression: `Math.${name}`,
    cArgumentKinds,
    minArgs: cArgumentKinds.length,
    maxArgs: cArgumentKinds.length,
    argumentChecks,
    resultTypeRef: numberTypeRef()
  }
}

function numberTypeRef() {
  return {
    kind: 'primitive' as const,
    name: 'number' as const,
    nullable: false,
    ownership: 'value' as const,
    traits: []
  }
}
