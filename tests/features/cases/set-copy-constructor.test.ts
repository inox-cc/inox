// @targets c
// @expect pass
// @stdout 1

const first: Set<string> = new Set()
first.add('a')
const second: Set<string> = new Set(first)
console.log(second.has('a'))
