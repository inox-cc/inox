import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import type { AnyNode } from '../../compiler/types.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('explicit native annotation keeps facade storage after dynamic reads', () => {
  const result = compileSource(`
    type AnyNode = { [key: string]: any }

    function inspect(nodes: AnyNode[]): boolean {
      const node = nodes[0]
      const names: Map<string, string> = node.names

      for (const child of nodes) {
        const tags: Set<string> = child.tags
        return names.has('item') && tags.has('loop')
      }

      return false
    }
  `, { libraries: defaultCompilerLibrarySet, target: 'cc' })
  const inspect = result.ir.body.find((node: AnyNode) => node.name === 'inspect')

  assert.ok(inspect)
  const names = inspect.body.find((node: AnyNode) => node.name === 'names')
  const loop = inspect.body.find((node: AnyNode) => node.type === 'ForOfStatement')
  const tags = loop?.body.body.find((node: AnyNode) => node.name === 'tags')

  assert.equal(names?.nullable, false)
  assert.equal(names?.typeRef?.typeId, 'global:collections#Map')
  assert.equal(names?.typeRef?.args[0]?.name, 'string')
  assert.equal(names?.typeRef?.args[1]?.name, 'string')
  assert.equal(tags?.nullable, false)
  assert.equal(tags?.typeRef?.typeId, 'global:collections#Set')
  assert.equal(tags?.typeRef?.args[0]?.name, 'string')
  assert.match(result.code, /auto names = Map\(inox_value_\d+\);/)
  assert.match(result.code, /auto tags = Set\(inox_value_\d+\);/)
  assert.doesNotMatch(result.code, /inox::Value (?:names|tags);/)
})
