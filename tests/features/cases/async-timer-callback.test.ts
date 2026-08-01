// @targets cc
// @expect pass
// @stdout async timer 1

setTimeout(async () => {
  const value = await Promise.resolve(1)
  console.log('async timer', value)
}, 0)
