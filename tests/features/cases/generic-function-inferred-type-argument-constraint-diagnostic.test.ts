// @targets cc
// @expect diagnostics INOX_TYPE_ARGUMENT_CONSTRAINT

type Named = {
  name: string
}

type Unnamed = {
  value: string
}

function nameOf<T extends Named>(value: T): string {
  return value.name
}

const value: Unnamed = { value: 'invalid' }
nameOf(value)
