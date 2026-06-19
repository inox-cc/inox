// @targets c
// @expect diagnostic
// @diagnostic INOX_NO_DYNAMIC_IMPORT

export function main(): void {
  const value = import('./util.js')
  console.log(value)
}
