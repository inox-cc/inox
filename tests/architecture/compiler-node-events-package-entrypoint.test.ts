import assert from 'node:assert/strict'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { renderCompilerLibraryRegistry } from '../../scripts/lib/compiler-library-registry.ts'

test('node:events diagnostic package владеет compiler entrypoint без native runtime', async () => {
  const discovered = await discoverCompilerLibraries()
  const eventsPackage = discovered.find((library) => library.id === 'node:events')

  assert.ok(eventsPackage)
  assert.equal(eventsPackage.compilerEntrypoint, 'stdlib/node/events/compiler/index.ts')
  assert.ok(eventsPackage.compilerPackage)
  assert.equal(eventsPackage.compilerPackage.id, 'node:events')
  assert.deepEqual(eventsPackage.compilerPackage.dependencies, [])
  assert.equal(eventsPackage.compilerPackage.nativeTypes?.length ?? 0, 0)
  assert.deepEqual(eventsPackage.compilerPackage.intrinsicBindings, [])
  assert.deepEqual(eventsPackage.compilerPackage.runtimeRequirements, [])
  assert.deepEqual(eventsPackage.nativeSources, [])
  assert.deepEqual(eventsPackage.nativeIncludeDirs, [])

  const rendered = renderCompilerLibraryRegistry(discovered)
  const packageImport = rendered.registrySource.match(
    /compilerLibraryPackage as compilerLibraryPackage(\d+) \} from '[^']*stdlib\/node\/events\/compiler\/index\.ts'/
  )

  assert.ok(packageImport)
  assert.match(rendered.registrySource, new RegExp(`compilerLibraryPackage${packageImport[1]}\\.operations\\[0\\]`))
  assert.match(rendered.manifestSource, /stdlib\/node\/events\/compiler\/index\.ts/)
})
