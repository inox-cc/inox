// @targets cc
// @expect pass
// @stdout 5

const fields = [['name', 'value']]
const index = 0

console.log(fields[index][1].length)
