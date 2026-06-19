// @targets c
// @expect diagnostic
// @diagnostic INOX_C_FOR_OF

const user = { name: 'Ada' }
for (const value of user) {
  console.log(value)
}

