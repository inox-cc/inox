import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('node:child_process проходит через generic operation и runtime plan', async () => {
  const libraries = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries())
  const result = compileSource(
    "import { execFileSync, spawnSync } from 'node:child_process'\nconst text = execFileSync('/bin/echo', { encoding: 'utf8' })\nconst child = spawnSync('/bin/echo', ['hi'], { encoding: 'utf8' })\nconsole.log(text, child.status, child.stdout, child.stderr)\n",
    { libraries, profile: 'embedded', target: 'cc' }
  )
  const execFileCall = result.ir.body[1].init
  const spawnCall = result.ir.body[2].init

  assert.equal(execFileCall.libraryOperationId, 'node:child_process#execFileSync')
  assert.equal(spawnCall.libraryOperationId, 'node:child_process#spawnSync')
  assert.deepEqual(spawnCall.shape.fields[0].loc, spawnCall.loc)
  assert.ok(result.ir.runtimeRequirements.includes('node:child_process'))
  assert.equal('childProcessRuntimeMethod' in execFileCall, false)
  assert.equal('childProcessRuntimeMethod' in spawnCall, false)
  assert.match(result.code, /#include "inox\/child_process\.h"/)
  assert.match(result.code, /child_process\.execFileSync\([^;]+nullptr, 0,/)
  assert.match(result.code, /child_process\.spawnSync\(/)
  assert.doesNotMatch(result.code, /inox_shape_spawn_sync/)
  assert.match(result.code, /const inox::StringView inox_library_args_\d+\[\]/)
  assert.match(result.code, /if \(inox::thrown\(\)\)/)
})
