// @expect diagnostic
// @diagnostic INOX_CONDITION_TYPE

export function main(): void {
  if (1) {
    console.log('bad')
  }
}
