// @targets c
// @expect pass
// @stdout 2
// @stdout b

const values = 'a,b'.split(',')
console.log(values.length)
console.log(values[1])
