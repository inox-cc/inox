import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('imported throwing function keeps native result ABI', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/source.ts',
        source: `
export function pass(value: Bridge): Bridge {
  if (value) throw 'error'
  return value
}
`
      },
      {
        path: '/pkg/consumer.ts',
        source: `
import { pass } from './source.ts'

export function consume(value: Bridge): Bridge {
  return pass(value)
}
`
      }
    ],
    { root: '/' }
  )
  const files = compileFileToCModuleTextsSync('/pkg/consumer.ts', {
    callMain: false,
    host,
    libraries: createCompilerLibrarySet([bridgeLibrary()]),
    sourceRoot: '/pkg'
  })
  const consumer = files.find((file) => file.path === 'consumer.cc')

  assert.ok(consumer)
  assert.match(consumer.code, /FixtureBridge inox_call_result_/)
  assert.match(consumer.code, /std::addressof\(inox_call_result_/)
  assert.doesNotMatch(consumer.code, /&inox_call_result_/)
  assert.doesNotMatch(consumer.code, /inox_value inox_call_result_/)
})

test('imported throwing function keeps generic native result ABI', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/source.ts',
        source: `
export function collect(value: string): Set<string> {
  if (value) throw 'error'
  return new Set<string>()
}
`
      },
      {
        path: '/pkg/consumer.ts',
        source: `
import { collect } from './source.ts'

export function consume(value: string): Set<string> {
  return collect(value)
}
`
      }
    ],
    { root: '/' }
  )
  const files = compileFileToCModuleTextsSync('/pkg/consumer.ts', {
    callMain: false,
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  })
  const consumer = files.find((file) => file.path === 'consumer.cc')

  assert.ok(consumer)
  assert.match(consumer.code, /Set inox_call_result_/)
  assert.match(consumer.code, /std::addressof\(inox_call_result_/)
  assert.doesNotMatch(consumer.code, /&inox_call_result_/)
  assert.doesNotMatch(consumer.code, /inox_value inox_call_result_/)
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
        cppType: 'FixtureBridge',
        baseTypeIds: [],
        runtimeRequirements: ['fixture-runtime'],
        cValueAdapter: 'FixtureBridge($value)'
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
