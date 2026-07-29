import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('explicit unknown keeps unknown storage without erasing initializer TypeRef', () => {
  const result = compileSource(`
    type AnyNode = { [key: string]: any }

    function inspect(item: AnyNode): void {
      const value: unknown = item.libraryRuntimeRequirements
    }
  `, { libraries: defaultCompilerLibrarySet })
  const inspect = result.ir.body.find((node) => node.type === 'FunctionDeclaration')
  const declaration = inspect?.body[0]

  assert.equal(declaration?.typeRef?.kind, 'unknown')
  assert.equal(declaration?.init.typeRef?.typeId, 'global:collections#Array')
  assert.ok(result.ir.runtimeRequirements.includes('global:collections#array'))
  assert.match(result.code, /inox::Value value = inox_value_\d+;/)
  assert.match(result.code, /inox::get\(item, "libraryRuntimeRequirements"\)/)
  assert.doesNotMatch(result.code, /(?:Array|inox::String)\(inox_value_\d+\)/)
})
