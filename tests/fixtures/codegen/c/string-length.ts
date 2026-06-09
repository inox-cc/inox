// @targets c
// @expect pass
// @stdout 3 3 3 5 4

type User = {
  name: string
}

function length(name: string): number {
  return name.length
}

function getName(): string {
  return 'Grace'
}

export function main(): void {
  const user: User = { name: 'Ada' }
  const name = user.name
  const message = name + '!'
  console.log('Ada'.length, length(name), user.name.length, getName().length, message.length)
}
