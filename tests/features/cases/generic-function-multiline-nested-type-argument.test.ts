// @targets cc
// @expect pass
// @stdout Ada

function identity<T>(value: T): T {
  return value
}

const value = identity<
  Array<string>
>(['Ada'])
const first = value[0]

if (first !== null && typeof first !== 'undefined') {
  console.log(first)
}
