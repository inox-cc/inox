// @targets cc
// @expect pass
// @stdout ok

const values = [1]
values.forEach((value) => value + 1)
console.log('ok')
