// @targets c
// @expect diagnostic
// @diagnostic CCJS_C_NULLISH

function printValue(value: unknown): void {
  console.log(value ?? 'Ada')
}

export function main(): void {
  printValue(1)
}
