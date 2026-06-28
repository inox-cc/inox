// @targets cc
// @expect pass
// @stdout fallback warn

type CompileResult = {
  code: string
  diagnostics: string[]
}

function caseName(tag: number): string {
  return `case-${tag}`
}

function compileByTag(tag: number): CompileResult {
  let diagnostic: string | null = null

  switch (tag) {
    case 0:
      return {
        code: caseName(tag),
        diagnostics: []
      }
    case 1:
      diagnostic = 'warn'
      break
    default:
      diagnostic = 'other'
      break
  }

  return {
    code: 'fallback',
    diagnostics: [diagnostic ?? 'none']
  }
}

const result = compileByTag(1)
console.log(`${result.code} ${result.diagnostics[0]}`)
