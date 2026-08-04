// @targets cc
// @expect pass
// @stdout null
// @stdout 0

console.log(JSON.stringify(1 / 0))
console.log(JSON.stringify(-0))
