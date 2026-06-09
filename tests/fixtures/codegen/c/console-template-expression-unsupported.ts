// @targets c
// @expect diagnostic
// @diagnostic CCJS_C_STRING_EXPR

export function main(): void {
  const name = 'Ada'
  console.log(`hello ${name + '!'}`)
}
