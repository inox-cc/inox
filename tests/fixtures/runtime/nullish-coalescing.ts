// @targets js
// @expect pass

function coalesce(value: unknown): unknown {
  return value ?? 'Ada'
}

export function main(): void {
  console.log(coalesce(null), coalesce('Grace'))
}
