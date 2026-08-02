// @targets cc
// @expect pass
// @stdout captured Ada

const names = ['Ada']
const label = 'captured'

setTimeout(async () => {
  await Promise.resolve()
  console.log(label, names[0])
}, 0)
