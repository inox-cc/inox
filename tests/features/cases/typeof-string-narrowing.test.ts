// @targets c
// @expect pass
// @stdout Ada

const value: string | number = 'Ada'
if (typeof value === 'string') {
  console.log(value)
}
