// @targets cc
// @expect pass
// @stdout none

type User = { name: string }
const user: User | null = null
console.log(user?.name ?? 'none')
