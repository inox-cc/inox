// @targets cc
// @expect pass
// @stdout value

type Mapper = {
  map(out: string): string
}

const mapper: Mapper = {
  map: (out) => out
}

console.log(mapper.map('value'))
