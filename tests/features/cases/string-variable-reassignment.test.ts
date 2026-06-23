// @targets c
// @expect pass
// @stdout updated

let value = 'initial'

if (true) {
  value = 'updated'
}

console.log(value)
