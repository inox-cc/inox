// @targets c
// @expect diagnostic
// @diagnostic CCJS_UNKNOWN_NAME

export function main(): void {
  console.log(`hello ${missing}`)
}
