// @targets cc
// @expect pass
// @stdout Ada

type User = {
  name: string
}

const user: User = JSON.parse('{"name":"Ada"}')
console.log(user.name)
