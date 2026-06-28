// @targets cc
// @expect pass
// @stdout Ada

type User = { name: string }
const user: User | null = { name: 'Ada' }
if (user !== null) {
  console.log(user.name)
}
