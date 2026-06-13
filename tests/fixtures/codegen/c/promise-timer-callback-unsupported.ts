// @targets c
// @expect diagnostic
// @diagnostic CCJS_C_TIMER_CALLBACK

export function main(): void {
  const pending = Promise.resolve(1).then(value => {
    setTimeout(() => {
      console.log(value)
    }, 1)

    return value
  })
}
