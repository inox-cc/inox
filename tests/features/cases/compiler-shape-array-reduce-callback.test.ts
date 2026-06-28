// @targets cc
// @expect pass
// @stdout 12

function sumDiagnostics(base: number, values: number[]): number {
  const offset = base
  return values.reduce((total, value) => total + value + offset, 0)
}

console.log(sumDiagnostics(2, [1, 2, 3]))
