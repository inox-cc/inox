// @targets cc
// @expect pass
// @stdout two

const value: number = 2
switch (value) {
  case 1:
    console.log('one')
    break
  case 2:
    console.log('two')
    break
  default:
    console.log('other')
}
