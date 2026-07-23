// @targets cc
// @expect pass
// @stdout 1

const bytes = new Uint8Array(1)
console.log(bytes[1] === undefined)
