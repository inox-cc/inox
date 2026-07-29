// @targets cc
// @expect pass
// @stdout 3

type Operation = (value: number) => number

type Operations = {
  apply: Operation
}

const operations: Operations = {
  apply: (value: number) => value + 1
}

console.log(operations.apply(2))
