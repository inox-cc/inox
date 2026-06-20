// @targets c
// @expect pass
// @stdout 2

const set: Set<string> = new Set(['a', 'b'])
console.log(set.size)
