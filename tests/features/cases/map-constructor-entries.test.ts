// @targets c
// @expect pass
// @stdout 2

const map: Map<string, number> = new Map([['a', 1], ['b', 2]])
console.log(map.size)
