// @targets cc
// @expect pass
// @stdout 3

type Config = {
  count: number
}

const count = 3 as Config['count']
console.log(count)
