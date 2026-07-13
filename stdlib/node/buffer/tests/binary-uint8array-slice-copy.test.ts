// @targets cc
// @expect pass
// @stdout 65,66

const bytes = new Uint8Array([65, 66])
const slice = bytes.slice(0, 1)
slice[0] = 90
console.log(bytes.toString())
