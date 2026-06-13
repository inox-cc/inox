type User = {
  readonly name: string
  score: number
}

function bump(value: number): number {
  return value + 1
}

const user: User = { name: 'Ada', score: 3 }
let total = user.score

for (const value of [1, 2, 3]) {
  total = total + value
}

const result = bump(total)

if (user.name === 'Ada' && result === 10) {
  console.log(`ok ${user.name} ${result}`)
} else {
  console.log('bad')
}
