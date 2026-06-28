// @targets cc
// @expect pass
// @stdout module:ok

import { makeCompilerShapeResult } from './modules/compiler-shapes.ts'
import type { CompilerShapeResult } from './modules/compiler-shapes.ts'

function summarize(result: CompilerShapeResult): string {
  return result.diagnostics[0]
}

const result = makeCompilerShapeResult('ok')
console.log(summarize(result))
