import assert from 'node:assert/strict'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import {
  renderCompilerLibraryRegistry,
  renderNativePlanCMake
} from '../../scripts/lib/compiler-library-registry.ts'

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

test('native plan preserves absolute external package paths', () => {
  const source = renderNativePlanCMake({
    version: 1,
    librarySetFingerprint: 'external',
    sources: ['/work/node_modules/mongodb/src/mongodb.cc'],
    includeDirs: ['/work/node_modules/mongodb/include'],
    units: [
      {
        libraryId: 'mongodb',
        runtimeRequirements: ['mongodb'],
        sources: ['/work/node_modules/mongodb/src/mongodb.cc'],
        cmakePackages: [],
        cmakeLinkLibraries: ['mongoc::static'],
        linkerArguments: [],
        cmakeProjects: [
          {
            sourceDir: '/work/node_modules/mongodb/third_party/mongo-c-driver',
            options: [{ name: 'ENABLE_STATIC', value: 'ON' }]
          }
        ]
      }
    ]
  })

  assert.match(source, /"\/work\/node_modules\/mongodb\/src\/mongodb\.cc"/)
  assert.match(source, /"\/work\/node_modules\/mongodb\/include"/)
  assert.match(source, /SOURCE_DIR "\/work\/node_modules\/mongodb\/third_party\/mongo-c-driver"/)
  assert.doesNotMatch(source, /\$\{INOX_REPO_ROOT\}\/\/work/)
})
