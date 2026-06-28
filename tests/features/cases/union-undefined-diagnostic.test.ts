// @targets cc
// @expect diagnostics INOX_UNKNOWN_NAME

const value: string | undefined = undefined
console.log(value ?? 'none')
