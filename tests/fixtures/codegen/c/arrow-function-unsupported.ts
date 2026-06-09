// @targets c
// @expect diagnostic
// @diagnostic CCJS_C_ARRAY_METHOD

export function main(): void {
  const values = [3, 1, 2]
  values.sort((left, right) => left - right)
}
