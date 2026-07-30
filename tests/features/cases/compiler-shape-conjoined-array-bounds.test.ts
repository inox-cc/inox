// @targets cc
// @expect pass
// @stdout a1

const names = ['a']
const values = [1]

for (let index = 0; index < names.length && index < values.length; index = index + 1) {
  console.log(`${names[index]}${values[index]}`)
}
