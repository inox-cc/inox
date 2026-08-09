import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { LibraryOperationDescriptor } from '../../compiler/extensions/types.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

test('node:fs описывает callback API как event-loop package operations', async () => {
  const discovered = await discoverCompilerLibraries()
  const fs = discovered.find((library) => library.id === 'node:fs')?.compilerPackage

  assert.ok(fs)

  const callbackNames = [
    'access',
    'appendFile',
    'copyFile',
    'lstat',
    'mkdir',
    'readFile',
    'readdir',
    'readlink',
    'realpath',
    'rename',
    'rm',
    'stat',
    'symlink',
    'unlink',
    'writeFile'
  ]

  for (const name of callbackNames) {
    const operation: LibraryOperationDescriptor | undefined = fs.operations.find(
      (item) => item.operationId === `node:fs#${name}`
    )

    assert.ok(operation, `missing callback operation fs.${name}`)
    assert.equal(operation.cExpression, `fs.${name}`)
    assert.equal(operation.callbackLifetime, 'event-loop')
    assert.equal(operation.diagnosticCode, undefined)
  }
})
