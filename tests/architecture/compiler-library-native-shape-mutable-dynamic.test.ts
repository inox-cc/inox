import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/compiler.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('native shape заранее объявляет изменяемое поле dynamic', () => {
  const libraries = createCompilerLibrarySet([fixtureLibrary()])
  const compiled = compileSourceToIr('function use(value: NativeValue): void {}', { libraries })
  const checkedShape = compiled.ast.body[0].params[0].shape
  const loweredShape = compiled.hir.body[0].params[0].shape

  assert.ok(checkedShape)
  assert.ok(loweredShape)
  assert.ok(Object.hasOwn(checkedShape, 'dynamic'))
  assert.ok(Object.hasOwn(loweredShape, 'dynamic'))
  assert.equal(checkedShape.dynamic, false)
  assert.equal(loweredShape.dynamic, false)
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
        declarationSource: 'export {}; declare global { interface NativeValue {} }',
        compilerImplemented: true
      }
    ],
    nativeTypes: [
      {
        libraryId: 'fixture',
        typeId: 'fixture#NativeValue',
        declarationNames: ['NativeValue'],
        valueType: 'object',
        cppType: 'NativeValue',
        baseTypeIds: [],
        runtimeRequirements: []
      }
    ],
    operations: [],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
