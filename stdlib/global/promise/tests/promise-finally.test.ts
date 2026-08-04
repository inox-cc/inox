// @targets cc
// @expect pass
// @stdout cleanup
// @stdout ok
// @stdout rejected cleanup
// @stdout failed

const value = await Promise.resolve('ok').finally(() => console.log('cleanup'))
console.log(value)

try {
  await Promise.reject('failed').finally(() => console.log('rejected cleanup'))
} catch (error) {
  console.log(error)
}
