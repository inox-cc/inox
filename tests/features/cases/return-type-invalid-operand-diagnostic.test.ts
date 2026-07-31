// @targets cc
// @expect diagnostics INOX_TYPE_OPERATOR_OPERAND

type Invalid = ReturnType<string>
const value: Invalid = 'Ada'
