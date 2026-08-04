// @targets cc
// @expect pass
// @stdout a c missing

const value = 'abc'
console.log(value.at(0), value.at(-1), value.at(3) ?? 'missing')
