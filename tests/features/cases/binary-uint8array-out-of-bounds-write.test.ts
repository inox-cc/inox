// @targets cc
// @expect pass
// @stdout 0

const bytes = new Uint8Array(1)
bytes[1] = 7
console.log(bytes[0])
