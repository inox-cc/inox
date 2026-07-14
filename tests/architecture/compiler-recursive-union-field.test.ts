import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'

test('checker preserves a recursive field in a named object union', () => {
  const source =
    "type Leaf = { kind: 'leaf' }\n" +
    "type Branch = { kind: 'branch', result: Recursive }\n" +
    'type Recursive = Leaf | Branch\n' +
    "function descend(value: Recursive): void { if (value.kind === 'branch') { descend(value.result) } }\n"

  assert.doesNotThrow(() => compileSourceToIr(source))
})
