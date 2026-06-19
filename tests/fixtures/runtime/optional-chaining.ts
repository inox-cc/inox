// @targets c
// @expect diagnostic
// @diagnostic INOX_C_OPTIONAL_CHAINING

function hello(): string {
  return 'called'
}

const data = { items: [{ name: 'Ada' }], hello }
const missing = null
console.log(data?.items?.[0]?.name, missing?.items?.[0]?.name, data.hello?.())
