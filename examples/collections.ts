// @targets c
// @expect pass
// @stdout 20

export function main(): void {
  const values = [5, 1, 4, 2]
  const processed = values
    .filter(value => value > 1)
    .sort((left, right) => left - right)
    .map(value => value * 10)

  const scores: Map<string, number> = new Map([['Ada', 7], ['Grace', 9]])
  const names: Set<string> = new Set(['Ada', 'Grace'])

  if (scores.has('Ada') && names.has('Grace')) {
    console.log(processed[0])
  }
}
