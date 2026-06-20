// @targets c
// @expect pass
// @stdout 7

const value: string | number = 7
if (typeof value === 'number') {
  console.log(value)
}
