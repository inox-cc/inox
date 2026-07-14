// @targets cc
// @expect pass
// @stdout 1

type User = { name: string }
const user: User | undefined = undefined

console.log(user?.name === undefined)
