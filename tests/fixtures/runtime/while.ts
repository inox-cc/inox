// @targets js,c
// @expect pass

let index = 0
let total = 0

while (index < 4) {
  total = total + index
  index = index + 1
}

console.log(total)
