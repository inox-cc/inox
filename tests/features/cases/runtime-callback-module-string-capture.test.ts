// @targets cc
// @expect pass
// @stdout node:url

const prefix = 'node'
const typeId = `${prefix}:url`
const values = ['url'].map(() => typeId)

console.log(values[0])
