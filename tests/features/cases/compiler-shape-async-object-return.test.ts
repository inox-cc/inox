// @targets cc
// @expect pass
// @stdout ok:async

type CompileResult = {
  code: string
  diagnostics: string[]
}

async function compileUnit(): Promise<CompileResult> {
  const result = await Promise.resolve({
    code: 'ok',
    diagnostics: ['async']
  })

  return result
}

const result = await compileUnit()
console.log(`${result.code}:${result.diagnostics[0]}`)
