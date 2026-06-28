// @targets cc
// @expect diagnostics INOX_ASSIGN_READONLY_FIELD

class User {
  readonly name: string

  constructor(name: string) {
    this.name = name
  }
}

const user = new User('Ada')
user.name = 'Grace'
