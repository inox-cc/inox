import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  errorObjectShape,
  fetchAbortControllerObjectShape,
  fsConstantValues,
  fsDirentObjectShape,
  fsStatsObjectShape,
  globals,
  libuvOnlyRuntimeImports,
  numericCastNames
} from '../compiler/checker/builtins.ts'

test('exports checker builtin object shapes', () => {
  assert.equal(
    errorObjectShape.fields.some((field) => field.name === 'message'),
    true
  )
  assert.equal(fsStatsObjectShape.builtin, 'fs.Stats')
  assert.equal(fsDirentObjectShape.builtin, 'fs.Dirent')
  assert.equal(fetchAbortControllerObjectShape.fields[0]?.shape?.builtin, 'fetch.AbortSignal')
})

test('exports checker builtin maps', () => {
  assert.equal(fsConstantValues.get('R_OK'), 4)
  assert.equal(libuvOnlyRuntimeImports.get('node:http'), 'node:http')
  assert.equal(globals.get('Promise')?.constructable, true)
  assert.equal(globals.get('fetch')?.valueType, 'function')
  assert.equal(numericCastNames.has('u64'), true)
})
