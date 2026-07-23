import assert from 'node:assert/strict'
import { test } from 'node:test'

import { resolveCRuntimePreludeRequirements } from '../../compiler/backends/cpp/runtime-plan.ts'
import type {
  CompilerLibrarySet,
  RuntimeRequirementDescriptor
} from '../../compiler/extensions/types.ts'

test('runtime plan selects a package-provided entrypoint adapter', () => {
  const requirements = resolveCRuntimePreludeRequirements({
    classDescriptorCount: 0,
    cppValueRuntime: false,
    globalUsages: [],
    hasRuntimeCallbackWrapper: false,
    irPrograms: [],
    libraries: librarySet([
      runtimeRequirement('host', {
        cFunction: 'inox::host_main',
        acceptsEntryPath: true
      })
    ]),
    runtimeRequirements: new Set(['host']),
    throwingFunctionCount: 0
  })

  assert.deepEqual(requirements.runtimeEntrypointAdapter, {
    cFunction: 'inox::host_main',
    acceptsEntryPath: true
  })
})

test('runtime plan rejects multiple different entrypoint adapters', () => {
  assert.throws(
    () => resolveCRuntimePreludeRequirements({
      classDescriptorCount: 0,
      cppValueRuntime: false,
      globalUsages: [],
      hasRuntimeCallbackWrapper: false,
      irPrograms: [],
      libraries: librarySet([
        runtimeRequirement('first', {
          cFunction: 'inox::first_main',
          acceptsEntryPath: false
        }),
        runtimeRequirement('second', {
          cFunction: 'inox::second_main',
          acceptsEntryPath: false
        })
      ]),
      runtimeRequirements: new Set(['first', 'second']),
      throwingFunctionCount: 0
    }),
    /multiple entrypoint adapters/
  )
})

function runtimeRequirement(
  id: string,
  cEntrypointAdapter: NonNullable<RuntimeRequirementDescriptor['cEntrypointAdapter']>
): RuntimeRequirementDescriptor {
  return {
    id,
    dependencies: [],
    cPreludeIncludes: [],
    capabilities: [],
    cEntrypointAdapter
  }
}

function librarySet(runtimeRequirements: RuntimeRequirementDescriptor[]): CompilerLibrarySet {
  return {
    fingerprint: 'entrypoint-adapter-test',
    declarations: [],
    nativeTypes: [],
    operations: [],
    intrinsicBindings: [],
    runtimeRequirements
  }
}
