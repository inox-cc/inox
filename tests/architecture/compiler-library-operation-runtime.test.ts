import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('операция package добавляет generic IR requirement и C++ include', async () => {
  const libraries = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries())
  const result = compileSource("import { platform } from 'node:os'\nconst value = platform()\n", {
    libraries,
    target: 'cc'
  })
  const declaration = result.ir.body[1]
  const expression = declaration.init

  assert.equal(expression.libraryOperationId, 'node:os#platform')
  assert.deepEqual(expression.libraryRuntimeRequirements, ['node:os'])
  assert.deepEqual(result.ir.runtimeRequirements, ['node:os'])
  assert.match(result.code, /#include "inox\/os\.h"/)
  assert.match(result.code, /os\.platform\(\)/)
  assert.equal('osRuntimeMethod' in expression, false)
})
