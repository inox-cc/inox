export function main(): void {
  const scores: Map<string, number> = new Map([['Ada', 7], ['Grace', 9]])
  const names: Set<string> = new Set(['Ada'])
  const values = [3, 1, 2, 1]
  const selected = values.filter(value => value > 1).sort((left, right) => left - right).map(value => value * 2)
  let total = 0

  scores['Ada'] = 10
  scores.set('Linus', 8)
  names.add('Grace').add('Linus')
  names.delete('Linus')
  const scratchScores: Map<string, number> = new Map([['Temp', 1]])
  scratchScores.clear()
  const scratchNames: Set<string> = new Set(['Temp'])
  scratchNames.clear()

  for (const value of selected) {
    total = total + value
  }

  const adaScore = scores['Ada'] ?? 0

  if (scores.has('Ada') && names.has('Grace') && scores.size === 3 && names.size === 2 && scratchScores.size === 0 && !scratchNames.has('Temp')) {
    console.log(`collections ${total} ${adaScore}`)
  } else {
    console.log('bad')
  }
}
