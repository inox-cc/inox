// @targets c
// @expect pass
// @stdout Grace
// @stdout Ada

const names = ['Ada', 'Grace']
for (let index = names.length - 1; index >= 0; index = index - 1) {
  console.log(names[index])
}
