// @targets c
// @expect pass
// @stdout none

const value = Number('nope')
if (value === null) {
  console.log('none')
}
