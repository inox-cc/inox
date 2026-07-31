// @targets cc
// @expect diagnostics INOX_TYPE_ARGUMENT_INFERENCE

function choose<T>(first: T, second: T): T {
  return first
}

choose('Ada', 42)
