// @targets cc
// @expect pass
// @stdout module:ok

import { makeCompilerShapeResult } from './modules/compiler-shapes.ts'
import type { CompilerShapeResult } from './modules/compiler-shapes.ts'

function summarize(result: CompilerShapeResult): string {
  if (result.diagnostics.length > 0) {
    return result.diagnostics[0]
  }

  return ''
}

const result = makeCompilerShapeResult('ok')
console.log(summarize(result))
