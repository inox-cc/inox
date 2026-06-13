type User = {
  readonly id: number,
  name: string,
  scores: number[]
}

function total(user: User): number {
  let sum = 0

  for (const score of user.scores) {
    sum = sum + score
  }

  return sum
}

const user: User = { id: 1, name: 'Ada', scores: [2, 3, 5] }
const score = total(user)

console.log(`${user.name} ${score}`)

