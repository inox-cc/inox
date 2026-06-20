// @targets c
// @expect diagnostics INOX_REDECLARED_NAME

const value = 1
const value = 2
console.log(value)
