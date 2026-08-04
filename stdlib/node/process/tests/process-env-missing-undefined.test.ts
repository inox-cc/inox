// @targets js cc
// @expect pass
// @stdout missing

console.log(process.env.INOX_TEST_VARIABLE_THAT_DOES_NOT_EXIST ?? 'missing')
