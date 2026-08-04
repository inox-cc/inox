// @targets cc
// @expect pass
// @stdout 4
// @stdout 1,9,8,4
// @stdout 1,1,9,8

const bytes = new Uint8Array([1, 2, 3, 4])
const values = [9, 8]

console.log(bytes.at(-1))
bytes.fill(258, 1, 3)
bytes.set(values, 1)
console.log(bytes.toString())
bytes.set(bytes.subarray(0, 3), 1)
console.log(bytes.toString())
