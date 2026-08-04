// @targets cc
// @expect pass
// @stdout 1 9 9 4 1 7 7 3 5 5

const values = [1, 2, 3, 4]
const same = values.fill(9, 1, -1)
const leading = [1, 2, 3]
leading.fill(7, -10, 2)
const all = [1, 2]
all.fill(5)

console.log(values.join(' '), same === values, leading.join(' '), all.join(' '))
