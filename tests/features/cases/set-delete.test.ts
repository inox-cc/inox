// @targets cc
// @expect pass
// @stdout 0

const names: Set<string> = new Set()
names.add('Ada')
names.delete('Ada')
console.log(names.has('Ada'))
