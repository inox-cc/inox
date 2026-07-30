// @targets cc
// @expect pass
// @stdout INOX_OK 3 2 none

type SourceSpan = {
  line: number
  column: number
}

type CompilerDiagnostic = {
  code: string
  message: string
  location: SourceSpan
  notes: string[]
  hint: string | null
}

function createDiagnostic(code: string): CompilerDiagnostic {
  return {
    code,
    message: 'done',
    location: { line: 3, column: 8 },
    notes: ['parse', 'emit'],
    hint: null
  }
}

const diagnostics: CompilerDiagnostic[] = [createDiagnostic('INOX_OK')]

if (diagnostics.length > 0) {
  const first = diagnostics[0]
  console.log(`${first.code} ${first.location.line} ${first.notes.length} ${first.hint ?? 'none'}`)
}
