// @targets cc
// @expect pass
// @stdout 1

const user = { name: 'Ada' }
const users: Set<object> = new Set()
users.add(user)
console.log(users.has(user))
