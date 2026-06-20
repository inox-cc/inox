// @targets c
// @expect pass
// @stdout Ada

type User = {
  name: string
  score: number
}

const user: User = { name: 'Ada', score: 7 }
console.log(user.name)
