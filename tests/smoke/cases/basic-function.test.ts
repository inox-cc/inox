// @targets c
// @expect pass
// @stdout 42

function answer(seed: number): number {
  return seed * 2
}

console.log(answer(21))
