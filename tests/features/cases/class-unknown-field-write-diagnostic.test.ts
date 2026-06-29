// @targets cc
// @expect diagnostics INOX_UNKNOWN_FIELD

class User {
  name: string

  constructor(name: string) {
    this.name = name
  }
}

const user = new User('Ada')
user.age = 36
