// @targets c
// @expect diagnostic
// @diagnostic CCJS_C_FUNCTION_VALUE

export function main(): void {
  const values = [3, 1, 2]
  const result = values.map(value => value * 2)
  console.log(result)
}
