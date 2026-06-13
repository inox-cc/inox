// @expect diagnostic
// @diagnostic CCJS_ASYNC_TIMER_CALLBACK

export function main(): void {
  setTimeout(async () => {
    await Promise.resolve(1)
  }, 1)
}
