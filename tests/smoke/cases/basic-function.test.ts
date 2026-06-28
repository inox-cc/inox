// @targets cc
// @expect pass
// @stdout 21
// @stdout Ada#21
// @stdout branch:large
// @stdout 3-2-1

function sumTo(limit: number): number {
  let total = 0

  for (let value = 1; value <= limit; value = value + 1) {
    total = total + value
  }

  return total
}

function formatRun(name: string, score: number): string {
  return name + '#' + String(score)
}

const score = sumTo(6)
console.log(score)
console.log(formatRun('Ada', score))

if (score > 20 && score < 30) {
  console.log('branch:large')
} else {
  console.log('branch:small')
}

let countdown = ''
let current = 3

while (current > 0) {
  countdown = countdown + String(current)

  if (current > 1) {
    countdown = countdown + '-'
  }

  current = current - 1
}

console.log(countdown)
