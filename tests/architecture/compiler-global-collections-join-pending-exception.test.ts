import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

import { compilerLibraryPackage } from '../../stdlib/global/collections/compiler/index.ts'

test('Array.join сохраняет pending exception при свёрнутой цепочке вызовов', async () => {
  const operation = compilerLibraryPackage.operations.find(
    (candidate) => candidate.operationId === 'global:collections#Array.join'
  )
  const implementation = await readFile(resolve('stdlib/global/collections/src/collections.cc'), 'utf8')

  assert.ok(operation)
  assert.equal(operation.cPreservesPendingException, true)
  assert.match(
    implementation,
    /inox::String Array::join\(inox::StringView separator\) const \{\n  if \(inox::thrown\(\)\) \{\n    return inox::String\(\);/
  )
})
