// @targets cc
// @expect diagnostics INOX_NO_DYNAMIC_IMPORT

const module = import('./other.ts')
console.log(module)
