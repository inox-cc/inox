export type CompilerShapeDiagnostic = {
  code: string
  message: string
  path: string[]
}

export type CompilerShapeResult = {
  code: string
  diagnostics: string[]
  source: string | null
}

export const compilerShapePrefix = 'module'

export function makeCompilerShapeResult(code: string): CompilerShapeResult {
  return {
    code,
    diagnostics: [`module:${code}`],
    source: null
  }
}
