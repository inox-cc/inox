// @targets c
// @expect pass
// @stdout ok
// @stdout 2

type CompileResult = {
  code: string
  diagnostics: string[]
}

function compileUnit(): CompileResult {
  return {
    code: 'ok',
    diagnostics: ['parse', 'emit']
  }
}

function printResult(result: CompileResult): void {
  console.log(result.code)
  console.log(result.diagnostics.length)
}

const result = compileUnit()
printResult(result)
