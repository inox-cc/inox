// @targets c
// @expect pass
// @stdout 3

const group = { values: [1, 2] }
let total = 0
for (const value of group.values) {
  total = total + value
}
console.log(total)
