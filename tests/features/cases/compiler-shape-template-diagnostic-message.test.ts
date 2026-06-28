// @targets cc
// @expect pass
// @stdout phase compile: item 3 token-e

type Diagnostic = {
  message: string
}

function tokenName(value: string): string {
  return `token-${value}`
}

const phase = 'compile'
const index = 1
const field = 'emit'
const diagnostic: Diagnostic = {
  message: `phase ${phase}: ${`item ${index + 2}`} ${tokenName(field[0])}`
}

console.log(diagnostic.message)
