// @targets cc
// @expect pass
// @stdout "Grace"

class User {
  name: string

  constructor(name: string) {
    this.name = name
  }

  toJSON(): string {
    return 'Grace'
  }
}

const user = new User('Ada')
console.log(JSON.stringify(user))
