// @expect diagnostic
// @diagnostic INOX_TYPE_MISMATCH

function getValue(): number {
  return 'Ada'
}

export function main(): void {
  console.log(getValue())
}
