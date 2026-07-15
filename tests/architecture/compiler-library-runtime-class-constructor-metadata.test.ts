import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('runtime class constructor substitution preserves package operation metadata', () => {
  const result = compileSource(
    `
class Holder {
  bridge: Bridge
  opaque: unknown

  constructor() {
    this.opaque = {}
    this.bridge = new Bridge()
  }
}

const holder = new Holder()
`,
    { libraries: createCompilerLibrarySet([bridgeLibrary()]), target: 'cc' }
  )

  assert.match(result.code, /FixtureBridge\(\)/)
})

test('runtime native value crosses function boundaries through package adapter', () => {
  const libraries = createCompilerLibrarySet([bridgeLibrary()])
  const result = compileSource(
    `
class Holder {
  bridge: Bridge
  opaque: unknown

  constructor() {
    this.opaque = {}
    this.bridge = new Bridge()
  }
}

function consume(value: Bridge): Bridge { return value }
function read(holder: Holder): Bridge { return holder.bridge }

const holder = new Holder()
consume(holder.bridge)
read(holder)
`,
    { libraries, target: 'cc' }
  )

  assert.match(result.code, /FixtureBridge consume\(FixtureBridge value\)/)
  assert.match(result.code, /consume\(FixtureBridge\(inox_value_/)
  assert.match(result.code, /inox_return = FixtureBridge\(inox_value_/)

  const withoutAdapter = bridgeLibrary()

  if (!withoutAdapter.nativeTypes) {
    throw new Error('fixture native type is missing')
  }

  withoutAdapter.nativeTypes[0].cValueAdapter = null
  assert.notEqual(createCompilerLibrarySet([withoutAdapter]).fingerprint, libraries.fingerprint)
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
        declarationSource: 'export {}; declare global { class Bridge { constructor(); } }',
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
    operations: [
      {
        libraryId: 'fixture',
        bindingId: 'global:Bridge',
        operationId: 'fixture#Bridge.construct',
        kind: 'construct',
        runtimeRequirements: [],
        cExpression: 'FixtureBridge',
        cArgumentKinds: [],
        cCallStyle: 'function',
        resultTypeId: 'fixture#Bridge',
        cppType: 'FixtureBridge',
        valueType: 'object',
        minArgs: 0,
        maxArgs: 0,
        argumentChecks: []
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
