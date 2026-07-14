import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('package-native nominal type reaches a class field and its receiver call', async () => {
  const libraries = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries())
  const result = compileSource(`
    class Matcher {
      pattern: RegExp

      constructor() {
        this.pattern = /stdlib/i
      }

      matches(value: string): boolean {
        return this.pattern.test(value)
      }
    }

    const matcher = new Matcher()
    const matches = matcher.matches('INOX stdlib')
  `, { libraries, target: 'cc' })
  const field = result.hir.body[0].shape.fields[0]

  assert.equal(field.typeRef?.kind, 'nominal')
  assert.equal(field.typeRef?.typeId, 'global:regexp#RegExp')
  assert.match(result.code, /RegExp pattern/)
  assert.match(result.code, /this->pattern\.test\(/)
})
