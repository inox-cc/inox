// @targets c
// @expect pass
// @stdout 5

function fib(value: number): number {
  if (value <= 1) {
    return value
  }

  return fib(value - 1) + fib(value - 2)
}

console.log(fib(5))
