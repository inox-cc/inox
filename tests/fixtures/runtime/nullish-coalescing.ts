// @targets js
// @expect pass

function coalesce(value: unknown): unknown {
  return value ?? 'Ada'
}

console.log(coalesce(null), coalesce('Grace'))

