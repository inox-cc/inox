// @targets cc
// @expect pass
// @stdout 0

const map: Map<string, number> = new Map()
map.set('a', 1)
map.clear()
console.log(map.size)
