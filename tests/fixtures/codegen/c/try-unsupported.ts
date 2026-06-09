// @targets c
// @expect diagnostic
// @diagnostic CCJS_C_TRY

export function main(): void {
  try {
    console.log('try')
  } finally {
    console.log('finally')
  }
}
