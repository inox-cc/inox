// @expect diagnostic
// @diagnostic CCJS_NO_FOR_IN

export function main(): void {
  const value = { name: 'Ada' }

  for (const key in value) {
    console.log(key)
  }
}
