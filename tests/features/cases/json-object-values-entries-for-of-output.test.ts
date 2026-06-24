// @targets c
// @expect pass
// @stdout 0
// @stdout [[0, { 1: 2 }], [1, { 3: 4, 5: 6 }]]
// @stdout { 1: 2 }
// @stdout [2]
// @stdout 2
// @stdout [[1, 2]]
// @stdout [1, 2]
// @stdout { 3: 4, 5: 6 }
// @stdout [4, 6]
// @stdout 4
// @stdout [[3, 4], [5, 6]]
// @stdout [3, 4]

const foo = JSON.parse('{"v":[{"1":2},{"3":4,"5":6}]}')

console.log(Array.isArray(foo))
console.log(Object.entries(foo.v))

for (const a of foo.v) {
  console.log(a)

  const b = Object.values(a)
  console.log(b)

  const c = Object.values(a)[0]
  console.log(c)

  const d = Object.entries(a)
  console.log(d)

  const e = Object.entries(a)[0]
  console.log(e)
}
