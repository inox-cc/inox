import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('node:timers calls lower только через package facade без handle-specific core path', async () => {
  const libraries = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries())
  const result = compileSource(
    "import { setTimeout as later } from 'node:timers'\n" +
      'setInterval(() => {}, 10)\n' +
      'later(() => { setImmediate(() => {}) }, 0)\n',
    { libraries, target: 'cc' }
  )

  assert.match(result.code, /timers\.setInterval/)
  assert.match(result.code, /timers\.setTimeout/)
  assert.match(result.code, /timers\.setImmediate/)
  assert.doesNotMatch(result.code, /inox_loop_/)
  assert.doesNotMatch(result.code, /inox_timer_handle/)
})
