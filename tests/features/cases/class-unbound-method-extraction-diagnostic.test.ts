// @targets cc
// @expect diagnostics INOX_C_CLASS

class User {
  name: string

  constructor(name: string) {
    this.name = name
  }

  label(): string {
    return this.name
  }
}

const user = new User('Ada')
const label = user.label
console.log(label())
