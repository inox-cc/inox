// @targets cc
// @expect diagnostics INOX_C_CLASS

class User {
  name: string

  constructor(name: string) {
    this.name = name
  }
}

const user = new User('Ada')
delete user.name
