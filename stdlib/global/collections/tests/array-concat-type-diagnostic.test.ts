// @targets cc
// @expect diagnostics INOX_TYPE_MISMATCH

const values = [1, 2]
values.concat('three')
