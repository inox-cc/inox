import assert from 'node:assert/strict'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { renderCompilerLibraryRegistry } from '../../scripts/lib/compiler-library-registry.ts'

test('native plan связывает каждый stdlib source с runtime requirements его package', async () => {
  const rendered = renderCompilerLibraryRegistry(await discoverCompilerLibraries())
  const consoleUnit = rendered.nativePlan.units.find((unit) => unit.libraryId === 'global:console')
  const collectionsUnit = rendered.nativePlan.units.find((unit) => unit.libraryId === 'global:collections')

  assert.deepEqual(consoleUnit, {
    libraryId: 'global:console',
    runtimeRequirements: ['global:console'],
    sources: ['stdlib/global/console/src/console.cc'],
    cmakePackages: [],
    cmakeLinkLibraries: [],
    linkerArguments: []
  })
  assert.deepEqual(collectionsUnit?.sources, ['stdlib/global/collections/src/collections.cc'])
  assert.deepEqual(collectionsUnit?.runtimeRequirements, [
    'global:collections#array',
    'global:collections#array-callback',
    'global:collections#map',
    'global:collections#set'
  ])
  assert.match(rendered.nativePlanCMakeSource, /INOX_STDLIB_NATIVE_UNIT_COUNT/)
  assert.match(rendered.nativePlanCMakeSource, /INOX_STDLIB_NATIVE_UNIT_\d+_RUNTIME_REQUIREMENTS/)
  assert.match(rendered.nativePlanCMakeSource, /INOX_STDLIB_NATIVE_UNIT_\d+_CMAKE_PACKAGES/)
  assert.match(rendered.nativePlanCMakeSource, /INOX_STDLIB_NATIVE_UNIT_\d+_CMAKE_LINK_LIBRARIES/)
  assert.match(rendered.nativePlanCMakeSource, /INOX_STDLIB_NATIVE_UNIT_\d+_LINKER_ARGUMENTS/)
})
