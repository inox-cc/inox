// @targets cc
// @expect pass
// @stdout Ada

type User = {
  name: string
}

const user: User | null = { name: 'Ada' }
if (user) {
  console.log(user.name)
}
