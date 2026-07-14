import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('Date constructor variants выбирают package-owned C++ lowering', () => {
  const result = compileSource(`
    const current = new Date()
    const epoch = new Date(0)
    const parsed = new Date('2026-06-24T12:34:56.789Z')
    const copy = new Date(epoch)
    const local = new Date(2026, 5, 24, 12, 34, 56, 789)
  `, {
    capabilities: { wallClock: true },
    libraries: defaultCompilerLibrarySet,
    profile: 'embedded'
  })
  const expectedKinds = [[], ['number'], ['string-view'], ['value'], [
    'number',
    'number',
    'optional-number',
    'optional-number',
    'optional-number',
    'optional-number',
    'optional-number'
  ]]
  const expectedRequirements = [
    ['global:time#wall'],
    ['global:time'],
    ['global:time#string'],
    ['global:time'],
    ['global:time']
  ]
  const expectedCapabilities = [['wallClock'], [], [], [], []]

  for (let index = 0; index < result.ir.body.length; index = index + 1) {
    const expression = result.ir.body[index].init

    assert.equal(expression.libraryOperationId, 'global:time#Date.construct')
    assert.deepEqual(expression.libraryCArgumentKinds, expectedKinds[index])
    assert.deepEqual(expression.libraryRuntimeRequirements, expectedRequirements[index])
    assert.deepEqual(expression.libraryCapabilities, expectedCapabilities[index])
    assert.equal(expression.shape?.libraryTypeId, 'global:time#Date')
  }
})
