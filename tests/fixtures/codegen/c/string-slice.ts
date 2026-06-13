// @targets c
// @expect pass
// @stdout da da A rac ! Ada

type User = {
  name: string
}

function middle(name: string): string {
  return name.slice(1, 3)
}

function getName(): string {
  return 'Grace'
}

const user: User = { name: 'Ada' }
const name = user.name
const message = name + '!'
console.log('Ada'.slice(1, 3), middle(name), user.name.slice(0, 1), getName().slice(1, 4), message.slice(3), name.slice(0, 99))

