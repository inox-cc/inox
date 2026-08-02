import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('native coroutine expressions валидируются и входят в fingerprint library set', () => {
  const baseline = createCompilerLibrarySet([fixtureLibrary('$value.valid()', 'co_await $value')]).fingerprint

  assert.notEqual(createCompilerLibrarySet([fixtureLibrary('$value.ready()', 'co_await $value')]).fingerprint, baseline)
  assert.notEqual(
    createCompilerLibrarySet([fixtureLibrary('$value.valid()', 'co_await FixtureFuture::wait($value)')]).fingerprint,
    baseline
  )
  assert.throws(
    () => createCompilerLibrarySet([fixtureLibrary('true', 'co_await $value')]),
    /native type fixture#Future C\+\+ validity expression requires \$value/
  )
  assert.throws(
    () => createCompilerLibrarySet([fixtureLibrary('$valueSuffix.valid()', 'co_await $value')]),
    /native type fixture#Future C\+\+ validity expression requires \$value/
  )
  assert.throws(
    () => createCompilerLibrarySet([fixtureLibrary('$value.valid()', 'FixtureFuture::wait()')]),
    /native type fixture#Future C\+\+ coroutine await expression requires \$value/
  )
})

function fixtureLibrary(cValidExpression: string, cCoroutineAwaitExpression: string): CompilerLibraryDescriptor {
  return {
    id: 'fixture',
    dependencies: [],
    declarations: [],
    nativeTypes: [
      {
        libraryId: 'fixture',
        typeId: 'fixture#Future',
        declarationNames: ['Future'],
        valueType: 'async-result',
        cppType: 'FixtureFuture',
        baseTypeIds: [],
        runtimeRequirements: [],
        cValidExpression,
        cCoroutineAwaitExpression
      }
    ],
    operations: [],
    intrinsicBindings: [],
    runtimeRequirements: []
  } as unknown as CompilerLibraryDescriptor
}
