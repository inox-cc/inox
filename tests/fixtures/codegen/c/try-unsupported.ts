// @targets c
// @expect diagnostic
// @diagnostic CCJS_C_TRY

export function main(): void {
  while (true) {
    try {
      break
    } finally {
      console.log('finally')
    }
  }
}
