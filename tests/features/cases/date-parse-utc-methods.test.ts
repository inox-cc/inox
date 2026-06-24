// @targets c
// @expect pass
// @stdout 2026
// @stdout 5
// @stdout 24
// @stdout 3
// @stdout 12
// @stdout 34
// @stdout 56
// @stdout 789
// @stdout 1
// @stdout 2026-06-24T12:34:56.789Z
// @stdout Wed, 24 Jun 2026 12:34:56 GMT

const parsed = Date.parse('2026-06-24T12:34:56.789Z')
const date = new Date(parsed)

console.log(date.getUTCFullYear())
console.log(date.getUTCMonth())
console.log(date.getUTCDate())
console.log(date.getUTCDay())
console.log(date.getUTCHours())
console.log(date.getUTCMinutes())
console.log(date.getUTCSeconds())
console.log(date.getUTCMilliseconds())
console.log(Date.UTC(2026, 5, 24, 12, 34, 56, 789) === parsed)
console.log(date.toISOString())
console.log(date.toUTCString())
