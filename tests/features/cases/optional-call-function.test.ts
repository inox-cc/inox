// @targets c
// @expect pass
// @stdout 5

const fn = () => 5
console.log(fn?.())
