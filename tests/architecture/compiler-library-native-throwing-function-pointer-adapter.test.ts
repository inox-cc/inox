import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'

test('throwing native callback wrapper preserves the pending exception as callback status', () => {
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
  const files = compileFileToCppModuleTextsSync('/pkg/index.ts', {
    callMain: false,
    host,
    libraries: createCompilerLibrarySet([bridgeLibrary()]),
    sourceRoot: '/pkg'
  })
  const source = files.find((file) => file.path === 'index.cc')

  assert.ok(source)
  assert.match(source.code, /FixtureBridge inox_callback_result = pass\(FixtureBridge\(args\[0\]\)\);/)
  assert.match(source.code, /if \(inox::thrown\(\)\) return INOX_ERR_THROW;/)
  assert.match(source.code, /\*inox_callback_out = inox_callback_result\.release\(\);/)
  assert.doesNotMatch(source.code, /inox_adapter_result/)
  assert.doesNotMatch(source.code, /\binox_adapter_error\b/)
  assert.doesNotMatch(source.code, /\binox_adapter_status\b/)
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
