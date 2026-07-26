// @targets cc
// @expect pass
// @stderr Object.values failed

const source = '1'
const value = JSON.parse(source)

try {
  console.log(Object.values(value)[0])
} catch (error) {
  console.error(error)
}
