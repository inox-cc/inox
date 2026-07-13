// @targets cc
// @expect pass
// @stdout 0

const value = JSON.parse('{"v":[{"1":2},{"3":4,"5":"text"}]}')
console.log(Object.entries(value.v)[0][0])
