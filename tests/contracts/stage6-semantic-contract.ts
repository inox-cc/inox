import { compileSource } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type {
  CompilerLibraryDescriptor,
  CompilerLibrarySet,
  LibraryOperationDescriptor,
  LibraryOperationTypeParameterDescriptor,
  NominalTypeRef,
  PrimitiveTypeRef,
  TypeRef
} from '../../compiler/extensions/types.ts'
import type { IrProgram } from '../../compiler/types.ts'

export type Stage6SemanticContractResult = {
  ok: boolean
  failures: string[]
  snapshot: Stage8DecouplingContractSnapshot
}

type ContractDiagnostic = {
  code: string
  message: string
}

type ContractSnapshotDiagnostic = ContractDiagnostic & {
  column: number
  file: string | null
  line: number
  severity: string
}

type Stage8DecouplingContractCase = {
  code: string | null
  diagnostics: ContractSnapshotDiagnostic[]
  ir: IrProgram | null
  name: string
  runtimeRequirements: string[]
}

export type Stage8DecouplingContractSnapshot = {
  cases: Stage8DecouplingContractCase[]
  version: number
}

const sequenceLibraryId = 'fixture:sequence-profile'
const sequenceTypeId = `${sequenceLibraryId}#SequenceState`
const sequenceBindingId = 'global:FixtureSequence'
const futureLibraryId = 'fixture:future-profile'
const futureTypeId = `${futureLibraryId}#FutureState`
const futureBindingId = 'global:FixtureFuture'
const futureRuntimeRequirement = `${futureLibraryId}#engine`
const sequenceContractSource = [
  'function update(values: FixtureSequence<number>): number {',
  '  const first = values[0]',
  '  values[0] = first + 1',
  '  let total = 0',
  '  for (const value of values) total = total + value',
  '  return values.append(2) + values.count + total',
  '}',
  'update([1])'
].join('\n')
const futureContractSource = [
  'async function advance(value: number): FixtureFuture<number> {',
  '  const current = await FixtureFuture.succeed(value)',
  '  return current + 1',
  '}',
  'advance(1).map((value) => value + 1)',
  'FixtureFuture.fail(1).recover(() => 1)'
].join('\n')
const providerAbsentCoreSource = [
  'class Counter { value: number = 1 }',
  'function add(left: number, right: number): number {',
  '  return left + right',
  '}',
  'add(new Counter().value, 2)'
].join('\n')
const missingArrayLiteralSource = 'const values = [1, 2]'
const missingArrayLengthSource = 'let values: number[]\nconst size = values.length'
const missingArrayPushSource = 'let values: number[]\nvalues.push(1)'
const missingAsyncResultSource = 'async function work() {}\nwork()'
const missingSequenceTypeSource =
  'function read(values: FixtureSequence<number>): number { return values.count }'
const missingFutureGlobalSource = 'function start(): unknown { return FixtureFuture.succeed(1) }'

const elementTypeRef: TypeRef = { kind: 'parameter', name: 'T' }
const mappedTypeRef: TypeRef = { kind: 'parameter', name: 'U' }
const rejectedTypeRef: TypeRef = { kind: 'parameter', name: 'E' }
const numberTypeRef: PrimitiveTypeRef = {
  kind: 'primitive',
  name: 'number',
  nullable: false,
  ownership: 'value',
  traits: []
}
const unknownTypeRef: TypeRef = {
  kind: 'unknown',
  nullable: false,
  ownership: 'value',
  traits: []
}
const voidTypeRef: TypeRef = {
  kind: 'primitive',
  name: 'void',
  nullable: false,
  ownership: 'value',
  traits: []
}

/** Runs the portable provider-independence proof used by both hosted and native checks. */
export function runStage6SemanticContract(): Stage6SemanticContractResult {
  const failures: string[] = []
  const libraries = stage6RenamedProviderLibrarySet()

  checkSequenceProvider(libraries, failures)
  checkFutureProvider(libraries, failures)
  checkProviderAbsentProfile(failures)

  return {
    ok: failures.length === 0,
    failures,
    snapshot: stage8DecouplingContractSnapshot(libraries)
  }
}

export function stage8DecouplingContractSnapshot(
  libraries: CompilerLibrarySet = stage6RenamedProviderLibrarySet()
): Stage8DecouplingContractSnapshot {
  const absentLibraries = createCompilerLibrarySet([])

  return {
    version: 2,
    cases: [
      contractCaseSnapshot('renamed-sequence-provider', sequenceContractSource, libraries),
      contractCaseSnapshot('renamed-async-result-provider', futureContractSource, libraries),
      contractCaseSnapshot('provider-absent-core', providerAbsentCoreSource, absentLibraries),
      contractCaseSnapshot('provider-absent-array-literal', missingArrayLiteralSource, absentLibraries),
      contractCaseSnapshot('provider-absent-array-member', missingArrayLengthSource, absentLibraries),
      contractCaseSnapshot('provider-absent-array-call', missingArrayPushSource, absentLibraries),
      contractCaseSnapshot('provider-absent-async-result', missingAsyncResultSource, absentLibraries),
      contractCaseSnapshot('provider-absent-sequence-type', missingSequenceTypeSource, absentLibraries),
      contractCaseSnapshot('provider-absent-future-global', missingFutureGlobalSource, absentLibraries)
    ]
  }
}

export function stage6RenamedProviderLibrarySet(): CompilerLibrarySet {
  return createCompilerLibrarySet([sequenceLibrary(), futureLibrary()])
}

function checkSequenceProvider(libraries: CompilerLibrarySet, failures: string[]): void {
  const result = compileSource(sequenceContractSource, { libraries, target: 'cc' })

  requireText(result.code, 'FixtureSequence::empty()', 'sequence literal provider was not selected', failures)
  requireText(result.code, '.readNative(0)', 'sequence index-read operation was not selected', failures)
  requireText(result.code, '.writeNative(0, ', 'sequence index-write operation was not selected', failures)
  requireText(result.code, '.appendNative(', 'sequence call operation was not selected', failures)
  requireText(result.code, '.measure()', 'sequence member-read operation was not selected', failures)
  requireText(result.code, '.walk()', 'sequence iterator contract was not selected', failures)
  rejectText(result.code, 'Array::', 'sequence lowering retained an Array C++ tail', failures)
  rejectText(result.code, '.length()', 'sequence lowering retained a length operation tail', failures)
  rejectText(result.code, '.push(', 'sequence lowering retained a push operation tail', failures)
}

function checkFutureProvider(libraries: CompilerLibrarySet, failures: string[]): void {
  const result = compileSource(futureContractSource, { libraries, target: 'cc' })

  requireText(result.code, 'FixtureFuture::start', 'renamed async-result create operation was not selected', failures)
  requireText(
    result.code,
    'FixtureFuture::completed',
    'renamed async-result fulfill operation was not selected',
    failures
  )
  requireText(result.code, 'FixtureFuture::bridgeWatch(', 'renamed await bridge was not selected', failures)
  requireText(result.code, '.transformValue(', 'renamed map operation was not selected', failures)
  requireText(result.code, 'FixtureFuture::failed(', 'renamed async-result reject operation was not selected', failures)
  requireText(result.code, '.recoverFailure(', 'renamed recovery operation was not selected', failures)
  requireRequirement(
    result.ir.runtimeRequirements,
    futureRuntimeRequirement,
    'renamed async-result runtime requirement was not selected',
    failures
  )
  rejectText(result.code, 'Promise', 'renamed async-result lowering retained a Promise tail', failures)
  rejectRequirementPrefix(
    result.ir.runtimeRequirements,
    'global:promise',
    'renamed async-result lowering retained a promise runtime tail',
    failures
  )
}

function checkProviderAbsentProfile(failures: string[]): void {
  const libraries = createCompilerLibrarySet([])
  const result = compileSource(providerAbsentCoreSource, { libraries, target: 'cc' })

  rejectText(result.code, 'FixtureSequence', 'provider-absent core program retained a sequence tail', failures)
  rejectText(result.code, 'FixtureFuture', 'provider-absent core program retained a future tail', failures)
  rejectText(result.code, 'Array::', 'provider-absent core program retained an Array tail', failures)
  rejectText(result.code, 'Promise', 'provider-absent core program retained a Promise tail', failures)
  requireDiagnostic(
    missingArrayLiteralSource,
    libraries,
    'INOX_MISSING_INTRINSIC_PROVIDER',
    'missing compiler library intrinsic provider array-literal',
    'provider-absent profile did not reject array literal through the generic intrinsic diagnostic',
    failures
  )
  requireDiagnostic(
    missingArrayLengthSource,
    libraries,
    'INOX_UNKNOWN_FIELD',
    'unknown field length',
    'provider-absent profile did not reject unresolved member read before C++ emission',
    failures
  )
  requireDiagnostic(
    missingArrayPushSource,
    libraries,
    'INOX_UNKNOWN_FIELD',
    'unknown field push',
    'provider-absent profile did not reject unresolved member call before C++ emission',
    failures
  )
  requireDiagnostic(
    missingAsyncResultSource,
    libraries,
    'INOX_MISSING_INTRINSIC_PROVIDER',
    'missing compiler library intrinsic provider async-result',
    'provider-absent profile did not reject async result materialization through the generic intrinsic diagnostic',
    failures
  )
  requireCompileFailure(
    missingSequenceTypeSource,
    libraries,
    'provider-absent profile still knows FixtureSequence',
    failures
  )
  requireCompileFailure(
    missingFutureGlobalSource,
    libraries,
    'provider-absent profile still knows FixtureFuture',
    failures
  )
}

function contractCaseSnapshot(
  name: string,
  source: string,
  libraries: CompilerLibrarySet
): Stage8DecouplingContractCase {
  try {
    const result = compileSource(source, { libraries, target: 'cc' })

    return {
      name,
      code: result.code,
      ir: result.ir,
      runtimeRequirements: result.ir.runtimeRequirements.slice().sort(),
      diagnostics: []
    }
  } catch (error) {
    const diagnostics = contractDiagnosticsFromThrownValue(error) ?? []

    return {
      name,
      code: null,
      ir: null,
      runtimeRequirements: [],
      diagnostics: diagnostics.map((item: any) => ({
        code: item.code,
        message: item.message,
        line: item.line,
        column: item.column,
        file: typeof item.file === 'string' ? item.file : null,
        severity: item.severity
      }))
    }
  }
}

function requireDiagnostic(
  source: string,
  libraries: CompilerLibrarySet,
  code: string,
  message: string,
  failure: string,
  failures: string[]
): void {
  try {
    compileSource(source, { libraries, target: 'cc' })
  } catch (error) {
    const diagnostics = contractDiagnosticsFromThrownValue(error)

    if (
      diagnostics !== null &&
      typeof diagnostics !== 'undefined' &&
      diagnostics.length > 0 &&
      diagnostics[0].code === code &&
      diagnostics[0].message === message
    ) {
      return
    }
  }

  failures.push(failure)
}

function contractDiagnosticsFromThrownValue(error: any): ContractDiagnostic[] | null {
  if (
    error !== null &&
    typeof error !== 'undefined' &&
    error.diagnostics !== null &&
    typeof error.diagnostics !== 'undefined'
  ) {
    return error.diagnostics
  }

  return null
}

function requireCompileFailure(
  source: string,
  libraries: CompilerLibrarySet,
  message: string,
  failures: string[]
): void {
  let failed = false

  try {
    compileSource(source, { libraries, target: 'cc' })
  } catch {
    failed = true
  }

  if (!failed) {
    failures.push(message)
  }
}

function requireText(source: string, expected: string, message: string, failures: string[]): void {
  if (!source.includes(expected)) {
    failures.push(message)
  }
}

function rejectText(source: string, forbidden: string, message: string, failures: string[]): void {
  if (source.includes(forbidden)) {
    failures.push(message)
  }
}

function requireRequirement(requirements: string[], expected: string, message: string, failures: string[]): void {
  if (!requirements.includes(expected)) {
    failures.push(message)
  }
}

function rejectRequirementPrefix(requirements: string[], prefix: string, message: string, failures: string[]): void {
  for (let index = 0; index < requirements.length; index = index + 1) {
    if (requirements[index].startsWith(prefix)) {
      failures.push(message)
      return
    }
  }
}

function sequenceLibrary(): CompilerLibraryDescriptor {
  return {
    id: sequenceLibraryId,
    dependencies: [],
    declarations: [
      {
        libraryId: sequenceLibraryId,
        kind: 'global',
        source: 'fixtures/sequence-profile.d.ts',
        declarationSource:
          'export {}; declare global { class FixtureSequence<T> { readonly count: number; append(value: T): number; } }',
        compilerImplemented: true
      }
    ],
    nativeTypes: [
      {
        libraryId: sequenceLibraryId,
        typeId: sequenceTypeId,
        declarationNames: ['FixtureSequence'],
        valueType: 'object',
        cppType: 'FixtureSequence',
        cValueAdapter: 'FixtureSequence($value)',
        cRuntimeValueExpression: '$value.rawNative()',
        baseTypeIds: [],
        runtimeRequirements: [],
        typeParameters: ['T'],
        traits: [
          { traitId: 'indexable', args: [numberTypeRef, elementTypeRef] },
          { traitId: 'iterable', args: [elementTypeRef] }
        ],
        cIteration: {
          iteratorMethod: 'walk',
          nextMethod: 'advance',
          doneMember: 'finished',
          valueMember: 'item',
          valueAdapter: '$value',
          creationFailureMode: 'thrown',
          nextFailureMode: 'thrown'
        }
      }
    ],
    operations: [
      sequenceLiteralOperation(),
      sequenceCountOperation(),
      sequenceAppendOperation(),
      sequenceIndexOperation('index-read'),
      sequenceIndexOperation('index-write')
    ],
    intrinsicBindings: [{ role: 'array-literal', bindingId: sequenceBindingId }],
    runtimeRequirements: []
  }
}

function sequenceTypeRef(): NominalTypeRef {
  return {
    kind: 'nominal',
    typeId: sequenceTypeId,
    args: [elementTypeRef],
    nullable: false,
    ownership: 'value',
    traits: [
      { traitId: 'indexable', args: [numberTypeRef, elementTypeRef] },
      { traitId: 'iterable', args: [elementTypeRef] }
    ]
  }
}

function sequenceLiteralOperation(): LibraryOperationDescriptor {
  return {
    libraryId: sequenceLibraryId,
    bindingId: sequenceBindingId,
    operationId: `${sequenceTypeId}.literal`,
    kind: 'construct',
    runtimeRequirements: [],
    cSequenceMaterialization: {
      createExpression: 'FixtureSequence::empty()',
      appendElementExpression: '$target.add($value)',
      appendSpreadExpression: '$target.addAll($value)',
      failureMode: 'thrown'
    },
    typeParameters: [{ name: 'T', sources: [{ source: 'contextual-type-argument', argumentIndex: 0 }] }],
    resultTypeRef: sequenceTypeRef(),
    minArgs: 0,
    maxArgs: 0,
    argumentChecks: []
  }
}

function sequenceCountOperation(): LibraryOperationDescriptor {
  return {
    libraryId: sequenceLibraryId,
    bindingId: `${sequenceTypeId}.count`,
    operationId: `${sequenceTypeId}.count`,
    kind: 'member-read',
    receiverTypeId: sequenceTypeId,
    runtimeRequirements: [],
    typeParameters: [{ name: 'T', sources: [{ source: 'receiver-type-argument', argumentIndex: 0 }] }],
    cExpression: 'measure',
    cArgumentKinds: ['receiver'],
    cCallStyle: 'member',
    resultTypeRef: numberTypeRef
  }
}

function sequenceAppendOperation(): LibraryOperationDescriptor {
  return {
    libraryId: sequenceLibraryId,
    bindingId: `${sequenceTypeId}.append`,
    operationId: `${sequenceTypeId}.append`,
    kind: 'call',
    receiverTypeId: sequenceTypeId,
    runtimeRequirements: [],
    typeParameters: [{ name: 'T', sources: [{ source: 'receiver-type-argument', argumentIndex: 0 }] }],
    cExpression: 'appendNative',
    cArgumentKinds: ['receiver', 'runtime-value'],
    cCallStyle: 'member',
    cResultAdapter: 'static_cast<double>($value)',
    resultTypeRef: numberTypeRef,
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [{ valueTypes: [], typeRef: elementTypeRef }]
  }
}

function sequenceIndexOperation(kind: 'index-read' | 'index-write'): LibraryOperationDescriptor {
  const write = kind === 'index-write'

  return {
    libraryId: sequenceLibraryId,
    bindingId: `${sequenceTypeId}.*`,
    operationId: `${sequenceTypeId}#${kind}`,
    kind,
    acceptsUnknownReceiver: true,
    receiverTypeId: sequenceTypeId,
    runtimeRequirements: [],
    typeParameters: [{ name: 'T', sources: [{ source: 'receiver-type-argument', argumentIndex: 0 }] }],
    cExpression: write ? 'writeNative' : 'readNative',
    cArgumentKinds: write ? ['receiver', 'number', 'runtime-value'] : ['receiver', 'number'],
    cCallStyle: 'member',
    resultTypeRef: elementTypeRef,
    minArgs: write ? 2 : 1,
    maxArgs: write ? 2 : 1,
    argumentChecks: write
      ? [{ valueTypes: ['number'] }, { valueTypes: [], typeRef: elementTypeRef }]
      : [{ valueTypes: ['number'] }]
  }
}

function futureLibrary(): CompilerLibraryDescriptor {
  return {
    id: futureLibraryId,
    dependencies: [],
    declarations: [
      {
        libraryId: futureLibraryId,
        kind: 'global',
        source: 'fixtures/future-profile.d.ts',
        declarationSource:
          'export {}; declare global { class FixtureFuture<T> { constructor(executor: (complete: (value: T) => void, abort: (reason: unknown) => void) => void); static succeed<T>(value: T): FixtureFuture<T>; static fail<E>(reason: E): FixtureFuture<unknown>; map<U>(onValue: (value: T) => U): FixtureFuture<U>; recover(onFailure: (reason: unknown) => T): FixtureFuture<T>; } }',
        compilerImplemented: true
      }
    ],
    nativeTypes: [
      {
        libraryId: futureLibraryId,
        typeId: futureTypeId,
        declarationNames: ['FixtureFuture'],
        valueType: 'async-result',
        cppType: 'FixtureFuture',
        cValueAdapter: 'FixtureFuture::fromRuntime($value)',
        baseTypeIds: [],
        runtimeRequirements: [futureRuntimeRequirement],
        cAwaitExpression: '$value.takeValue()',
        cAsyncTaskBridge: {
          cValidExpression: 'FixtureFuture::bridgeReady($source)',
          cObserveExpression: 'FixtureFuture::bridgeWatch($source, $onFulfilled, $onRejected, $context, $finalizer)',
          cFulfillExpression: 'FixtureFuture::bridgeComplete($target, $value)',
          cRejectExpression: 'FixtureFuture::bridgeAbort($target, $value)'
        },
        typeParameters: ['T'],
        traits: [{ traitId: 'awaitable', args: [elementTypeRef, unknownTypeRef] }]
      }
    ],
    operations: [
      futureCreateOperation(),
      futureFulfillOperation(),
      futureRejectOperation(),
      futureMapOperation(),
      futureRecoverOperation()
    ],
    intrinsicBindings: [{ role: 'async-result', bindingId: futureBindingId }],
    runtimeRequirements: [
      {
        id: futureRuntimeRequirement,
        dependencies: ['async-runtime', 'managed-values'],
        cPreludeIncludes: ['fixture/future-profile.hpp'],
        capabilities: []
      }
    ]
  }
}

function futureTypeRef(value: TypeRef, rejected: TypeRef): NominalTypeRef {
  return {
    kind: 'nominal',
    typeId: futureTypeId,
    args: [value],
    nullable: false,
    ownership: 'value',
    traits: [{ traitId: 'awaitable', args: [value, rejected] }]
  }
}

function futureCreateOperation(): LibraryOperationDescriptor {
  return {
    libraryId: futureLibraryId,
    bindingId: futureBindingId,
    operationId: `${futureTypeId}.start`,
    kind: 'construct',
    asyncResultOperation: 'create',
    cAsyncFulfillExpression: 'complete',
    cAsyncRejectExpression: 'abort',
    runtimeRequirements: [futureRuntimeRequirement],
    typeParameters: [
      {
        name: 'T',
        sources: [
          { source: 'explicit-type-argument', argumentIndex: 0 },
          { source: 'contextual-type-argument', argumentIndex: 0 }
        ]
      }
    ],
    cExpression: 'FixtureFuture::start',
    cArgumentKinds: [],
    cCallStyle: 'function',
    cResultMode: 'value',
    resultTypeRef: futureTypeRef(elementTypeRef, unknownTypeRef),
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [
      {
        valueTypes: ['function'],
        functionParameters: [
          { name: 'complete', valueType: 'function', typeRef: functionTypeRef([elementTypeRef], voidTypeRef) },
          { name: 'abort', valueType: 'function', typeRef: functionTypeRef([unknownTypeRef], voidTypeRef) }
        ],
        functionReturnType: 'void',
        functionAsync: false
      }
    ]
  }
}

function futureFulfillOperation(): LibraryOperationDescriptor {
  return {
    libraryId: futureLibraryId,
    bindingId: 'global:FixtureFuture.succeed',
    operationId: `${futureTypeId}.complete`,
    kind: 'call',
    asyncResultOperation: 'fulfill',
    runtimeRequirements: [futureRuntimeRequirement],
    typeParameters: [{ name: 'T', sources: [{ source: 'argument-type', argumentIndex: 0 }] }],
    cExpression: 'FixtureFuture::completed',
    cCallStyle: 'function',
    cResultMode: 'value',
    resultTypeRef: futureTypeRef(elementTypeRef, unknownTypeRef),
    minArgs: 1,
    maxArgs: 1,
    cArgumentKinds: ['runtime-value'],
    argumentChecks: [{ valueTypes: [], typeRef: elementTypeRef }]
  }
}

function futureRejectOperation(): LibraryOperationDescriptor {
  return {
    libraryId: futureLibraryId,
    bindingId: 'global:FixtureFuture.fail',
    operationId: `${futureTypeId}.abort`,
    kind: 'call',
    asyncResultOperation: 'reject',
    runtimeRequirements: [futureRuntimeRequirement],
    typeParameters: [{ name: 'E', sources: [{ source: 'argument-type', argumentIndex: 0 }] }],
    cExpression: 'FixtureFuture::failed',
    cCallStyle: 'function',
    cResultMode: 'value',
    resultTypeRef: futureTypeRef(unknownTypeRef, rejectedTypeRef),
    minArgs: 1,
    maxArgs: 1,
    cArgumentKinds: ['runtime-value'],
    argumentChecks: [{ valueTypes: [], typeRef: rejectedTypeRef }]
  }
}

function futureMapOperation(): LibraryOperationDescriptor {
  const typeParameters: LibraryOperationTypeParameterDescriptor[] = [
    { name: 'T', sources: [{ source: 'receiver-type-argument', argumentIndex: 0 }] },
    { name: 'E', sources: [{ source: 'receiver-trait', traitId: 'awaitable', traitArgumentIndex: 1 }] },
    { name: 'U', sources: [{ source: 'argument-function-return', argumentIndex: 0 }] }
  ]

  return {
    libraryId: futureLibraryId,
    bindingId: `${futureTypeId}.map`,
    operationId: `${futureTypeId}.map`,
    kind: 'call',
    asyncResultOperation: 'map-fulfilled',
    runtimeRequirements: [futureRuntimeRequirement],
    receiverTypeId: futureTypeId,
    typeParameters,
    cExpression: 'transformValue',
    cArgumentKinds: ['receiver', 'runtime-callback'],
    cCallStyle: 'member',
    cResultMode: 'value',
    resultTypeRef: futureTypeRef(mappedTypeRef, rejectedTypeRef),
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [
      {
        valueTypes: ['function'],
        functionParameters: [{ name: 'value', valueType: 'unknown', typeRef: elementTypeRef }],
        functionAsync: false
      }
    ]
  }
}

function futureRecoverOperation(): LibraryOperationDescriptor {
  return {
    libraryId: futureLibraryId,
    bindingId: `${futureTypeId}.recover`,
    operationId: `${futureTypeId}.recover`,
    kind: 'call',
    asyncResultOperation: 'map-rejected',
    runtimeRequirements: [futureRuntimeRequirement],
    receiverTypeId: futureTypeId,
    typeParameters: [
      { name: 'T', sources: [{ source: 'receiver-type-argument', argumentIndex: 0 }] },
      { name: 'E', sources: [{ source: 'receiver-trait', traitId: 'awaitable', traitArgumentIndex: 1 }] }
    ],
    cExpression: 'recoverFailure',
    cArgumentKinds: ['receiver', 'runtime-callback'],
    cCallStyle: 'member',
    cResultMode: 'value',
    resultTypeRef: futureTypeRef(elementTypeRef, unknownTypeRef),
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [
      {
        valueTypes: ['function'],
        functionParameters: [{ name: 'reason', valueType: 'unknown', typeRef: rejectedTypeRef }],
        functionAsync: false
      }
    ]
  }
}

function functionTypeRef(params: TypeRef[], result: TypeRef): TypeRef {
  return {
    kind: 'function',
    params,
    result,
    nullable: false,
    ownership: 'value',
    traits: []
  }
}
