// @targets c
// @expect diagnostic
// @diagnostic CCJS_C_JS_GLOBAL

export function main(): void {
  const response = fetch('data:text/plain,hello')
  console.log(response)
}
