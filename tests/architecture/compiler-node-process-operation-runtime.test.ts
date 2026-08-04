import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('node:process проходит через generic global, receiver и result operation plan', async () => {
  const libraries = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries())
  const result = compileSource(
    "import proc, { cwd, hrtime, memoryUsage, nextTick, uptime } from 'node:process'\nconst first = proc.argv[0]\nconst path = process.env.PATH\nconst start = hrtime()\nconst delta = proc.hrtime(start)\nconst usage = memoryUsage()\nprocess.exitCode = 0\nnextTick(() => console.log('tick'))\nconsole.log(first, path, cwd(), delta[0], usage.rss, proc.versions.inox, uptime())\n",
    { libraries, profile: 'embedded', target: 'cc' }
  )
  const first = result.ir.body[1].init
  const path = result.ir.body[2].init
  const start = result.ir.body[3].init
  const delta = result.ir.body[4].init
  const usage = result.ir.body[5].init
  const exitCodeWrite = result.ir.body[6].expression
  const nextTick = result.ir.body[7].expression

  assert.equal(first.libraryOperationId, 'node:process#ProcessArgv#index-read')
  assert.equal(path.libraryOperationId, 'node:process#ProcessEnv#member-read')
  assert.equal(start.libraryOperationId, 'node:process#hrtime')
  assert.equal(start.typeRef.args[0].name, 'number')
  assert.equal(delta.libraryOperationId, 'node:process#hrtime')
  assert.equal(usage.libraryOperationId, 'node:process#memoryUsage')
  assert.equal(usage.shape.libraryTypeId, 'node:process#ProcessMemoryUsage')
  assert.deepEqual(usage.shape.fields[0].loc, usage.loc)
  assert.equal(exitCodeWrite.libraryOperationId, 'node:process#write:exitCode')
  assert.equal(nextTick.libraryOperationId, 'node:process#nextTick')
  assert.ok(result.ir.runtimeRequirements.includes('node:process'))
  assert.equal('processRuntimeMethod' in delta, false)
  assert.equal('processRuntimeProperty' in exitCodeWrite, false)
  assert.match(result.code, /#include "inox\/process\.h"/)
  assert.match(result.code, /process\.argv\[/)
  assert.match(result.code, /process\.env\[/)
  assert.match(result.code, /process\.hrtime\(/)
  assert.match(result.code, /process\.exitCode =/)
  assert.match(result.code, /return inox::process_main\(argc, argv,/)
})
