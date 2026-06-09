// @targets c
// @expect diagnostic
// @diagnostic CCJS_C_FOR_OF

export function main(): void {
  for (const value of ['a', 'b']) {
    console.log(value)
  }
}
