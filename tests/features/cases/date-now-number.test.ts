// @targets c
// @expect pass
// @stdout 1
// @stdout 1

const now = Date.now()

console.log(now > 0)
console.log(Math.trunc(now) === now)
