// @targets cc
// @expect pass
// @stdout 1

const names: Set<string> = new Set()
names.add('Ada')
console.log(names.size)
