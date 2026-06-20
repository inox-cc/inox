// @targets c
// @expect pass
// @stdout Ada

const names: Set<string> = new Set()
names.add('Ada')
for (const name of names) {
  console.log(name)
}
