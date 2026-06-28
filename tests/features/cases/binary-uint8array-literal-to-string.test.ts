// @targets cc
// @expect pass
// @stdout 65,66

const bytes = new Uint8Array([65, 66])
console.log(bytes.toString())
