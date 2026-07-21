import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource, compileSourceToIr } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'
import { lowerProgram } from '../../compiler/lower.ts'
import type { AnyNode } from '../../compiler/types.ts'

test('native TypeRef проходит через function parameter и return boundary', () => {
  const libraries = createCompilerLibrarySet([fixtureLibrary()])
  const source = `
    function forward(values: Bucket<string>): Bucket<string> { return values }
    function consume(values: Bucket<string>): void {
      for (const value of values) {}
    }
  `
  const checked = compileSourceToIr(source, { libraries })
  const result = compileSource(source, { libraries, target: 'cc' })
  const forward = checked.hir.body[0]
  const loop = checked.hir.body[1].body[0]

  assert.equal(forward.params[0].typeRef?.typeId, 'fixture#Bucket')
  assert.equal(loop.libraryCIteratorMethod, 'cursor')
  assert.match(result.code, /FixtureBucket forward\(FixtureBucket values\)/)
  assert.match(result.code, /void consume\(FixtureBucket values\)/)
  assert.match(result.code, /\.cursor\(\)/)
})

test('lowering восстанавливает physical metadata native-параметра из nominal declaration', () => {
  const libraries = createCompilerLibrarySet([fixtureLibrary()])
  const checked = compileSourceToIr('function read(values: Bucket<string>): number { return 1 }', { libraries })
  const parameter = checked.ast.body[0].params[0]

  assert.ok(parameter.shape)
  parameter.shape.libraryCppType = null

  const lowered = lowerProgram(checked.ast, libraries)

  assert.equal(lowered.body[0].params[0].shape?.libraryCppType, 'FixtureBucket')
})

test('lowering дополняет частичную object/function metadata из declaration', () => {
  const libraries = createCompilerLibrarySet([])
  const checked = compileSourceToIr(
    `
      type Bridge = {
        invoke(value: string, suffix: string): string
        label: string
      }
      function use(input: Bridge): void {}
    `,
    { libraries }
  )
  const parameter = checked.ast.body[1].params[0]
  const invoke = parameter.shape?.fields?.find((field: AnyNode) => field.name === 'invoke')

  assert.ok(parameter.shape)
  assert.ok(invoke?.functionType?.params)
  parameter.shape.fields = [invoke]
  invoke.functionType.params = [invoke.functionType.params[0]]

  const lowered = lowerProgram(checked.ast, libraries)
  const fields: AnyNode[] = lowered.body[1].params[0].shape?.fields ?? []
  const loweredInvoke = fields.find((field: AnyNode) => field.name === 'invoke')

  assert.deepEqual(
    fields.map((field: AnyNode) => field.name),
    ['invoke', 'label']
  )
  assert.equal(loweredInvoke?.functionType?.params?.length, 2)
})

test('lowering восстанавливает dynamic object metadata из base declaration', () => {
  const libraries = createCompilerLibrarySet([])
  const checked = compileSourceToIr(
    `
      type DynamicFields = { [key: string]: string }
      type ExtendedFields = DynamicFields & { known?: string }
      function use(input: ExtendedFields): void {}
    `,
    { libraries }
  )
  const parameter = checked.ast.body[2].params[0]

  assert.ok(parameter.shape)
  parameter.shape.dynamic = false

  const lowered = lowerProgram(checked.ast, libraries)

  assert.equal(lowered.body[2].params[0].shape?.dynamic, true)
})

function fixtureLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'fixture',
    dependencies: [],
    declarations: [
      {
        libraryId: 'fixture',
        kind: 'global',
        source: 'stdlib/fixture/index.d.ts',
        declarationSource: 'export {}; declare global { interface Bucket<T> {} }',
        compilerImplemented: true
      }
    ],
    nativeTypes: [
      {
        libraryId: 'fixture',
        typeId: 'fixture#Bucket',
        declarationNames: ['Bucket'],
        valueType: 'object',
        cppType: 'FixtureBucket',
        baseTypeIds: [],
        runtimeRequirements: [],
        typeParameters: ['T'],
        traits: [{ traitId: 'iterable', args: [{ kind: 'parameter', name: 'T' }] }],
        cIteration: {
          iteratorMethod: 'cursor',
          nextMethod: 'advance',
          doneMember: 'finished',
          valueMember: 'current',
          valueAdapter: '$value.raw()'
        }
      }
    ],
    operations: [],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
