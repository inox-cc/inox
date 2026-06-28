// @targets cc
// @expect pass
// @stdout parse

function label(kind: number): string {
  switch (kind) {
    case 1:
      return 'parse'
    case 2:
      return 'check'
    default:
      return 'emit'
  }
}

console.log(label(1))
