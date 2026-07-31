// @targets cc
// @expect pass
// @stdout ADA

function first<A, B>(value: A, unused: B): A {
  return value
}

const value = first<
  string,
  number
>('Ada', 1)

console.log(value.toUpperCase())
