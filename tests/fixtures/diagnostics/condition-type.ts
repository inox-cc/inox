// @expect diagnostic
// @diagnostic CCJS_CONDITION_TYPE

export function main(): void {
  if (1) {
    console.log('bad')
  }
}
