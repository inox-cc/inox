// @targets c
// @expect pass
// @stdout emit:1

type CompileResult = {
  code: string
  diagnostics: string[]
}

type Reporter = (result: CompileResult) => string

function invoke(callback: Reporter, result: CompileResult): string {
  return callback(result)
}

function through(callback: Reporter, result: CompileResult): string {
  return invoke(callback, result)
}

const result: CompileResult = {
  code: 'emit',
  diagnostics: ['ok']
}

console.log(through((value) => `${value.code}:${value.diagnostics.length}`, result))
