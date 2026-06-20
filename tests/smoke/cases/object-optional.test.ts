// @targets c
// @expect pass
// @stdout missing

type User = {
  name: string
}

const user: User | null = null

console.log(user?.name ?? 'missing')
