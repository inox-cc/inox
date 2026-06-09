// @targets js
// @expect diagnostic
// @diagnostic CCJS_NO_DYNAMIC_IMPORT

export function main(): void {
  const value = import('./util.js')
  console.log(value)
}
