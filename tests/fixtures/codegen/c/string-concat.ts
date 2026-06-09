// @targets c
// @expect pass
// @stdout Ada Grace!

type User = {
  name: string
}

function getName(): string {
  return 'Grace'
}

export function main(): void {
  const user: User = { name: 'Ada' }
  const name = user.name
  const message = name + ' ' + getName() + '!'
  console.log(message)
}
