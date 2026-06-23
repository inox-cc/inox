// @targets c
// @expect pass
// @stdout emit:2

type CompileResult = {
  code: string
  diagnostics: string[]
}

function compileUnit(): CompileResult {
  const result: CompileResult = {
    code: 'emit',
    diagnostics: ['a', 'b']
  }

  return result
}

function summarize(result: CompileResult): string {
  return `${result.code}:${result.diagnostics.length}`
}

const result = compileUnit()
console.log(summarize(result))
