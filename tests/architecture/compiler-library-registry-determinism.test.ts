import assert from 'node:assert/strict'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { renderCompilerLibraryRegistry } from '../../scripts/lib/compiler-library-registry.ts'

test('generated compiler library registry is independent of discovery order', async () => {
  const discovered = await discoverCompilerLibraries()
  const forward = renderCompilerLibraryRegistry(discovered)
  const reversed = renderCompilerLibraryRegistry(discovered.slice().reverse())

  assert.equal(forward.registrySource, reversed.registrySource)
  assert.equal(forward.manifestSource, reversed.manifestSource)
  assert.deepEqual(forward.nativePlan, reversed.nativePlan)
  assert.equal(forward.nativePlan.librarySetFingerprint, forward.librarySet.fingerprint)
  assert.equal(forward.nativePlanSource, reversed.nativePlanSource)
  assert.equal(forward.nativePlanCMakeSource, reversed.nativePlanCMakeSource)
  assert.equal(forward.nativeEntrySource, reversed.nativeEntrySource)
  assert.match(forward.nativeEntrySource, /const compilerHost = createNodeCompilerSyncPathHost\(\)/)
  assert.doesNotMatch(forward.nativeEntrySource, /const compilerHost = createNodeCompilerHost\(\)/)
  assert.match(forward.nativeEntrySource, /index < compilerArgs\.length/)
  assert.match(forward.nativeEntrySource, /compilerArgs\[index\] === '--help'/)
  assert.match(forward.nativeEntrySource, /compilerArgs\[index\] === '-h'/)
  assert.doesNotMatch(forward.nativeEntrySource, /compilerArgs\[index\].*\|\|/)
  assert.doesNotMatch(forward.nativeEntrySource, /index < process\.argv\.length; index = index \+ 1\) \{\n  if/)
})
