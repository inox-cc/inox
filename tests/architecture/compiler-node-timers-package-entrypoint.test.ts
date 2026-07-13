import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { LibraryNativeTypeDescriptor } from '../../compiler/extensions/types.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

const nativeTypes = [
  ['node:timers#ImmediateHandle', 'ImmediateHandle'],
  ['node:timers#IntervalHandle', 'IntervalHandle'],
  ['node:timers#TimeoutHandle', 'TimeoutHandle']
] as const

test('entrypoint package node:timers владеет native handles и runtime plan', async () => {
  const discovered = await discoverCompilerLibraries()
  const timersPackage = discovered.find((library) => library.id === 'node:timers')

  assert.ok(timersPackage)
  assert.equal(timersPackage.compilerEntrypoint, 'stdlib/node/timers/compiler/index.ts')
  assert.ok(timersPackage.compilerPackage)
  assert.equal(timersPackage.compilerPackage.id, 'node:timers')
  assert.deepEqual(timersPackage.compilerPackage.dependencies, [])
  assert.deepEqual(timersPackage.nativeSources, ['stdlib/node/timers/src/timers.cc'])
  assert.deepEqual(timersPackage.nativeIncludeDirs, ['stdlib/node/timers/include'])

  const actualNativeTypes = (timersPackage.compilerPackage.nativeTypes ?? [])
    .map((nativeType) => [nativeType.typeId, nativeType.cppType] as const)
    .sort((left, right) => left[0].localeCompare(right[0]))

  assert.deepEqual(actualNativeTypes, nativeTypes)

  for (const [typeId, cppType] of nativeTypes) {
    const nativeType: LibraryNativeTypeDescriptor | undefined = timersPackage.compilerPackage.nativeTypes?.find(
      (item) => item.typeId === typeId
    )

    assert.equal(nativeType?.libraryId, 'node:timers')
    assert.equal(nativeType?.cppType, cppType)
    assert.equal(nativeType?.valueType, 'object')
    assert.deepEqual(nativeType?.baseTypeIds, [])
    assert.deepEqual(nativeType?.runtimeRequirements, ['node:timers'])
  }

  const runtime = timersPackage.compilerPackage.runtimeRequirements.find(
    (requirement) => requirement.id === 'node:timers'
  )

  assert.ok(runtime)
  assert.deepEqual(runtime.dependencies, [
    'async-runtime',
    'callback-values',
    'managed-values',
    'objects'
  ])
  assert.deepEqual(runtime.cPreludeIncludes, ['inox/timers.h'])
  assert.deepEqual(runtime.capabilities, ['timers'])
  assert.deepEqual(runtime.backendConstraints ?? [], [])
})
