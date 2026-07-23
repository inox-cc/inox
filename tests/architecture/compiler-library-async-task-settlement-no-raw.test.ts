import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const rawTaskResultSettlementPattern = /inox_promise_(?:resolve|reject)\(frame->promise/g

test('async task result settlement не вызывает raw runtime из portable compiler', () => {
  const source = foldAdjacentStringFragments(readFileSync('compiler/backends/cpp/async/tasks.ts', 'utf8'))
  const violations = [...source.matchAll(rawTaskResultSettlementPattern)].map(
    (match) => `${lineNumber(source, match.index)}: ${match[0]}`
  )

  assert.deepEqual(violations, [])
})

function foldAdjacentStringFragments(source: string): string {
  let result = source
  const boundary = /['"`]\s*\+\s*['"`]/g

  while (boundary.test(result)) {
    result = result.replace(boundary, '')
  }

  return result
}

function lineNumber(source: string, index: number): number {
  return source.slice(0, index).split('\n').length
}
