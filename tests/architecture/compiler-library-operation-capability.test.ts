import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('операция package объявляет namespaced embedded capability', async () => {
  const libraries = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries())
  const source = "import { platform } from 'node:os'\nplatform()\n"

  assert.throws(
    () => compileSource(source, { libraries, profile: 'embedded' }),
    (error: unknown) => error instanceof CompileError && error.diagnostics[0].code === 'INOX_CAPABILITY'
  )

  assert.doesNotThrow(() =>
    compileSource(source, {
      libraries,
      profile: 'embedded',
      capabilities: {
        'node:os': true
      }
    })
  )
})
