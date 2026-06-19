// @targets c
// @expect diagnostic
// @diagnostic INOX_UNSUPPORTED_OPERATOR

const same = 1 == 1
const different = 'Ada' != 'Grace'
console.log(same, different)
