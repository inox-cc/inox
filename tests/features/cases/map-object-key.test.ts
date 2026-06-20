// @targets c
// @expect pass
// @stdout Ada

const user = { name: 'Ada' }
const names: Map<object, string> = new Map()
names.set(user, 'Ada')
console.log(names.get(user) ?? '')
