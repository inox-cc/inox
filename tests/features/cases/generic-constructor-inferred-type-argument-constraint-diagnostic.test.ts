// @targets cc
// @expect diagnostics INOX_TYPE_ARGUMENT_CONSTRAINT

type Named = {
  name: string
}

class Box<T extends Named> {
  constructor(value: T) {}
}

new Box({ value: 'invalid' })
