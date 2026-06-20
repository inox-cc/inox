// @targets c
// @expect pass
// @stdout 1

const map: Map<string, number> = new Map()
map.set('a', 1)
const box = { map }
console.log(box.map.size)
