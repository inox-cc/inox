import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('native async-task bridge валидируется и входит в fingerprint library set', () => {
  const baseline = createCompilerLibrarySet([fixtureLibrary('$target.fulfill($value)')]).fingerprint

  assert.notEqual(createCompilerLibrarySet([fixtureLibrary('$target.complete($value)')]).fingerprint, baseline)
  assert.notEqual(
    createCompilerLibrarySet([fixtureLibrary('$target.fulfill($value)', '$source.ready()')]).fingerprint,
    baseline
  )
  assert.throws(
    () => createCompilerLibrarySet([fixtureLibrary('$target.fulfill($value)', 'true')]),
    /native type fixture#Future async-task valid expression requires \$source/
  )
  assert.throws(
    () => createCompilerLibrarySet([fixtureLibrary('$target.fulfill()')]),
    /native type fixture#Future async-task fulfill expression requires \$value/
  )
  assert.throws(
    () => createCompilerLibrarySet([fixtureLibrary('$target.fulfill($value, $unknown)')]),
    /native type fixture#Future async-task fulfill expression has unknown placeholder \$unknown/
  )
  assert.throws(
    () => createCompilerLibrarySet([fixtureLibrary('$target.fulfill($valueSuffix)')]),
    /native type fixture#Future async-task fulfill expression requires \$value/
  )
  assert.throws(
    () => createCompilerLibrarySet([fixtureLibrary('')]),
    /native type fixture#Future async-task fulfill expression must not be empty/
  )
})

function fixtureLibrary(
  cFulfillExpression: string,
  cValidExpression = '$source.valid()'
): CompilerLibraryDescriptor {
  return {
    id: 'fixture',
    dependencies: [],
    declarations: [],
    nativeTypes: [
      {
        libraryId: 'fixture',
        typeId: 'fixture#Future',
        declarationNames: ['Future'],
        valueType: 'promise',
        cppType: 'FixtureFuture',
        baseTypeIds: [],
        runtimeRequirements: [],
        cAsyncTaskBridge: {
          cValidExpression,
          cObserveExpression: '$source.observe($onFulfilled, $onRejected, $context, $finalizer)',
          cFulfillExpression,
          cRejectExpression: '$target.reject($value)'
        }
      }
    ],
    operations: [],
    intrinsicBindings: [],
    runtimeRequirements: []
  } as unknown as CompilerLibraryDescriptor
}
