// @targets cc
// @expect pass
// @stdout 4

const bytes = new Uint8Array(4)
const same = crypto.getRandomValues(bytes)
console.log(same.length)
