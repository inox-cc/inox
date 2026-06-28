// @targets cc
// @expect pass
// @stdout 1
// @stdout 1

function isSeparator(ch: string): boolean {
  return ch === '_' || ch === '-'
}

console.log(isSeparator('_'))
console.log(!isSeparator('A'))
