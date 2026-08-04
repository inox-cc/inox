// @targets cc
// @expect pass
// @stdout 1 9 3

const source = new Uint8Array([1, 2, 3])
const view = source.subarray(1)
view[0] = 9
console.log(source[0], source[1], source[2])
