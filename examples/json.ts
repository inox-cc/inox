// @targets c
// @expect pass
// @stdout Ada 7 {"name":"Ada","score":7} 8 1

type User = {
  name: string
  score: number
}

const user: User = JSON.parse('{"score":7,"name":"Ada"}')
const parsedScore: number = JSON.parse('8')
const active: boolean = JSON.parse('true')
const text = JSON.stringify(user)

console.log(user.name, user.score, text, parsedScore, active)
