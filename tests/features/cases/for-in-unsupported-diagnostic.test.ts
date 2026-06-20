// @targets c
// @expect diagnostics INOX_NO_FOR_IN

const user = { name: 'Ada' }
for (const key in user) {
  console.log(key)
}
