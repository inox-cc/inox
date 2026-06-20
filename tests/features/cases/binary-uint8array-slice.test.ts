// @targets c
// @expect pass
// @stdout B

const bytes = new Uint8Array([65, 66, 67])
console.log(bytes.slice(1, 2).toString())
