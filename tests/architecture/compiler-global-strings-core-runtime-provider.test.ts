import assert from 'node:assert/strict'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { renderCompilerLibraryRegistry } from '../../scripts/lib/compiler-library-registry.ts'

test('global:strings предоставляет native source для базового string-bytes requirement', async () => {
  const registry = renderCompilerLibraryRegistry(await discoverCompilerLibraries())
  const unit = registry.nativePlan.units.find((candidate) => candidate.libraryId === 'global:strings')

  assert.ok(unit)
  assert.ok(unit.runtimeRequirements.includes('string-bytes'))
})
