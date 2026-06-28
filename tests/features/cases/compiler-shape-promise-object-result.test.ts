// @targets cc
// @expect pass
// @stdout ok:late

type CompileResult = {
  code: string
  diagnostics: string[]
}

async function compileUnit(): Promise<CompileResult> {
  const promise: Promise<CompileResult> = new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        code: 'ok',
        diagnostics: ['late']
      })
    }, 0)
  })

  return await promise
}

const result = await compileUnit()
const message = await Promise.resolve(result)
  .then((value) => `${value.code}:${value.diagnostics[0]}`)
  .catch((error) => `diag:${error.message}`)

console.log(message)
