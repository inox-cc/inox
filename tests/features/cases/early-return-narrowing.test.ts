// @targets c
// @expect pass
// @stdout Ada

type User = {
  name: string
}

function printName(user: User | null): void {
  if (!user) {
    return
  }

  console.log(user.name)
}

printName({ name: 'Ada' })
