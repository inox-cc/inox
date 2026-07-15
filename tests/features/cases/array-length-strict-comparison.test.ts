// @targets cc
// @expect pass
// @stdout different

function haveSameLength(left: string[], right: string[]): boolean {
  return left.length === right.length
}

console.log(haveSameLength([], ['error']) ? 'same' : 'different')
