// @targets cc
// @expect pass
// @stdout Ada
// @stdout Grace

const names = ['Ada', 'Grace']
for (let index = 0; index < names.length; index = index + 1) {
  console.log(names[index])
}
