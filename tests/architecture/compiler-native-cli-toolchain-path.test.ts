import assert from 'node:assert/strict'
import { test } from 'node:test'

import { renderCompilerLibraryRegistry } from '../../scripts/lib/compiler-library-registry.ts'

test('native CLI resolves a relative executable path before locating the toolchain', () => {
  const source = renderCompilerLibraryRegistry([]).nativeEntrySource

  assert.match(source, /const compilerExecutable = path\.resolve\(process\.execPath\)/)
  assert.match(source, /path\.dirname\(path\.dirname\(compilerExecutable\)\)/)
  assert.match(source, /const configuredNativePlan = process\.env\.INOX_NATIVE_PLAN/)
  assert.match(
    source,
    /nativePlanPath: configuredNativePlan\.length > 0 \? path\.resolve\(process\.cwd\(\), configuredNativePlan\) : ''/
  )
  assert.doesNotMatch(source, /compilerCommand:/)
})
