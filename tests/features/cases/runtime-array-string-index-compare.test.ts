// @targets cc
// @expect pass
// @stdout 1

const node = { path: ['Array'] }
console.log(node.path[0] === 'Array')
