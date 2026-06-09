// @targets c
// @expect diagnostic
// @diagnostic CCJS_C_ARRAY_METHOD

function compare(left: number, right: number): number {
  return left - right
}

export function main(): void {
  const values = [3, 1, 2]
  values.sort(compare)
}
