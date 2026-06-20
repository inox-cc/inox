// @targets c
// @expect pass
// @stdout 4

const values = [1, 2]
const doubled = values.map((value) => value * 2)
console.log(doubled[1])
