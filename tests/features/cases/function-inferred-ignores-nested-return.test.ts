// @targets cc
// @expect pass
// @stdout 7

type Formatter = (value: number) => string

function result() {
  const format: Formatter = (value: number) => {
    return `${value}`
  }

  format(1)
  return 7
}

console.log(result())
