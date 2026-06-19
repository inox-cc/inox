// @targets c
// @expect diagnostic
// @diagnostic INOX_C_OPTIONAL_CHAINING

function hello(): string {
  return 'called'
}

const data = { hello }
console.log(data.hello?.())

