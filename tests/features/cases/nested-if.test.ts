// @targets cc
// @expect pass
// @stdout 2

const a: boolean = true
const b: boolean = false
if (a) {
  if (b) {
    console.log(1)
  } else {
    console.log(2)
  }
}
