// @targets cc
// @expect pass
// @stdout 2

const value = JSON.parse('{"score":1,"score":2}')
console.log(value.score)
