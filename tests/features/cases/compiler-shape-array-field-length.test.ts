// @targets cc
// @expect pass
// @stdout ok:3

type CompileResult = {
  code: string
  diagnostics: string[]
}

function compileUnit(): CompileResult {
  return {
    code: 'ok',
    diagnostics: ['parse', 'check', 'emit']
  }
}

function passThrough(result: CompileResult): CompileResult {
  return result
}

const result = passThrough(compileUnit())
console.log(`${result.code}:${result.diagnostics.length}`)
