// @targets c
// @expect pass

type User = {
  readonly id: number,
  name: string
}

const user: User = { id: 1, name: 'Ada' }
user.name = 'Grace'
console.log(user.name)

