import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('node:path проходит через generic operation и structured C call plan', async () => {
  const libraries = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries())
  const result = compileSource(
    "import { join, parse, sep } from 'node:path'\nconsole.log(join('/tmp', 'a'))\nconst parsed = parse('/tmp/a')\nconsole.log(parsed.base + sep)\n",
    { libraries, profile: 'embedded', target: 'cc' }
  )
  const joinExpression = result.ir.body[1].expression.args[0]
  const parseExpression = result.ir.body[2].init

  assert.equal(joinExpression.libraryOperationId, 'node:path#join')
  assert.equal(parseExpression.libraryOperationId, 'node:path#parse')
  assert.ok(result.ir.runtimeRequirements.includes('node:path'))
  assert.equal('pathRuntimeMethod' in joinExpression, false)
  assert.equal('pathRuntimeConstant' in result.ir.body[3], false)
  assert.match(result.code, /#include "inox\/path\.h"/)
  assert.match(result.code, /inox_library_args_\d+/)
  assert.match(result.code, /inox_shape_library_result_\d+/)
})
