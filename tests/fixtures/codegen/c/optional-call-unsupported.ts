// @targets c
// @expect diagnostic
// @diagnostic CCJS_C_OPTIONAL_CHAINING

function hello(): string {
  return 'called'
}

const data = { hello }
console.log(data.hello?.())

