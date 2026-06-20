// @targets c
// @expect pass
// @stdout a

const map: Map<string, number> = new Map()
map.set('a', 1)
for (const key of map.keys()) {
  console.log(key)
}
