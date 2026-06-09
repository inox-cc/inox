// @targets c
// @expect diagnostic
// @diagnostic CCJS_C_ARRAY_METHOD

export function main(): void {
  const values = [3, 1, 2]
  const result = values.map(value => value * 2)
  console.log(result)
}
