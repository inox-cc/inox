// @targets cc
// @expect pass
// @stdout 1

const names = new Set<string>()
names.add('Ada')
console.log(names.size)
