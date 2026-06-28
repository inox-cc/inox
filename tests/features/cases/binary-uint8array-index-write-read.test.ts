// @targets cc
// @expect pass
// @stdout 7

const bytes = new Uint8Array(1)
bytes[0] = 7
console.log(bytes[0])
