import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('generated module header includes package runtime required by native signature', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/index.ts',
        source: 'export function pass(value: Bridge): Bridge { return value }\n'
      }
    ],
    { root: '/' }
  )
  const files = compileFileToCModuleTextsSync('/pkg/index.ts', {
    callMain: false,
    host,
    libraries: createCompilerLibrarySet([bridgeLibrary()]),
    sourceRoot: '/pkg'
  })
  const header = files.find((file) => file.path === 'index.h')

  assert.ok(header)
  assert.match(header.code, /#include "fixture\/native\.h"/)
  assert.match(header.code, /FixtureNative/)
})

test('generated module header includes selected stdlib facade used only by signature', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/index.ts',
        source: 'export function collect(features: Set<string>): void {}\n'
      }
    ],
    { root: '/' }
  )
  const files = compileFileToCModuleTextsSync('/pkg/index.ts', {
    callMain: false,
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  })
  const header = files.find((file) => file.path === 'index.h')

  assert.ok(header)
  assert.match(header.code, /#include "inox\/set\.h"/)
  assert.match(header.code, /Set features/)
})

test('generated module header keeps native type of exported value', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/index.ts',
        source: 'export const values = new Set<string>()\n'
      }
    ],
    { root: '/' }
  )
  const files = compileFileToCModuleTextsSync('/pkg/index.ts', {
    callMain: false,
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  })
  const header = files.find((file) => file.path === 'index.h')

  assert.ok(header)
  assert.match(header.code, /#include "inox\/set\.h"/)
  assert.match(header.code, /extern Set inox_mod_index_ts_[a-f0-9]+_values;/)
  assert.doesNotMatch(header.code, /extern inox_value inox_mod_index_ts_[a-f0-9]+_values;/)
})

test('generated module header derives exported native value include from package descriptor', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/index.ts',
        source: 'export let value: Bridge\n'
      }
    ],
    { root: '/' }
  )
  const files = compileFileToCModuleTextsSync('/pkg/index.ts', {
    callMain: false,
    host,
    libraries: createCompilerLibrarySet([bridgeLibrary()]),
    sourceRoot: '/pkg'
  })
  const header = files.find((file) => file.path === 'index.h')

  assert.ok(header)
  assert.match(header.code, /#include "fixture\/native\.h"/)
  assert.match(header.code, /extern FixtureNative inox_mod_index_ts_[a-f0-9]+_value;/)
})

function bridgeLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'fixture',
    dependencies: [],
    declarations: [
      {
        libraryId: 'fixture',
        kind: 'global',
        source: 'stdlib/fixture/index.d.ts',
        declarationSource: 'export {}; declare global { class Bridge {} }',
        compilerImplemented: true
      }
    ],
    nativeTypes: [
      {
        libraryId: 'fixture',
        typeId: 'fixture#Bridge',
        declarationNames: ['Bridge'],
        valueType: 'object',
        cppType: 'FixtureNative',
        baseTypeIds: [],
        runtimeRequirements: ['fixture-runtime']
      }
    ],
    operations: [],
    intrinsicBindings: [],
    runtimeRequirements: [
      {
        id: 'fixture-runtime',
        dependencies: [],
        cPreludeIncludes: ['fixture/native.h'],
        capabilities: []
      }
    ]
  }
}
