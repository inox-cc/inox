import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type {
  CompilerLibraryDescriptor,
  LibraryOperationDescriptor,
  NominalTypeRef,
  PrimitiveTypeRef,
  TypeRef
} from '../../compiler/extensions/types.ts'

const libraryId = 'fixture:sequence'
const sequenceTypeId = `${libraryId}#Sequence`
const parameterTypeRef: TypeRef = { kind: 'parameter', name: 'T' }
const numberTypeRef: PrimitiveTypeRef = {
  kind: 'primitive',
  name: 'number',
  nullable: false,
  ownership: 'value',
  traits: []
}

test('переименованный sequence provider использует общий member lowering', () => {
  const result = compileSource(
    [
      'function update(values: FixtureSequence<number>): number {',
      '  const previous = values.count',
      '  const first = values[0]',
      '  values[0] = first + 1',
      '  let total = 0',
      '  for (const value of values) total = total + value',
      '  return values.append(1) + previous + total',
      '}',
      'function seeded(values: FixtureSequence<number> = []): number {',
      '  return values.count',
      '}',
      'function nested(rows: FixtureSequence<FixtureSequence<number>>): number {',
      '  let total = 0',
      '  for (const [first] of rows) total = total + first',
      '  return total',
      '}',
      'function choose(flag: boolean, left: FixtureSequence<number>, right: FixtureSequence<number>): FixtureSequence<number> {',
      '  return flag ? left : right',
      '}',
      'function fallback(values: FixtureSequence<number> | null): FixtureSequence<number> {',
      '  return values ?? []',
      '}',
      'type FixtureNode = { [key: string]: unknown }',
      'function dynamicFirst(node: FixtureNode): number {',
      '  return node.values[0] as number',
      '}',
      'update([1])',
      'seeded()',
      'nested([[1]])',
      'choose(true, [1], [2]).count',
      'fallback(null).count',
      'dynamicFirst({ values: [1] })'
    ].join('\n'),
    { libraries: createCompilerLibrarySet([fixtureLibrary()]), target: 'cc' }
  )
  const update = result.ir.body.find((statement) => statement.name === 'update')
  const updateCall = result.ir.body.find(
    (statement) => statement.type === 'ExpressionStatement' && statement.expression?.callee?.path?.[0] === 'update'
  )
  const dynamicFirst = result.ir.body.find((statement) => statement.name === 'dynamicFirst')

  assert.ok(update)
  assert.ok(updateCall)
  assert.ok(dynamicFirst)
  const body = update.body
  const literal = updateCall.expression.args[0]

  assert.equal(body[0].init.libraryOperationId, `${sequenceTypeId}.count`)
  assert.equal(body[1].init.libraryOperationId, `${sequenceTypeId}#index-read`)
  assert.equal(body[2].expression.libraryOperationId, `${sequenceTypeId}#index-write`)
  assert.equal(body[5].argument.left.left.libraryOperationId, `${sequenceTypeId}.append`)
  assert.equal(dynamicFirst.body[0].argument.libraryOperationId, `${sequenceTypeId}#index-read`)
  assert.equal(literal.type, 'ArrayLiteral')
  assert.equal(literal.valueType, 'object')
  assert.equal(literal.typeRef.typeId, sequenceTypeId)
  assert.equal((result.ir.features as string[]).includes('collections'), false)
  assert.equal(result.ir.runtimeRequirements.includes('collections'), false)
  assert.equal(result.ir.runtimeRequirements.some((requirement) => requirement.startsWith('global:collections#')), false)
  assert.match(result.code, /\.measure\(\)/)
  assert.match(result.code, /\.readNative\(0\)/)
  assert.match(result.code, /\.writeNative\(0, /)
  assert.match(result.code, /\.appendNative\(inox::Value\(inox_number_value\(1\)\)\)/)
  assert.match(result.code, /\.walk\(\)/)
  assert.match(result.code, /\.advance\(\)/)
  assert.match(result.code, /\.finished/)
  assert.match(result.code, /\.item/)
  assert.match(result.code, /FixtureSequence::empty\(\)/)
  assert.match(result.code, /\.rawNative\(\)/)
  assert.doesNotMatch(result.code, /FixtureSequence::create|\.(?:get|set|length|push)\(/)
})

function fixtureLibrary(): CompilerLibraryDescriptor {
  return {
    id: libraryId,
    dependencies: [],
    declarations: [
      {
        libraryId,
        kind: 'global',
        source: 'stdlib/fixture/sequence/index.d.ts',
        declarationSource:
          'export {}; declare global { class FixtureSequence<T> { readonly count: number; append(value: T): number; } }',
        compilerImplemented: true
      }
    ],
    nativeTypes: [
      {
        libraryId,
        typeId: sequenceTypeId,
        declarationNames: ['FixtureSequence'],
        valueType: 'object',
        cppType: 'FixtureSequence',
        cValueAdapter: 'FixtureSequence($value)',
        baseTypeIds: [],
        runtimeRequirements: [],
        cRuntimeValueExpression: '$value.rawNative()',
        typeParameters: ['T'],
        traits: [
          { traitId: 'indexable', args: [numberTypeRef, parameterTypeRef] },
          { traitId: 'iterable', args: [parameterTypeRef] }
        ],
        cIteration: {
          iteratorMethod: 'walk',
          nextMethod: 'advance',
          doneMember: 'finished',
          valueMember: 'item',
          valueAdapter: '$value',
          failureMode: 'thrown'
        }
      }
    ],
    operations: [intrinsicOperation(), countOperation(), appendOperation(), indexOperation('index-read'), indexOperation('index-write')],
    intrinsicBindings: [{ role: 'array-literal', bindingId: `${sequenceTypeId}.intrinsic` }],
    runtimeRequirements: []
  }
}

function sequenceTypeRef(): NominalTypeRef {
  return {
    kind: 'nominal',
    typeId: sequenceTypeId,
    args: [parameterTypeRef],
    nullable: false,
    ownership: 'value',
    traits: [
      { traitId: 'indexable', args: [numberTypeRef, parameterTypeRef] },
      { traitId: 'iterable', args: [parameterTypeRef] }
    ]
  }
}

function intrinsicOperation(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: `${sequenceTypeId}.intrinsic`,
    operationId: `${sequenceTypeId}.intrinsic`,
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

function countOperation(): LibraryOperationDescriptor {
  return {
    libraryId,
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

function appendOperation(): LibraryOperationDescriptor {
  return {
    libraryId,
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
    argumentChecks: [{ valueTypes: [], typeRef: parameterTypeRef }]
  }
}

function indexOperation(kind: 'index-read' | 'index-write'): LibraryOperationDescriptor {
  const write = kind === 'index-write'

  return {
    libraryId,
    bindingId: `${sequenceTypeId}.*`,
    operationId: `${sequenceTypeId}#${kind}`,
    kind,
    acceptsUnknownReceiver: true,
    receiverTypeId: sequenceTypeId,
    runtimeRequirements: [],
    typeParameters: [{ name: 'T', sources: [{ source: 'receiver-type-argument', argumentIndex: 0 }] }],
    cExpression: write ? 'writeNative' : 'readNative',
    cArgumentKinds: write ? ['receiver', 'number', 'number'] : ['receiver', 'number'],
    cCallStyle: 'member',
    resultTypeRef: numberTypeRef,
    minArgs: write ? 2 : 1,
    maxArgs: write ? 2 : 1,
    argumentChecks: write
      ? [{ valueTypes: ['number'] }, { valueTypes: [], typeRef: parameterTypeRef }]
      : [{ valueTypes: ['number'] }]
  }
}
