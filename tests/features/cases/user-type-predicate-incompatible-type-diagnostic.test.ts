// @targets cc
// @expect diagnostics INOX_TYPE_PREDICATE_TYPE

function isNumber(value: string): value is number {
  return value.length > 0
}

isNumber('42')
