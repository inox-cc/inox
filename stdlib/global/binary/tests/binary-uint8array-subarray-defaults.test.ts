// @targets cc
// @expect pass
// @stdout 3 2

const source = new Uint8Array([1, 2, 3])
console.log(source.subarray().length, source.subarray(1, 9).length)
