// @targets c
// @expect pass

type User = {
  name: string
}

const users: Set<User> = new Set()
const user: User = { name: 'Ada' }
users.add(user)
console.log(users.has(user))
