import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('URLSearchParams value filters lower through package-owned optional arguments', async () => {
  const libraries = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries())
  const result = compileSource(
    "import { URLSearchParams } from 'node:url'\nconst params = new URLSearchParams('q=1')\nparams.delete('q', '1')\nconsole.log(params.has('q', '1'))\n",
    { libraries, profile: 'embedded', target: 'cc' }
  )

  assert.equal(result.ir.body[2].expression.libraryOperationId, 'node:url#URLSearchParams#delete')
  assert.match(result.code, /\.remove\("q", "1", true\)/)
  assert.match(result.code, /\.has\("q", "1", true\)/)
})
