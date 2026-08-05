import assert from 'node:assert/strict'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { renderCompilerLibraryRegistry } from '../../scripts/lib/compiler-library-registry.ts'

test('node:events владеет native EventEmitter и runtime plan', async () => {
  const discovered = await discoverCompilerLibraries()
  const eventsPackage = discovered.find((library) => library.id === 'node:events')

  assert.ok(eventsPackage)
  assert.equal(eventsPackage.compilerEntrypoint, 'stdlib/node/events/compiler/index.ts')
  assert.ok(eventsPackage.compilerPackage)
  assert.equal(eventsPackage.compilerPackage.id, 'node:events')
  assert.deepEqual(eventsPackage.compilerPackage.dependencies, [])
  assert.deepEqual(
    eventsPackage.compilerPackage.nativeTypes?.map((nativeType) => nativeType.typeId),
    ['node:events#EventEmitter']
  )
  assert.deepEqual(eventsPackage.compilerPackage.intrinsicBindings, [])
  assert.deepEqual(eventsPackage.compilerPackage.runtimeRequirements, [
    {
      id: 'node:events',
      dependencies: ['callback-values', 'managed-values', 'objects', 'string-bytes'],
      cPreludeIncludes: ['inox/events.h'],
      capabilities: []
    }
  ])
  assert.deepEqual(eventsPackage.nativeSources, ['stdlib/node/events/src/events.cc'])
  assert.deepEqual(eventsPackage.nativeIncludeDirs, ['stdlib/node/events/include'])

  const rendered = renderCompilerLibraryRegistry(discovered)
  const packageImport = rendered.registrySource.match(
    /compilerLibraryPackage as compilerLibraryPackage(\d+) \} from '[^']*stdlib\/node\/events\/compiler\/index\.ts'/
  )

  assert.ok(packageImport)
  assert.match(rendered.registrySource, new RegExp(`\\.\\.\\.compilerLibraryPackage${packageImport[1]}`))
  assert.match(rendered.manifestSource, /stdlib\/node\/events\/compiler\/index\.ts/)
})
