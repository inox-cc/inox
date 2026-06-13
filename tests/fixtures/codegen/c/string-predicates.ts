// @targets c
// @expect pass
// @stdout 1 1 1 1 1 0

type User = {
  name: string
}

function hasAda(name: string): boolean {
  return name.includes('d') && name.startsWith('A') && name.endsWith('a')
}

function getName(): string {
  return 'Grace'
}

const user: User = { name: 'Ada' }
const name = user.name
const message = name + '!'
console.log('Ada'.includes('d'), hasAda(name), user.name.startsWith('A'), getName().endsWith('e'), message.endsWith('!'), name.includes('z'))

