import assert from 'node:assert/strict'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'
import {
  compilerLibraryDeletionApiProbe,
  runCompilerLibraryDeletionApiProbe
} from './helpers/compiler-library-deletion-api-probe.ts'

test('каждый stdlib package предоставляет focused API probe, активный в полном profile', async () => {
  const libraries = await discoverCompilerLibraries()
  const librarySet = createCompilerLibrarySetFromDiscovered(libraries)

  for (const library of libraries) {
    const probe = await compilerLibraryDeletionApiProbe(library)
    const result = runCompilerLibraryDeletionApiProbe(probe.source, librarySet)

    assert.deepEqual(result.diagnosticCodes, probe.presentDiagnosticCodes, library.id)
  }
})
