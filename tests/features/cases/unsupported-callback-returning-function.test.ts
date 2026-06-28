// @targets cc
// @expect diagnostics INOX_C_FUNCTION_VALUE

function make(): Function {
  return () => {}
}

const callback = make()
callback()
