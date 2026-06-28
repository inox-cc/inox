// @targets cc
// @expect pass
// @stdout E001:main.ts:2

type Location = {
  file: string
  line: number
}

type Diagnostic = {
  code: string
  location: Location
  notes: string[]
  hint: string | null
}

function createDiagnostic(): Diagnostic {
  return {
    code: 'E001',
    location: {
      file: 'main.ts',
      line: 2
    },
    notes: ['narrow', 'emit'],
    hint: null
  }
}

const diagnostic = createDiagnostic()
console.log(`${diagnostic.code}:${diagnostic.location.file}:${diagnostic.notes.length}`)
