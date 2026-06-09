// @targets c
// @expect diagnostic
// @diagnostic CCJS_C_JS_GLOBAL

export function main(): void {
  const error = new Error('boom')
  console.log(error)
}
