// @targets cc
// @expect diagnostics INOX_ASYNC_TIMER_CALLBACK

setTimeout(async () => {
  await Promise.resolve(1)
}, 0)
