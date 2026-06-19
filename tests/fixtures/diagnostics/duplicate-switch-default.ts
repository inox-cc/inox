// @expect diagnostic
// @diagnostic INOX_DUPLICATE_DEFAULT

export function main(): void {
  switch (1) {
    default:
      console.log('a')
    default:
      console.log('b')
  }
}
