// @targets cc
// @expect pass
// @stdout 0
// @stdout 1
// @stdout 2

let index: number = 0
while (index < 3) {
  console.log(index)
  index++
}
