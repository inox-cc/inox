// @targets c
// @expect diagnostic
// @diagnostic CCJS_C_COLLECTION

type User = {
  name: string
}

const users: Set<User> = new Set()
const user: User = { name: 'Ada' }
users.add(user)

