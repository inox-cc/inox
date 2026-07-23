import assert from 'node:assert/strict'
import test from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('fs result predicates emit direct non-throwing C++ calls', () => {
  const result = compileSource(
    `
import type { Dirent, Stats } from 'node:fs'

function report(stats: Stats, entry: Dirent): void {
  console.log(stats.isFile(), stats.isDirectory(), entry.isFile(), entry.isDirectory())
}
`,
    {
      libraries: defaultCompilerLibrarySet,
      target: 'cc'
    }
  )

  assert.match(
    result.code,
    /console\.log\(\s*"%d %d %d %d",\s*stats\.isFile\(\),\s*stats\.isDirectory\(\),\s*entry\.isFile\(\),\s*entry\.isDirectory\(\)\s*\);/
  )
  assert.doesNotMatch(result.code, /inox_library_result_/)
  assert.doesNotMatch(result.code, /if \(inox::thrown\(\)\) return;/)
})
