// @targets c
// @expect pass
// @stdout Ada 7 {"name":"Ada","score":7}

type User = {
  name: string,
  score: number
}

export function main(): void {
  const user: User = JSON.parse('{"score":7,"name":"Ada"}')
  const text = JSON.stringify(user)

  console.log(user.name, user.score, text)
}
