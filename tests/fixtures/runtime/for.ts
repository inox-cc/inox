// @targets c
// @expect pass

let total = 0

for (let index = 0; index < 4; index = index + 1) {
  total = total + index
}

console.log(total)
