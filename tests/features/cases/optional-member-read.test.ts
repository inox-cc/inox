// @targets cc
// @expect pass
// @stdout Ada

type User = { name: string }
const user: User | null = { name: 'Ada' }
console.log(user?.name ?? 'none')
