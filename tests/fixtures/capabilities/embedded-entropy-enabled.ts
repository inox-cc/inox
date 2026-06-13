// @targets c
// @platforms embedded
// @features entropy,binary
// @expect pass

const bytes = Buffer.alloc(4)
crypto.getRandomValues(bytes)
console.log(bytes.length)

