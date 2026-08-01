import assert from 'node:assert/strict'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { renderCompilerLibraryRegistry } from '../../scripts/lib/compiler-library-registry.ts'

test('entrypoint package node:os добавляет generated operations и runtime data', async () => {
  const discovered = await discoverCompilerLibraries()
  const osPackage = discovered.find((library) => library.id === 'node:os')

  assert.ok(osPackage)
  assert.equal(osPackage.compilerEntrypoint, 'stdlib/node/os/compiler/index.ts')
  assert.ok(osPackage.compilerPackage)
  const platform = osPackage.compilerPackage.operations.find(
    (operation) => operation.operationId === 'node:os#platform'
  )

  assert.ok(platform)
  assert.equal(platform.cExpression, 'os.platform')
  assert.deepEqual(platform.cArgumentKinds, [])
  assert.equal(platform.cFailureMode, 'thrown')
  assert.equal(platform.cPreservesPendingException, true)
  assert.deepEqual(osPackage.compilerPackage.runtimeRequirements[0].cPreludeIncludes, ['inox/os.h'])

  const rendered = renderCompilerLibraryRegistry(discovered)
  const packageImport = rendered.registrySource.match(
    /compilerLibraryPackage as compilerLibraryPackage(\d+) \} from '[^']*stdlib\/node\/os\/compiler\/index\.ts'/
  )

  assert.ok(packageImport)
  assert.match(rendered.registrySource, new RegExp(`\\.\\.\\.compilerLibraryPackage${packageImport[1]}`))
  assert.match(rendered.registrySource, new RegExp(JSON.stringify(rendered.librarySet.fingerprint)))
  assert.equal(rendered.manifestSource.includes('stdlib/node/os/compiler/index.ts'), true)
})
