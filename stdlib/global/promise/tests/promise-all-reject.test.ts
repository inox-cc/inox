// @targets cc
// @expect pass
// @stdout failed

try {
  await Promise.all([Promise.resolve('ok'), Promise.reject('failed')])
} catch (error) {
  console.log(error)
}
