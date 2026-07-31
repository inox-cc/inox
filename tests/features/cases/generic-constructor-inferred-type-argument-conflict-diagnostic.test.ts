// @targets cc
// @expect diagnostics INOX_TYPE_ARGUMENT_INFERENCE

class Pair<T> {
  constructor(first: T, second: T) {}
}

new Pair('Ada', 42)
