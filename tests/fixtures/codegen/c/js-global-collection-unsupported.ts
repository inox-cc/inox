// @targets c
// @expect diagnostic
// @diagnostic CCJS_C_COLLECTION

export function main(): void {
  const values = new Set([1, 2])
  console.log(values)
}
