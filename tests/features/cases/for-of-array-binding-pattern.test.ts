// @targets cc
// @expect pass
// @stdout alpha:right
// @stdout beta:left

const pairs = [
  ['alpha', 'right'],
  ['beta', 'left']
] as const

for (const [first, second] of pairs) {
  console.log(`${first}:${second}`)
}
