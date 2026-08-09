// @targets cc
// @expect pass
// @stdout values 'alpha', 'beta'

const values = ['alpha', 'beta']

console.log(`values ${values.map((value) => `'${value}'`).join(', ')}`)
