// @targets c
// @expect pass
// @stdout Error boom

const error = new Error('boom')
console.log(error.name, error.message)

