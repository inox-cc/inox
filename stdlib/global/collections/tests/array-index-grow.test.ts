// @targets cc
// @expect pass
// @stdout 4
// @stdout 1
// @stdout done

const values = ['first']
values[3] = 'done'

console.log(values.length)
console.log(values[1] === undefined)
console.log(values[3] ?? '')
