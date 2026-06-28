// @targets cc
// @expect pass
// @stdout 9

const value: number = 3
switch (value) {
  case 1:
    console.log(1)
    break
  default:
    console.log(9)
}
