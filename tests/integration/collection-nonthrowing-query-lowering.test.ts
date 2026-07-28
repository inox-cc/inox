import assert from 'node:assert/strict'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

export function assertCollectionQueriesDoNotEmitThrowChecks(): void {
  const result = compileSource(
    `
const values = ['a']
const map = new Map<string, string>()
const set = new Set<string>()

console.log(values.includes('a'), map.has('a'), map.size, set.has('a'), set.size)
`,
    {
      libraries: defaultCompilerLibrarySet,
      target: 'cc'
    }
  )

  assert.match(
    result.code,
    /console\.log\(\s*"%d %d %.17g %d %.17g",\s*values\.includes\(inox::String\("a", 1\)\),\s*map\.has\(inox::String\("a", 1\)\),\s*static_cast<double>\(map\.size\(\)\),\s*set\.has\(inox::String\("a", 1\)\),\s*static_cast<double>\(set\.size\(\)\)\s*\);/
  )
  assert.doesNotMatch(result.code, /auto inox_library_result_\d+ = (?:values\.includes|map\.has|map\.size|set\.has|set\.size)/)
}
