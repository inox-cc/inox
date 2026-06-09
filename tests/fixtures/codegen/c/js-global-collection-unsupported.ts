// @targets c
// @expect diagnostic
// @diagnostic CCJS_C_COLLECTION

export function main(): void {
  const values: Set<string> = new Set('Ada')
  console.log(values)
}
