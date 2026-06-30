// @targets cc
// @expect pass
// @stdout о
// @stdout 1086

const value = 'foo 1 ололо'
console.log(value[6])
console.log(value.charCodeAt(6))
