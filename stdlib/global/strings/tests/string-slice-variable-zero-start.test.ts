// @targets cc
// @expect pass
// @stdout field

function trimLike(value: string): string {
  let index = 0

  return value.slice(index)
}

console.log(trimLike('field'))
