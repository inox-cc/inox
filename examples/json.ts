// @targets c
// @expect pass
// @stdout Ada 7 {"name":"Ada"} 8 1

type User = {
  name: string
}

const user: User = JSON.parse('{"name":"Ada"}')
const userName: string = JSON.parse('"Ada"')
const userScore: number = JSON.parse('7')
const parsedScore: number = JSON.parse('8')
const active: boolean = JSON.parse('true')
const text = JSON.stringify(user)

console.log(userName, userScore, text, parsedScore, active)
