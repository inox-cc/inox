// @targets cc
// @expect pass
// @stdout 0

const values: number[] = []
for (let index = values.length - 1; index >= 0; index--) {
console.log(values[index])
}
console.log(values.length)
