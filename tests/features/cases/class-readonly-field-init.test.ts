// @targets cc
// @expect pass
// @stdout Ada

class User {
  readonly name: string

  constructor(name: string) {
    this.name = name
  }
}

const user = new User('Ada')
console.log(user.name)
