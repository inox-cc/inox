// @targets c
// @expect diagnostic
// @diagnostic CCJS_C_UNSUPPORTED_EXPR

export function main(): void {
  const user = { name: 'Ada' }
  console.log(user)
}
