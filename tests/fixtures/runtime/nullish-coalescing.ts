// @targets c
// @expect diagnostic
// @diagnostic CCJS_C_NULLISH

function coalesce(value: unknown): unknown {
  return value ?? 'Ada'
}

console.log(coalesce(null), coalesce('Grace'))
