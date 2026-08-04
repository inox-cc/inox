// @targets cc
// @expect pass
// @stdout failed

try {
  await Promise.race([Promise.reject('failed'), Promise.resolve('late')])
} catch (error) {
  console.log(error)
}
