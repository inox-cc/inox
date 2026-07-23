import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  cCompilerLibrarySetValue,
  cOptionalCompilerLibrarySetValue,
  type CCompilerLibrarySet
} from '../../compiler/backends/cpp/types.ts'
import type { CompilerLibrarySet } from '../../compiler/extensions/types.ts'

test('C++ backend stores recursive library descriptors behind an opaque boundary', () => {
  const libraries: CompilerLibrarySet = {
    fingerprint: 'test',
    declarations: [],
    nativeTypes: [],
    operations: [],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
  const stored: CCompilerLibrarySet = libraries

  assert.equal(cCompilerLibrarySetValue(stored), libraries)
  assert.equal(cOptionalCompilerLibrarySetValue(stored), libraries)
  assert.equal(cOptionalCompilerLibrarySetValue(null), null)

  const contextSource = readFileSync(new URL('../../compiler/backends/cpp/context.ts', import.meta.url), 'utf8')
  const moduleEmissionSource = readFileSync(
    new URL('../../compiler/backends/cpp/module-emission.ts', import.meta.url),
    'utf8'
  )

  assert.match(contextSource, /libraries: CCompilerLibrarySet/)
  assert.doesNotMatch(moduleEmissionSource, /\bCompilerLibrarySet\b/)
})
