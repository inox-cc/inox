// @targets cc
// @expect pass
// @stdout module:inline

import { makeCompilerShapeResult, type CompilerShapeResult } from './modules/compiler-shapes.ts'

function summarize(result: CompilerShapeResult): string {
  if (result.diagnostics.length > 0) {
    return result.diagnostics[0]
  }

  return ''
}

const result = makeCompilerShapeResult('inline')
console.log(summarize(result))
