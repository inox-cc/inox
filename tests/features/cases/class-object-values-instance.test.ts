// @targets cc
// @expect pass
// @stdout [Ada, true, 3]

class User {
  name: string
  active: boolean
  score: number

  constructor(name: string, active: boolean, score: number) {
    this.name = name
    this.active = active
    this.score = score
  }
}

const user = new User('Ada', true, 3)
console.log(Object.values(user))
