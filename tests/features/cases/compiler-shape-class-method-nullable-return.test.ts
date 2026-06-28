// @targets cc
// @expect pass
// @stdout diag:none

class DiagnosticStore {
  value: string | null

  constructor(value: string | null) {
    this.value = value
  }

  read(): string | null {
    return this.value
  }
}

const store = new DiagnosticStore(null)
const value = store.read() ?? 'none'
console.log(`diag:${value}`)
