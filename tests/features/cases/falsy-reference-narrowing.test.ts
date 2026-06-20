// @targets c
// @expect pass
// @stdout none

type User = {
  name: string
}

const user: User | null = null
if (!user) {
  console.log('none')
}
