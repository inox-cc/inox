// @targets cc
// @expect diagnostics INOX_C_CLASS

class User {
  name: string

  constructor(name: string) {
    this.name = name
  }
}

const field = 'name'
const user = new User('Ada')
user[field] = 'Grace'
