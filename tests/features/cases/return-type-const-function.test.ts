// @targets cc
// @expect diagnostics INOX_TYPE_MISMATCH

const makeName = (value: string) => value
type Name = ReturnType<typeof makeName>
const name: Name = 1
