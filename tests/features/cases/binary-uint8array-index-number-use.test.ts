// @targets cc
// @expect pass
// @stdout 1 0

const bytes = new Uint8Array(1)
bytes[0] = 7
console.log(bytes[0] >= 0, bytes[1] >= 0)
