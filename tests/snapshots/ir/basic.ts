type User = {
  readonly id: number,
  name: string
}

function greet(user: User): void {
  console.log(`hello ${user.name}`)
}

const user: User = { id: 1, name: 'Ada' }
greet(user)

