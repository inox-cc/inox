import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('global:console владеет declaration, operations и C++ facade lowering', async () => {
  const discovered = await discoverCompilerLibraries()
  const consolePackage = discovered.find((library) => library.id === 'global:console')

  assert.ok(consolePackage)
  assert.equal(consolePackage.compilerEntrypoint, 'stdlib/global/console/compiler/index.ts')
  assert.deepEqual(consolePackage.nativeSources, ['stdlib/global/console/src/console.cc'])
  assert.deepEqual(consolePackage.nativeIncludeDirs, ['stdlib/global/console/include'])
  assert.match(consolePackage.declarationSource ?? '', /declare global/)
  assert.deepEqual(
    consolePackage.compilerPackage?.operations.map((operation) => operation.operationId),
    ['global:console#error', 'global:console#info', 'global:console#log', 'global:console#warn']
  )

  const libraries = createCompilerLibrarySetFromDiscovered(discovered)
  const result = compileSource("console.log('ready', 7)\n", { libraries })
  const call = result.ir.body[0].expression

  assert.equal(call.libraryOperationId, 'global:console#log')
  assert.equal(call.typeRef?.kind, 'primitive')
  assert.equal(call.typeRef?.name, 'void')
  assert.deepEqual(call.libraryRuntimeRequirements, ['global:console'])
  assert.match(result.code, /#include "inox\/console\.h"/)
  assert.match(result.code, /console\.log\("ready %\.17g", \(\(double\)7\)\)/)
})
