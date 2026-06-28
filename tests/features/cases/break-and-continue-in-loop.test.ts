// @targets cc
// @expect pass
// @stdout 0
// @stdout 2

for (let index = 0; index < 5; index++) {
if (index === 1) {
  continue
}
if (index === 3) {
  break
}
console.log(index)
}
