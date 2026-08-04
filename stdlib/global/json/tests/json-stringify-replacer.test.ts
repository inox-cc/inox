// @targets cc
// @expect diagnostics INOX_TYPE_MISMATCH

JSON.stringify({ name: 'Ada' }, () => true)
