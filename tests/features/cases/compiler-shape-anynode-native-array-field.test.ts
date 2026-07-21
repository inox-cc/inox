// @targets cc
// @expect pass
// @stdout 2

import type { AnyNode as CNode } from './modules/compiler-shape-anynode-import.d.ts'

function paramCount(method: CNode): number {
  const params = method.params

  return params.length
}

console.log(paramCount({ params: ['alpha', 'beta'] }))
