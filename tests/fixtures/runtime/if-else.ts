// @targets js,c
// @expect pass

let result = 'no'

if (1 < 2) {
  result = 'yes'
} else {
  result = 'never'
}

console.log(result)
