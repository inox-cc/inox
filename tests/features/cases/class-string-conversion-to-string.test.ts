// @targets cc
// @expect pass
// @stdout Ada

class User {
  name: string

  constructor(name: string) {
    this.name = name
  }

  toString(): string {
    return this.name
  }
}

const user = new User('Ada')
console.log(String(user))
