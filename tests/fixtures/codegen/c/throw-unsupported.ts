// @targets c
// @expect diagnostic
// @diagnostic CCJS_C_THROW

export function main(): void {
  throw 'boom'
}
