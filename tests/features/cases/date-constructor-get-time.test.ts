// @targets c
// @expect pass
// @stdout 0
// @stdout 1
// @stdout 1

const epoch = new Date(0)
const now = new Date()

console.log(epoch.getTime())
console.log(now.getTime() > 0)
console.log(Math.abs(epoch.getTimezoneOffset()) < 1000)
