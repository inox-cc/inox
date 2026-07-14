import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('Date string methods добавляют string runtime только через package operation', () => {
  const result = compileSource(`
    const date = new Date(0)
    const timestamp = date.getTime()
    const text = date.toISOString()
  `, { libraries: defaultCompilerLibrarySet })
  const timestamp = result.ir.body[1].init
  const text = result.ir.body[2].init

  assert.deepEqual(timestamp.libraryRuntimeRequirements, ['global:time'])
  assert.deepEqual(text.libraryRuntimeRequirements, ['global:time#string'])
  assert.equal(text.libraryOperationId, 'global:time#Date.toISOString')
})
