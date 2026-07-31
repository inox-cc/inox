// @targets cc
// @expect diagnostics INOX_TYPE_PREDICATE_PARAMETER

function isString(value: unknown): missing is string {
  return typeof value === 'string'
}

isString('Ada')
