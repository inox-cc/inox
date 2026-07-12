// @targets cc
// @expect pass
// @stdout module:inline

import { makeCompilerShapeResult, type CompilerShapeResult } from './modules/compiler-shapes.ts'

function summarize(result: CompilerShapeResult): string {
  return result.diagnostics[0]
}

const result = makeCompilerShapeResult('inline')
console.log(summarize(result))
