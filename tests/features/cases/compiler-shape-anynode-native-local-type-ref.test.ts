// @targets cc
// @expect pass
// @stdout value 1

import type { AnyNode } from '../../../compiler/types.ts'

type Context = {
  names: Map<string, string>
  tags: Set<string>
}

function indexedName(contexts: Context[]): string {
  const nodes: AnyNode[] = contexts

  if (nodes.length === 0) {
    return 'missing'
  }

  const node = nodes[0]
  const names: Map<string, string> = node.names

  return names.get('item') ?? 'missing'
}

function loopHasTag(contexts: Context[]): boolean {
  const nodes: AnyNode[] = contexts

  for (const node of nodes) {
    const tags: Set<string> = node.tags

    return tags.has('loop')
  }

  return false
}

const names: Map<string, string> = new Map()
const tags: Set<string> = new Set()

names.set('item', 'value')
tags.add('loop')

const contexts: Context[] = [{ names, tags }]

console.log(indexedName(contexts), loopHasTag(contexts))
