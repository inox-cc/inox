import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('node:url проходит через generic nominal object operation plan', async () => {
  const libraries = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries())
  const result = compileSource(
    "import { URL, URLSearchParams, pathToFileURL } from 'node:url'\nconst page = new URL('https://example.com/a')\npage.pathname = '/b'\nconst params = new URLSearchParams('q=1')\nparams.set('q', '2')\nconsole.log(pathToFileURL('/tmp/a').href, params.get('q') ?? '')\n",
    { libraries, profile: 'embedded', target: 'cc' }
  )
  const pageConstructor = result.ir.body[1].init
  const pathnameWrite = result.ir.body[2].expression
  const paramsConstructor = result.ir.body[3].init
  const paramsSet = result.ir.body[4].expression

  assert.equal(pageConstructor.libraryOperationId, 'node:url#URL')
  assert.deepEqual(pageConstructor.shape.fields[0].loc, pageConstructor.loc)
  assert.equal(pathnameWrite.libraryOperationId, 'node:url#URL#write:pathname')
  assert.equal(paramsConstructor.libraryOperationId, 'node:url#URLSearchParams')
  assert.equal(paramsSet.libraryOperationId, 'node:url#URLSearchParams#set')
  assert.ok(result.ir.runtimeRequirements.includes('node:url'))
  assert.equal('urlRuntimeMethod' in pageConstructor, false)
  assert.equal('urlRuntimeField' in pathnameWrite, false)
  assert.match(result.code, /#include "inox\/url\.h"/)
  assert.match(result.code, /\.setPathname\(/)
  assert.match(result.code, /\.set\("q", "2"\)/)
  assert.match(result.code, /if \(inox::thrown\(\)\)/)
})
