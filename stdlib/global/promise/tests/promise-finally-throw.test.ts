// @targets cc
// @expect pass
// @stdout cleanup failed

try {
  await Promise.resolve('value').finally(() => {
    throw 'cleanup failed'
  })
} catch (error) {
  console.log(error)
}
