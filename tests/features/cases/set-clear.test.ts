// @targets c
// @expect pass
// @stdout 0

const set: Set<string> = new Set()
set.add('a')
set.clear()
console.log(set.size)
