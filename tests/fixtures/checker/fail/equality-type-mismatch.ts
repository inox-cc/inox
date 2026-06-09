// @expect diagnostic
// @diagnostic CCJS_TYPE_MISMATCH

export function main(): void {
  const same = 1 == '1'
  console.log(same)
}
