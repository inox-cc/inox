// @targets cc
// @expect pass
// @stdout named async timer

async function onTimer(): Promise<void> {
  await Promise.resolve()
  console.log('named async timer')
}

setTimeout(onTimer, 0)
