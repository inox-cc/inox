// @targets cc
// @expect pass
// @stdout 7

type Options = {
  value: number
}

const options: Options = {
  value: true ? 7 : 9
}

console.log(options.value)
