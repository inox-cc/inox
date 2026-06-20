// @targets c
// @expect pass
// @stdout 10

const values = [1, 2, 3, 4]
let total = 0

for (let index = 0; index < values.length; index = index + 1) {
  total = total + values[index]
}

console.log(total)
