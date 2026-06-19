// @targets c
// @expect diagnostic
// @diagnostic INOX_C_UNSUPPORTED_EXPR

function coalesce(value: unknown): unknown {
  return value ?? 'Ada'
}

console.log(coalesce(null), coalesce('Grace'))
