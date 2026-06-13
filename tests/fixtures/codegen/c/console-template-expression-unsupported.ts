// @targets c
// @expect diagnostic
// @diagnostic CCJS_C_STRING_EXPR

const name = 'Ada'
console.log(`hello ${name + '!'}`)

