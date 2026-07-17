import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'

test('throwing function pointer adapter value-initializes an arbitrary library native result', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/index.ts',
        source: `
type Dependencies = { pass(value: Bridge): Bridge }

function pass(value: Bridge): Bridge {
  if (value) throw 'error'
  return value
}

function consume(dependencies: Dependencies): void {}

const dependencies: Dependencies = { pass }
consume(dependencies)
`
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
  const source = files.find((file) => file.path === 'index.cc')

  assert.ok(source)
  assert.match(source.code, /FixtureBridge inox_adapter_result = \{\};/)
  assert.match(source.code, /pass\(inox_arg_0, std::addressof\(inox_adapter_result\), &inox_adapter_error\)/)
  assert.doesNotMatch(source.code, /FixtureBridge inox_adapter_result = 0;/)
  assert.doesNotMatch(source.code, /pass\(inox_arg_0, &inox_adapter_result/)
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
        runtimeRequirements: [],
        cValueAdapter: 'FixtureBridge($value)'
      }
    ],
    operations: [],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
