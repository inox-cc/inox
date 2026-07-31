// @targets cc
// @expect diagnostics INOX_TYPE_MISMATCH

function transform<T>(value: T, callback: (value: T) => T): T {
  return callback(value)
}

transform('Ada', value => 42)
