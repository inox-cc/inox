// @targets c
// @expect pass

const code = 2
let text = 'none'

switch (code) {
  case 1:
    text = 'one'
    break
  case 2:
    text = 'two'
    break
  default:
    text = 'other'
}

console.log(text)
