// @targets c
// @expect diagnostic
// @diagnostic CCJS_C_FOR_OF

const user = { name: 'Ada' }
for (const value of user) {
  console.log(value)
}

