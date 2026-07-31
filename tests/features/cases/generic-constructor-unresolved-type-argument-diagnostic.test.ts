// @targets cc
// @expect diagnostics INOX_TYPE_ARGUMENT_INFERENCE

class Box<T> {
  constructor() {}
}

new Box()
