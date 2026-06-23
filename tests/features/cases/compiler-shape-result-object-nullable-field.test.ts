// @targets c
// @expect pass
// @stdout c:warn

type Diagnostic = {
  message: string
}

type CompileResult = {
  code: string
  diagnostic: Diagnostic | null
}

function makeDiagnostic(): Diagnostic | null {
  return { message: 'warn' }
}

function compileUnit(): CompileResult {
  const diagnostic = makeDiagnostic()
  return {
    code: 'c',
    diagnostic
  }
}

function formatResult(result: CompileResult): string {
  const diagnostic = result.diagnostic

  if (diagnostic !== null) {
    return `${result.code}:${diagnostic.message}`
  }

  return result.code
}

console.log(formatResult(compileUnit()))
